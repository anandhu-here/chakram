import { hashes, getPublicKey, sign } from '@noble/ed25519'
import { ripemd160 }                  from '@noble/hashes/legacy.js'
import { sha256 as _sha256, sha512 }  from '@noble/hashes/sha2.js'
import { pbkdf2Async }                from '@noble/hashes/pbkdf2.js'
import { gcm }                        from '@noble/ciphers/aes.js'
import { BIP39 }                      from './bip39.js'

// v3: set sync sha512 via hashes (etc is frozen in v3)
hashes.sha512 = sha512

// ── Constants ─────────────────────────────────────────────────────────────────
export const CASH   = 1_000_000
export const FEE    = 1_000
export const PREFIX = 'CK1'
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

// ── Byte helpers ──────────────────────────────────────────────────────────────
export const b64e = b => btoa(String.fromCharCode(...b))
export const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))
export const hex2b = s => { const a = new Uint8Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16); return a }
export const b2hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

// ── SHA256 / HASH160 ──────────────────────────────────────────────────────────
export const sha256 = d => _sha256(d instanceof Uint8Array ? d : new Uint8Array(d))
export const h160   = d => ripemd160(sha256(d))

// ── Base58 ────────────────────────────────────────────────────────────────────
function b58enc(b) {
  let z = 0; for (const x of b) { if (x === 0) z++; else break }
  let n = 0n; for (const x of b) n = n * 256n + BigInt(x)
  let s = ''; while (n > 0n) { const m = n % 58n; s = B58[Number(m)] + s; n /= 58n }
  return B58[0].repeat(z) + s
}
function b58dec(s) {
  let z = 0; for (const c of s) { if (c === B58[0]) z++; else break }
  let n = 0n
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('Bad base58: ' + c); n = n * 58n + BigInt(i) }
  let h = n.toString(16); if (h.length % 2) h = '0' + h
  const o = new Uint8Array(z + h.length / 2)
  for (let i = 0; i < h.length / 2; i++) o[z + i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return o
}

// ── Address ───────────────────────────────────────────────────────────────────
export function pkhToAddr(pkh) {
  const cs = sha256(sha256(pkh)).slice(0, 4)
  const p = new Uint8Array(24); p.set(pkh); p.set(cs, 20)
  return PREFIX + b58enc(p)
}
export function addrToPkh(addr) {
  if (!addr.startsWith(PREFIX)) throw new Error('Address must start with CK1')
  const d = b58dec(addr.slice(PREFIX.length))
  if (d.length !== 24) throw new Error('Invalid address length')
  const pkh = d.slice(0, 20), cs = d.slice(20)
  const exp = sha256(sha256(pkh)).slice(0, 4)
  for (let i = 0; i < 4; i++) if (cs[i] !== exp[i]) throw new Error('Bad address checksum')
  return pkh
}
export const validAddr = a => { try { addrToPkh(a); return true } catch { return false } }

// ── Mnemonic ──────────────────────────────────────────────────────────────────
export function entToMn(ent) {
  const h = sha256(ent), cs = h[0] >> 4
  let n = BigInt('0x' + b2hex(ent))
  n = (n << 4n) | BigInt(cs)
  const w = new Array(12)
  for (let i = 11; i >= 0; i--) { w[i] = BIP39[Number(n & 0x7FFn)]; n >>= 11n }
  return w.join(' ')
}
export function mnToEnt(mn) {
  const parts = mn.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0)
  if (parts.length !== 12) throw new Error('Need exactly 12 words, got ' + parts.length)
  const idx = new Map(BIP39.map((w, i) => [w, i]))
  let n = 0n
  for (const w of parts) {
    const i = idx.get(w)
    if (i === undefined) throw new Error('Unknown word: "' + w + '"')
    n = (n << 11n) | BigInt(i)
  }
  const cs = Number(n & 0xFn), ent = n >> 4n
  const h = ent.toString(16).padStart(32, '0')
  const eb = new Uint8Array(16)
  for (let i = 0; i < 16; i++) eb[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  const hash = sha256(eb)
  if (cs !== (hash[0] >> 4)) throw new Error('Mnemonic checksum mismatch — check your words')
  return eb
}

// ── Key derivation ────────────────────────────────────────────────────────────
export function walletFromSeed(seed) {
  const pub = getPublicKey(seed)
  const pkh = h160(pub)
  return { seed, pub, pkh, address: pkhToAddr(pkh) }
}
export const walletFromMn = mn => walletFromSeed(sha256(mnToEnt(mn)))

