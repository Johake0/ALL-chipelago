import { publicFetch } from '../api.js'

export const getState = () => publicFetch('/api/state')

export const spin = (userId) =>
  publicFetch('/api/spin', { method: 'POST', body: JSON.stringify({ userId }) })

export const completeGame = (userId, gameId) =>
  publicFetch('/api/complete', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

export const addToLobby = (userId, gameId) =>
  publicFetch('/api/lobby/add', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

export const returnFromLobby = (userId, gameId) =>
  publicFetch('/api/lobby/return', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

export const claimInterest = (userId, gameId) =>
  publicFetch('/api/claim-interest', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

export const trade = (userId, gameId, targetUserId, targetGameId) =>
  publicFetch('/api/trade', { method: 'POST', body: JSON.stringify({ userId, gameId, targetUserId, targetGameId }) })

export const force = (userId, gameId, targetUserId) =>
  publicFetch('/api/force', { method: 'POST', body: JSON.stringify({ userId, gameId, targetUserId }) })

export const release = (userId, gameId) =>
  publicFetch('/api/release', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

export const reroll = (userId, gameId) =>
  publicFetch('/api/reroll', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

export const getActivity = () => publicFetch('/api/activity')

export const gift = (userId, targetUserId, amount) =>
  publicFetch('/api/gift', { method: 'POST', body: JSON.stringify({ userId, targetUserId, amount }) })

export const setReady = (userId, ready) =>
  publicFetch('/api/session/ready', { method: 'POST', body: JSON.stringify({ userId, ready }) })

export const placeBid = (userId, action, amount) =>
  publicFetch('/api/session/bid', { method: 'POST', body: JSON.stringify({ userId, action, amount }) })

export const finalizeBid = (userId) =>
  publicFetch('/api/session/finalize-bid', { method: 'POST', body: JSON.stringify({ userId }) })
