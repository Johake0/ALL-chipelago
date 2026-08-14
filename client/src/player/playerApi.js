import { publicFetch } from '../api.js'

export const getState = () => publicFetch('/api/state')

export const spin = (userId) =>
  publicFetch('/api/spin', { method: 'POST', body: JSON.stringify({ userId }) })

export const completeGame = (userId, gameId) =>
  publicFetch('/api/complete', { method: 'POST', body: JSON.stringify({ userId, gameId }) })

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