// ── Encryption ────────────────────────────────────────────────────────────────
export async function encSeed(seed, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await pbkdf2Async(_sha256, new TextEncoder().encode(pw), salt, { c: 150000, dkLen: 32 })
  const ct   = gcm(key, iv).encrypt(seed)
  return { ct, salt, iv }
}
export async function decSeed(ctB, saltB, ivB, pw) {
  const ct = b64d(ctB), salt = b64d(saltB), iv = b64d(ivB)
  const key = await pbkdf2Async(_sha256, new TextEncoder().encode(pw), salt, { c: 150000, dkLen: 32 })
  try { return gcm(key, iv).decrypt(ct) }
  catch { throw new Error('Wrong password') }
}

// ── Storage ───────────────────────────────────────────────────────────────────
const WKEY = 'chakram_wallet'
export const storeW = (addr, mn, ct, salt, iv) =>
  localStorage.setItem(WKEY, JSON.stringify({ v: 1, addr, mn, ct: b64e(ct), salt: b64e(salt), iv: b64e(iv) }))
export const loadW  = () => { const r = localStorage.getItem(WKEY); return r ? JSON.parse(r) : null }
export const clearW = () => localStorage.removeItem(WKEY)

// ── RPC ───────────────────────────────────────────────────────────────────────
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const rpc = async (p, o) => {
  const r = await fetch(BASE + p, o)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d
}
export const getInfo  = ()     => rpc('/info')
export const getBal   = addr   => rpc('/address/' + addr)
export const getUTXOs = addr   => rpc('/utxos/' + addr)
export const postTx   = tx     => rpc('/tx/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tx) })

// ── Transaction ───────────────────────────────────────────────────────────────
function txID(tx) {
  const p = []
  p.push(new Uint8Array([0]))
  for (const inp of tx.Inputs) {
    p.push(b64d(inp.TxID))
    const b = new ArrayBuffer(4); new DataView(b).setUint32(0, inp.OutputIndex, true); p.push(new Uint8Array(b))
  }
  for (const out of tx.Outputs) {
    const b = new ArrayBuffer(8); new DataView(b).setBigUint64(0, BigInt(out.Value), true); p.push(new Uint8Array(b))
    p.push(b64d(out.PublicKeyHash))
  }
  const tb = new ArrayBuffer(8); new DataView(tb).setBigInt64(0, BigInt(tx.Timestamp), true); p.push(new Uint8Array(tb))
  const tot = p.reduce((a, x) => a + x.length, 0)
  const data = new Uint8Array(tot); let off = 0
  for (const x of p) { data.set(x, off); off += x.length }
  return sha256(sha256(data))
}

export async function buildSignTx(utxos, toAddr, amtCash, seed, senderPKH) {
  const needed = amtCash + FEE
  const sel = []; let total = 0
  for (const u of utxos) { if (!u.mature) continue; if (total < needed) { sel.push(u); total += u.value } }
  if (total < needed) throw new Error('Need ' + fmt(needed) + ' CHK, mature balance is ' + fmt(total) + ' CHK')
  const inputs = sel.map(u => ({
    TxID: b64e(hex2b(u.txid)), OutputIndex: u.output_index,
    Signature: b64e(new Uint8Array(64)), PublicKey: b64e(new Uint8Array(32)),
  }))
  const toPKH = addrToPkh(toAddr)
  const outputs = [{ Value: amtCash, PublicKeyHash: b64e(toPKH) }]
  const change = total - amtCash - FEE
  if (change > 0) outputs.push({ Value: change, PublicKeyHash: b64e(senderPKH) })
  const tx = { TxID: '', Inputs: inputs, Outputs: outputs, Timestamp: Math.floor(Date.now() / 1000), IsCoinbase: false }
  const idBytes = txID(tx)
  tx.TxID = b64e(idBytes)
  const pub = getPublicKey(seed)
  for (let i = 0; i < inputs.length; i++) {
    const tid = b64d(inputs[i].TxID)
    const ib = new ArrayBuffer(4); new DataView(ib).setUint32(0, inputs[i].OutputIndex, true)
    const pre = new Uint8Array(tid.length + 4); pre.set(tid); pre.set(new Uint8Array(ib), tid.length)
    const msg = sha256(pre)
    tx.Inputs[i].Signature = b64e(sign(msg, seed))
    tx.Inputs[i].PublicKey  = b64e(pub)
  }
  return { tx, txIDHex: b2hex(idBytes) }
}

export const fmt = c => (c / CASH).toFixed(6)
