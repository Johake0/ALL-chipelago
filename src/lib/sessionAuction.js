import Game from '../models/Game.js';
import Session from '../models/Session.js';
import { pickBonusGame } from './bonusGame.js';

// "Does anyone care at all" window from auction open — see CLAUDE.md's
// Auction design note. No cron/queue infra exists in this app, so this
// isn't a timer; it's a lazy check run opportunistically (see
// resolveStaleAuction below) whenever something reads session state.
export const NO_BID_TIMEOUT_MS = 5 * 60 * 1000;

// Shared by the 5-minute timeout and POST /api/session/bid (when a round
// thins out to zero remaining active bidders): puts the auctioned game back
// into general circulation and lets the session proceed without a winner —
// everyone keeps playing whatever they originally brought into the Lobby.
// mongoSession is optional — omit it for the lazy read-time check (not
// worth opening a transaction for an opportunistic cleanup on every GET
// /api/state), pass it when called from inside an existing transaction.
export async function resolveAuctionNoInterest(dbSession, mongoSession) {
  let query = Game.findById(dbSession.auction.gameId);
  if (mongoSession) query = query.session(mongoSession);
  const auctionGame = await query;
  if (auctionGame) {
    auctionGame.status = 'available';
    await auctionGame.save(mongoSession ? { session: mongoSession } : undefined);
  }
  dbSession.auction.status = 'no_interest';
  dbSession.status = 'active';
  await dbSession.save(mongoSession ? { session: mongoSession } : undefined);
}

// Called at the top of GET /api/state. No-ops unless there's an open
// auction that's had zero meet/raise activity since it opened and the
// 5-minute window has passed.
export async function resolveStaleAuction() {
  const dbSession = await Session.findOne({ status: 'auction' });
  if (!dbSession?.auction || dbSession.auction.status !== 'open') return;
  const { auction } = dbSession;
  const neverBid = auction.metUserIds.length === 0 && auction.droppedOutUserIds.length === 0;
  const expired = auction.openedAt && Date.now() - new Date(auction.openedAt).getTime() > NO_BID_TIMEOUT_MS;
  if (neverBid && expired) {
    await resolveAuctionNoInterest(dbSession);
  }
}

// Called from /api/complete and /api/release whenever the game just
// finished/released had a sessionId — checks whether any other member of
// that session still has an active Lobby entry. If not, this was the last
// one: close the session, release every member's held-back coins
// (sessionPending -> false, picked up on the next computeUserStats read
// since nothing here is stored), and fire the Bonus Game reroll trigger
// (b) for anyone whose session slot was an auction win.
export async function closeSessionIfDone(sessionId, mongoSession) {
  const stillPlaying = await Game.findOne({ sessionId, status: 'lobby' }).session(mongoSession);
  if (stillPlaying) return;

  const dbSession = await Session.findById(sessionId).session(mongoSession);
  if (!dbSession || dbSession.status === 'closed') return;

  dbSession.status = 'closed';
  dbSession.closedAt = new Date();
  await dbSession.save({ session: mongoSession });

  await Game.updateMany({ sessionId }, { $set: { sessionPending: false } }, { session: mongoSession });

  // pickBonusGame isn't threaded through mongoSession (nothing else in this
  // codebase threads it through Bonus Game reads/writes either — see
  // /api/spin). withTransaction() can in principle retry this callback on a
  // transient error, which could re-run this lottery an extra time; harmless
  // since re-rolling it is just as valid a random pick as the first attempt.
  const auctionWinners = await Game.find({ sessionId, auctionWon: true }).session(mongoSession);
  for (const g of auctionWinners) {
    await pickBonusGame(g.ownerId);
  }
}
