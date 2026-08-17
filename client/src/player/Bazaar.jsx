import TradePanel from './TradePanel.jsx'
import ForcePanel from './ForcePanel.jsx'
import ReleasePanel from './ReleasePanel.jsx'
import RerollPanel from './RerollPanel.jsx'
import GiftPanel from './GiftPanel.jsx'

export default function Bazaar({ me, players, onTrade, onForce, onRelease, onReroll, onGift, freeRerolls, busy }) {
  return (
    <section className="panel bazaar-panel">
      <h2>Bazaar</h2>
      <div className="bazaar-grid">
        <TradePanel me={me} players={players} onTrade={onTrade} busy={busy} />
        <ForcePanel me={me} players={players} onForce={onForce} busy={busy} />
        <ReleasePanel me={me} onRelease={onRelease} busy={busy} />
        <RerollPanel me={me} onReroll={onReroll} freeRerolls={freeRerolls} busy={busy} />
        <GiftPanel me={me} players={players} onGift={onGift} busy={busy} />
      </div>
    </section>
  )
}
