const CONTACTS_KEY = 'chakram_contacts'
const SENDS_KEY    = 'chakram_sends'

// ── Address book ──────────────────────────────────────────────────────────────

export const getContacts = () => {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) || '{}') } catch { return {} }
}

export const saveContact = (address, name) => {
  const c = getContacts()
  c[address] = { name: name.trim(), addedAt: c[address]?.addedAt || Date.now() }
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(c))
}

export const deleteContact = address => {
  const c = getContacts()
  delete c[address]
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(c))
}

export const getContactName = address => getContacts()[address]?.name || null

// ── Sent transaction history (client-side, UTXO model has no sent history) ───

export const getSends = () => {
  try { return JSON.parse(localStorage.getItem(SENDS_KEY) || '[]') } catch { return [] }
}

export const trackSend = ({ txid, to, amount, fee, timestamp }) => {
  const sends = [{ txid, to, amount, fee, timestamp }, ...getSends()].slice(0, 100)
  localStorage.setItem(SENDS_KEY, JSON.stringify(sends))
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#f97316','#8b5cf6','#06b6d4','#10b981','#f43f5e','#3b82f6','#eab308']

export const avatarColor = address =>
  AVATAR_COLORS[parseInt(address.slice(-4), 16) % AVATAR_COLORS.length]

export const initials = name =>
  (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
