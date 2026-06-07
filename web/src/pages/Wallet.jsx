import { useState, useEffect, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { QRCodeSVG } from 'qrcode.react'
import { useTheme } from '../context/ThemeContext.jsx'
import chakramLogo from '../assets/chakram.png'
import QRScanner from '../components/QRScanner.jsx'
import {
  getContacts, saveContact, deleteContact, getContactName,
  getSends, trackSend, avatarColor, initials,
} from '../lib/contacts.js'
import {
  CASH, FEE, fmt,
  sha256, entToMn, walletFromSeed, walletFromMn,
  addrToPkh, validAddr,
  encSeed, decSeed,
  loadW, storeW, clearW,
  getInfo, getBal, getUTXOs, postTx,
  buildSignTx, b64d, b64e,
} from '../lib/walletCrypto.js'
import { BIP39 } from '../lib/bip39.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const timeAgo = ts => {
  const d = Math.floor(Date.now() / 1000) - ts
  if (d < 5)     return 'just now'
  if (d < 60)    return d + 's ago'
  if (d < 3600)  return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [t, setT] = useState({ msg: '', type: '', show: false })
  const timer = useRef(null)
  const toast = useCallback((msg, type = '') => {
    clearTimeout(timer.current)
    setT({ msg, type, show: true })
    timer.current = setTimeout(() => setT(s => ({ ...s, show: false })), 3000)
  }, [])
  return [t, toast]
}

function Toast({ msg, type, show }) {
  const base = 'border-border bg-surface text-text'
  const ok   = 'border-green/40 bg-greenbg text-green'
  const err  = 'border-red/40 bg-redbg text-red'
  return (
    <div style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }} className={`fixed left-1/2 -translate-x-1/2 z-[9998] px-5 py-2.5 rounded-2xl border shadow-lg text-sm font-medium transition-all duration-200 max-w-[300px] text-center pointer-events-none
      ${show ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}
      ${type === 'ok' ? ok : type === 'err' ? err : base}`}>
      {msg}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, address, size = 40 }) {
  const color = avatarColor(address || name || '?')
  const text  = initials(name || address?.slice(3, 5) || '?')
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {text}
    </div>
  )
}

// ── Password modal ────────────────────────────────────────────────────────────

function PwModal({ title, sub, onConfirm, onCancel, loading }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const ref = useRef()
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60) }, [])

  async function go() {
    setErr('')
    try { await onConfirm(pw) }
    catch { setErr('Incorrect password') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 animate-scale-in">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-6 sm:hidden" />
        <h3 className="font-bold text-text text-lg mb-1">{title}</h3>
        <p className="text-muted text-sm mb-5 leading-relaxed">{sub}</p>
        <input
          ref={ref} type="password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="Wallet password"
          className="w-full bg-surface2 border border-border text-text placeholder-muted text-sm px-4 py-3 rounded-xl outline-none focus:border-gold transition-all mb-2"
        />
        {err && <p className="text-red text-xs mb-2">{err}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-border text-text text-sm font-semibold">Cancel</button>
          <button onClick={go} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-gold hover:bg-golddim text-white text-sm font-bold disabled:opacity-40 transition-colors">
            {loading ? 'Checking…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save contact modal ────────────────────────────────────────────────────────

function SaveContactModal({ address, onSave, onSkip }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 animate-scale-in">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-6 sm:hidden" />
        <div className="flex justify-center mb-4">
          <Avatar name={name || address} address={address} size={56} />
        </div>
        <h3 className="font-bold text-text text-lg text-center mb-1">Save this address?</h3>
        <p className="text-muted text-xs text-center mb-5 font-mono">{address.slice(0, 20)}…</p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSave(address, name)}
          placeholder="Enter a name (e.g. Rahul, Mom)"
          autoFocus
          className="w-full bg-surface2 border border-border text-text placeholder-muted text-sm px-4 py-3 rounded-xl outline-none focus:border-gold transition-all mb-4"
        />
        <button
          disabled={!name.trim()}
          onClick={() => onSave(address, name)}
          className="w-full py-3 rounded-xl bg-gold hover:bg-golddim text-white font-bold text-sm mb-2 disabled:opacity-40 transition-colors"
        >
          Save Contact
        </button>
        <button onClick={onSkip} className="w-full py-3 rounded-xl text-muted text-sm font-medium">
          Not now
        </button>
      </div>
    </div>
  )
}

// ── Mnemonic reveal modal ─────────────────────────────────────────────────────

function MnModal({ words, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-6 sm:hidden" />
        <h3 className="font-bold text-text text-lg mb-1">Recovery Phrase</h3>
        <p className="text-muted text-sm mb-5">Keep this private. Anyone with these words controls your funds.</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {words.map((w, i) => (
            <div key={i} className="bg-surface2 border border-border rounded-xl px-3 py-2 flex items-center gap-2 select-all">
              <span className="text-muted text-[10px] w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="text-text text-xs font-mono font-medium">{w}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-xl border border-border text-text font-semibold text-sm">Done</button>
      </div>
    </div>
  )
}

// ── Bottom tab icons ──────────────────────────────────────────────────────────

const Icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  pay: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </svg>
  ),
  receive: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <polyline points="19 12 12 19 5 12"/>
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
}

// ── Home tab ──────────────────────────────────────────────────────────────────

function HomeTab({ address, balance, network, utxos, onSend, onReceive, onScan, onTabChange }) {
  const contacts = getContacts()
  const sends    = getSends().slice(0, 5)
  const recent   = utxos?.slice(0, 3) || []

  const recentPeople = [
    ...Object.entries(contacts).map(([addr, c]) => ({ address: addr, name: c.name })),
    ...sends.filter(s => !contacts[s.to]).map(s => ({ address: s.to, name: null })),
  ].slice(0, 8)

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {/* Balance card */}
      <div className="mx-4 mt-4 rounded-3xl p-6 text-black shadow-lg"
        style={{ background: 'linear-gradient(135deg, #f0c040 0%, #c47f17 100%)' }}>
        <p className="text-sm font-medium opacity-70 mb-1">Total Balance</p>
        <p className="text-4xl font-black tracking-tight leading-none">
          {balance !== null ? fmt(balance) : '—'}
        </p>
        <p className="text-lg font-semibold opacity-70 mt-0.5">CHK</p>
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs opacity-60 font-mono">{address?.slice(0, 16)}…</p>
          {network && (
            <span className="text-[10px] font-bold uppercase bg-black/15 px-2 py-0.5 rounded-full">
              {network}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 px-4 mt-5">
        {[
          { icon: Icons.pay,    label: 'Pay',     color: 'bg-blue/10 text-blue',    action: () => onTabChange('pay') },
          { icon: Icons.receive,label: 'Receive', color: 'bg-green/10 text-green',  action: onReceive },
          { icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <path d="M14 14h.01M14 18h.01M18 14h.01M18 18h.01M18 21v-3m-4 3v-3"/>
            </svg>
          ), label: 'Scan QR', color: 'bg-orange/10 text-orange', action: onScan },
        ].map(({ icon, label, color, action }) => (
          <button key={label} onClick={action}
            className="bg-surface border border-border rounded-2xl py-4 flex flex-col items-center gap-2 shadow-sm active:scale-95 transition-transform">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color}`}>{icon}</div>
            <span className="text-xs font-semibold text-text">{label}</span>
          </button>
        ))}
      </div>

      {/* Pay again */}
      {recentPeople.length > 0 && (
        <div className="mt-6 px-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-text">Pay again</p>
            <button onClick={() => onTabChange('pay')} className="text-xs text-gold font-semibold">See all</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {recentPeople.map(({ address: addr, name }) => (
              <button key={addr} onClick={() => onSend(addr)}
                className="flex flex-col items-center gap-1.5 shrink-0 active:scale-95 transition-transform">
                <Avatar name={name || addr} address={addr} size={48} />
                <p className="text-[11px] text-text font-medium max-w-[56px] truncate">
                  {name || addr.slice(3, 8) + '…'}
                </p>
              </button>
            ))}
            <button onClick={() => onTabChange('pay')}
              className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-12 h-12 rounded-full bg-surface2 border border-border flex items-center justify-center">
                <span className="text-xl text-muted">+</span>
              </div>
              <p className="text-[11px] text-muted">New</p>
            </button>
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="mt-6 px-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-text">Recent activity</p>
            <button onClick={() => onTabChange('activity')} className="text-xs text-gold font-semibold">See all</button>
          </div>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm divide-y divide-border">
            {recent.map((u, i) => {
              const name = getContactName(address)
              const label = u.is_coinbase ? '⛏ Mining reward' : 'Received'
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${u.is_coinbase ? 'bg-goldbg' : 'bg-greenbg'}`}>
                    <span className="text-base">{u.is_coinbase ? '⛏' : '↓'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text">{label}</p>
                    <p className="text-xs text-muted">Block #{u.block_height}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green">+{u.value_chk?.toFixed(4)}</p>
                    <p className="text-[10px] text-muted">CHK</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Pay tab ───────────────────────────────────────────────────────────────────

function PayTab({ balance, myAddress, pubKeyHash, seedRef, onSuccess, showToast }) {
  const [to,        setTo]        = useState('')
  const [amt,       setAmt]       = useState('')
  const [toErr,     setToErr]     = useState('')
  const [sendErr,   setSendErr]   = useState('')
  const [sending,   setSending]   = useState(false)
  const [scanning,  setScanning]  = useState(false)
  const [pwModal,   setPwModal]   = useState(null)
  const [saveModal, setSaveModal] = useState(null)
  const [contacts,  setContacts]  = useState(() => getContacts())
  const [search,    setSearch]    = useState('')
  const pendingSend = useRef(null)

  const refreshContacts = () => setContacts(getContacts())

  const isAddressEntered = to.startsWith('CK1') && to.length >= 25
  const preview = (() => {
    const a = parseFloat(amt)
    if (!isAddressEntered || !amt || isNaN(a) || a <= 0) return null
    const c = Math.round(a * CASH)
    return { cash: c, send: fmt(c), total: fmt(c + FEE) }
  })()

  function selectContact(addr) {
    setTo(addr)
    setSearch('')
  }

  async function initSend() {
    const toAddr = to.trim()
    setToErr(''); setSendErr('')
    if (!validAddr(toAddr))  { setToErr('Invalid CK1 address'); return }
    if (toAddr === myAddress){ setToErr('Cannot send to yourself'); return }
    const a = parseFloat(amt)
    if (isNaN(a) || a <= 0) { setSendErr('Enter a valid amount'); return }
    const cash = Math.round(a * CASH)
    if (balance !== null && cash + FEE > balance) { setSendErr('Insufficient balance'); return }
    pendingSend.current = { to: toAddr, cash }
    if (seedRef.current) { await execSend(seedRef.current) }
    else { setPwModal({ title: 'Confirm Payment', sub: `Send ${fmt(cash)} CHK to ${getContactName(toAddr) || toAddr.slice(0, 14)}…` }) }
  }

  async function execSend(seed) {
    const { to: toAddr, cash } = pendingSend.current
    setSending(true); setSendErr('')
    try {
      const utxos = await getUTXOs(myAddress)
      const { tx, txIDHex } = await buildSignTx(utxos, toAddr, cash, seed, pubKeyHash)
      await postTx(tx)
      trackSend({ txid: txIDHex, to: toAddr, amount: cash, fee: FEE, timestamp: Math.floor(Date.now() / 1000) })
      showToast('Payment sent!', 'ok')
      setTo(''); setAmt(''); pendingSend.current = null
      if (!getContactName(toAddr)) setSaveModal(toAddr)
      else onSuccess()
    } catch (e) { setSendErr(e.message) }
    finally { setSending(false) }
  }

  async function handlePw(pw) {
    const data = loadW()
    const seed = await decSeed(data.ct, data.salt, data.iv, pw)
    seedRef.current = seed
    setPwModal(null)
    await execSend(seed)
  }

  const contactList = Object.entries(contacts)
    .filter(([addr, c]) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || addr.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a[1].name.localeCompare(b[1].name))

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {scanning && (
        <QRScanner
          onScan={data => { setScanning(false); if (data.startsWith('CK1')) setTo(data) }}
          onClose={() => setScanning(false)}
        />
      )}

      <div className="px-4 pt-4">
        <p className="text-sm font-bold text-text mb-3">Send CHK</p>

        {/* To field */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-3 shadow-sm">
          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">To</p>
          <div className="flex items-center gap-2">
            <input
              value={to}
              onChange={e => { setTo(e.target.value); setToErr('') }}
              placeholder="CK1 address or search contacts…"
              className="flex-1 text-sm text-text placeholder-muted bg-transparent outline-none font-mono"
            />
            <button onClick={() => setScanning(true)}
              className="w-9 h-9 rounded-xl bg-surface2 border border-border flex items-center justify-center shrink-0 active:scale-95 transition-transform">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-muted">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <path d="M14 14h.01M14 18h.01M18 14h.01M18 18h.01M18 21v-3m-4 3v-3"/>
              </svg>
            </button>
          </div>
          {toErr && <p className="text-red text-xs mt-1.5">{toErr}</p>}
        </div>

        {/* Contact picker (when no address entered yet) */}
        {!isAddressEntered && (
          <div>
            {contactList.length > 0 && (
              <>
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Saved contacts</p>
                <div className="flex gap-4 overflow-x-auto pb-2 mb-4">
                  {contactList.map(([addr, c]) => (
                    <button key={addr} onClick={() => selectContact(addr)}
                      className="flex flex-col items-center gap-1.5 shrink-0 active:scale-95 transition-transform">
                      <Avatar name={c.name} address={addr} size={48} />
                      <p className="text-[11px] text-text font-medium max-w-[56px] truncate">{c.name}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
            {contactList.length === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">👥</p>
                <p className="text-muted text-sm">No saved contacts yet</p>
                <p className="text-muted text-xs mt-1">Enter an address above or scan a QR code</p>
              </div>
            )}
          </div>
        )}

        {/* Amount + send (when address is entered) */}
        {isAddressEntered && (
          <>
            {/* Contact card */}
            <div className="flex items-center gap-3 mb-4 bg-surface2 border border-border rounded-2xl p-3">
              <Avatar name={getContactName(to) || to} address={to} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text">{getContactName(to) || 'Unknown'}</p>
                <p className="text-xs text-muted font-mono truncate">{to}</p>
              </div>
              <button onClick={() => setTo('')} className="text-muted text-lg leading-none">✕</button>
            </div>

            {/* Amount */}
            <div className="bg-surface border border-border rounded-2xl p-4 mb-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Amount</p>
                <button onClick={() => setAmt(fmt(Math.max(0, (balance || 0) - FEE)))}
                  className="text-[10px] font-bold text-gold uppercase tracking-widest">MAX</button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" step="0.000001"
                  value={amt} onChange={e => setAmt(e.target.value)}
                  placeholder="0.000000"
                  className="flex-1 text-2xl font-bold text-text bg-transparent outline-none"
                />
                <span className="text-base font-bold text-muted">CHK</span>
              </div>
              <p className="text-xs text-muted mt-2">Available: {balance !== null ? fmt(balance) : '—'} CHK</p>
            </div>

            {/* Preview */}
            {preview && (
              <div className="bg-surface2 border border-border rounded-2xl p-4 mb-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted">
                  <span>You send</span><span className="text-text font-medium">{preview.send} CHK</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Network fee</span><span className="text-text font-medium">0.001000 CHK</span>
                </div>
                <div className="flex justify-between font-bold pt-1.5 border-t border-border">
                  <span className="text-text">Total</span>
                  <span className="text-gold">{preview.total} CHK</span>
                </div>
              </div>
            )}

            {sendErr && <p className="text-red text-sm mb-3">{sendErr}</p>}

            <button onClick={initSend} disabled={sending || !preview}
              className="w-full py-4 rounded-2xl bg-gold hover:bg-golddim text-white font-bold text-base disabled:opacity-40 transition-colors shadow-md active:scale-[0.98]">
              {sending ? 'Sending…' : 'Send Payment'}
            </button>
          </>
        )}
      </div>

      {pwModal && (
        <PwModal title={pwModal.title} sub={pwModal.sub}
          onConfirm={handlePw}
          onCancel={() => { setPwModal(null); pendingSend.current = null }}
        />
      )}

      {saveModal && (
        <SaveContactModal
          address={saveModal}
          onSave={(addr, name) => { saveContact(addr, name); refreshContacts(); setSaveModal(null); onSuccess() }}
          onSkip={() => { setSaveModal(null); onSuccess() }}
        />
      )}
    </div>
  )
}

// ── Receive tab ───────────────────────────────────────────────────────────────

function ReceiveTab({ address, showToast }) {
  const { dark } = useTheme()
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <p className="text-sm font-bold text-text mb-6">Your QR Code</p>

      <div className="bg-white p-5 rounded-3xl shadow-lg mb-6">
        <QRCodeSVG
          value={address || ''}
          size={200}
          bgColor="#ffffff"
          fgColor="#1c1917"
          level="M"
        />
      </div>

      <p className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Your Address</p>
      <div className="bg-surface2 border border-border rounded-2xl px-4 py-3 mb-5 w-full">
        <p className="font-mono text-xs text-text break-all text-center leading-relaxed">{address}</p>
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={() => Clipboard.write({ string: address }).then(() => showToast('Address copied!', 'ok')).catch(() => {})}
          className="flex-1 py-3 rounded-2xl bg-gold hover:bg-golddim text-white font-bold text-sm shadow-sm active:scale-[0.98] transition-all"
        >
          Copy Address
        </button>
        {(Capacitor.isNativePlatform() || !!navigator.share) && (
          <button
            onClick={() => Share.share({ title: 'My Chakram Address', text: address })}
            className="flex-1 py-3 rounded-2xl bg-surface2 border border-border text-text font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Share
          </button>
        )}
      </div>

      <p className="text-muted text-xs text-center mt-5 leading-relaxed">
        Share this address to receive CHK payments
      </p>
    </div>
  )
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function ActivityTab({ address, utxos, loading }) {
  const [filter, setFilter] = useState('all')
  const sends = getSends()

  const allItems = [
    ...(utxos || []).map(u => ({
      type: u.is_coinbase ? 'mine' : 'received',
      amount: u.value,
      amountChk: u.value_chk,
      blockHeight: u.block_height,
      mature: u.mature,
      timestamp: null,
      address: null,
      txid: u.txid,
    })),
    ...sends.map(s => ({
      type: 'sent',
      amount: s.amount,
      amountChk: s.amount / CASH,
      blockHeight: null,
      mature: true,
      timestamp: s.timestamp,
      address: s.to,
      txid: s.txid,
    })),
  ].sort((a, b) => (b.blockHeight || 0) - (a.blockHeight || 0) || (b.timestamp || 0) - (a.timestamp || 0))

  const filtered = filter === 'all' ? allItems
    : filter === 'received' ? allItems.filter(i => i.type === 'received' || i.type === 'mine')
    : allItems.filter(i => i.type === 'sent')

  const typeConfig = {
    mine:     { icon: '⛏', bg: 'bg-goldbg',   label: 'Mining reward', amtClass: 'text-gold' },
    received: { icon: '↓',  bg: 'bg-greenbg',  label: 'Received',      amtClass: 'text-green' },
    sent:     { icon: '↑',  bg: 'bg-surface3', label: 'Sent',          amtClass: 'text-text' },
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {/* Filter chips */}
      <div className="flex gap-2 px-4 pt-4 pb-3">
        {['all', 'received', 'sent'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              filter === f ? 'bg-gold text-white shadow-sm' : 'bg-surface2 border border-border text-muted'
            }`}>
            {f === 'all' ? 'All' : f === 'received' ? 'Received' : 'Sent'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-border border-t-gold rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center px-8">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-text font-semibold mb-1">No transactions yet</p>
          <p className="text-muted text-sm">Your activity will appear here</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="px-4 space-y-1">
          {filtered.map((item, i) => {
            const cfg = typeConfig[item.type]
            const contactName = item.address ? getContactName(item.address) : null
            const sign = item.type === 'sent' ? '−' : '+'
            return (
              <div key={i} className="bg-surface border border-border rounded-2xl flex items-center gap-3 px-4 py-3 shadow-sm">
                <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center text-base shrink-0`}>
                  {item.type !== 'sent' ? cfg.icon : (
                    item.address ? <Avatar name={contactName || item.address} address={item.address} size={40} /> : cfg.icon
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text">
                    {item.type === 'sent'
                      ? (contactName || (item.address ? 'To ' + item.address.slice(0, 10) + '…' : 'Sent'))
                      : cfg.label}
                  </p>
                  <p className="text-xs text-muted">
                    {item.blockHeight ? `Block #${item.blockHeight}` : item.timestamp ? timeAgo(item.timestamp) : '—'}
                    {item.type === 'mine' && !item.mature && ' · Maturing…'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${cfg.amtClass}`}>
                    {sign}{item.amountChk?.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-muted">CHK</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Settings modal ────────────────────────────────────────────────────────────

function SettingsModal({ address, onRevealPhrase, onRemoveWallet, onClose }) {
  const [contacts, setContacts]   = useState(() => getContacts())
  const [editing, setEditing]     = useState(null)
  const [editName, setEditName]   = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden animate-scale-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <h3 className="font-bold text-text text-base">Settings</h3>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Address */}
          <div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Wallet Address</p>
            <p className="bg-surface2 border border-border rounded-xl px-3 py-2.5 font-mono text-xs text-text break-all">{address}</p>
          </div>

          {/* Contacts management */}
          <div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Saved Contacts</p>
            {Object.keys(contacts).length === 0 ? (
              <p className="text-muted text-sm">No contacts saved yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(contacts).map(([addr, c]) => (
                  <div key={addr} className="flex items-center gap-3 bg-surface2 border border-border rounded-xl px-3 py-2.5">
                    <Avatar name={c.name} address={addr} size={32} />
                    {editing === addr ? (
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && editName.trim()) {
                            saveContact(addr, editName); setContacts(getContacts()); setEditing(null)
                          }
                        }}
                        autoFocus
                        className="flex-1 bg-transparent outline-none text-sm text-text border-b border-gold"
                      />
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text">{c.name}</p>
                        <p className="text-xs text-muted font-mono truncate">{addr.slice(0, 16)}…</p>
                      </div>
                    )}
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setEditing(addr); setEditName(c.name) }}
                        className="text-[11px] text-muted hover:text-gold font-medium">Edit</button>
                      <button onClick={() => { deleteContact(addr); setContacts(getContacts()) }}
                        className="text-[11px] text-red font-medium">Del</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security */}
          <div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Security</p>
            <button onClick={onRevealPhrase}
              className="w-full py-3 rounded-xl border border-border text-text text-sm font-semibold mb-2 text-left px-4">
              🔑  Reveal Recovery Phrase
            </button>
          </div>

          {/* Danger */}
          <div className="border-t border-border pt-4">
            <button onClick={onRemoveWallet}
              className="w-full py-3 rounded-xl border border-red/30 text-red text-sm font-semibold">
              Remove Wallet from Browser
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Wallet app (after login) ─────────────────────────────────────────────

function WalletApp({ state, onLock, onRemove, showToast }) {
  const { address, pubKeyHash } = state
  const seedRef = useRef(state.seed)
  useEffect(() => { seedRef.current = state.seed }, [state.seed])

  const { dark, toggle } = useTheme()

  const [tab,         setTab]       = useState('home')
  const [balance,     setBalance]   = useState(null)
  const [network,     setNetwork]   = useState('')
  const [utxos,       setUtxos]     = useState([])
  const [utxosLoading,setUL]        = useState(true)
  const [pwModal,     setPwModal]   = useState(null)
  const [mnModal,     setMnModal]   = useState(false)
  const [settings,    setSettings]  = useState(false)
  const [sendTo,      setSendTo]    = useState(null)
  const [pwLoading,   setPwLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([
        fetch('/address/' + address).then(r => r.json()),
        fetch('/utxos/' + address).then(r => r.json()),
      ])
      setBalance(d.balance)
      setUtxos(Array.isArray(u) ? u : [])
    } catch {}
    finally { setUL(false) }
  }, [address])

  useEffect(() => {
    refresh()
    fetch('/info').then(r => r.json()).then(d => setNetwork(d.network || '')).catch(() => {})
    const t = setInterval(refresh, 15_000)
    return () => clearInterval(t)
  }, [refresh])

  function handleScanAddress(addr) {
    setSendTo(addr)
    setTab('pay')
  }

  async function handleRevealPhrase() {
    setSettings(false)
    if (seedRef.current) {
      setMnModal(loadW()?.mn?.split(' ') || [])
    } else {
      setPwModal({ action: 'mnemonic', title: 'Reveal Recovery Phrase', sub: 'Enter your password to view your recovery phrase.' })
    }
  }

  async function handlePw(pw) {
    setPwLoading(true)
    try {
      const data = loadW()
      const seed = await decSeed(data.ct, data.salt, data.iv, pw)
      seedRef.current = seed
      setPwModal(null); setPwLoading(false)
      if (pwModal?.action === 'mnemonic') setMnModal(data.mn.split(' '))
    } catch (e) { setPwLoading(false); throw e }
  }

  const TABS = [
    { id: 'home',     label: 'Home',    icon: Icons.home     },
    { id: 'pay',      label: 'Pay',     icon: Icons.pay      },
    { id: 'receive',  label: 'Receive', icon: Icons.receive  },
    { id: 'activity', label: 'Activity',icon: Icons.activity },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-surface border-b border-border px-4 h-13 flex items-center justify-between shrink-0">
        <img src={chakramLogo} alt="" className="h-7 w-auto" />
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="w-8 h-8 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface2 transition-colors text-sm">↻</button>
          <button onClick={toggle} className="w-8 h-8 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface2 transition-colors text-sm">
            {dark ? '☀' : '🌙'}
          </button>
          <button onClick={() => setSettings(true)} className="w-8 h-8 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface2 transition-colors text-sm">⚙</button>
          <button onClick={onLock} className="text-xs text-muted hover:text-text border border-border hover:border-gold px-3 py-1.5 rounded-xl transition-colors">Lock</button>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'home' && (
        <HomeTab
          address={address} balance={balance} network={network} utxos={utxos}
          onSend={addr => { setSendTo(addr); setTab('pay') }}
          onReceive={() => setTab('receive')}
          onScan={() => setTab('pay')}
          onTabChange={setTab}
        />
      )}
      {tab === 'pay' && (
        <PayTab
          balance={balance} myAddress={address} pubKeyHash={pubKeyHash} seedRef={seedRef}
          initialTo={sendTo}
          onSuccess={() => { setSendTo(null); refresh(); setTab('home') }}
          showToast={showToast}
        />
      )}
      {tab === 'receive' && (
        <ReceiveTab address={address} showToast={showToast} />
      )}
      {tab === 'activity' && (
        <ActivityTab address={address} utxos={utxos} loading={utxosLoading} />
      )}

      {/* Bottom tab bar */}
      <div className="bg-surface border-t border-border shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setSendTo(null); setTab(t.id) }}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                tab === t.id ? 'text-gold' : 'text-muted hover:text-text'
              }`}>
              {t.icon}
              <span className="text-[10px] font-semibold">{t.label}</span>
              {tab === t.id && <div className="w-1 h-1 rounded-full bg-gold mt-0.5" />}
            </button>
          ))}
        </div>
      </div>

      {settings && (
        <SettingsModal
          address={address}
          onRevealPhrase={handleRevealPhrase}
          onRemoveWallet={() => {
            if (!confirm('Remove wallet from this browser?\n\nMake sure you have your recovery phrase saved.')) return
            clearW(); onRemove()
          }}
          onClose={() => setSettings(false)}
        />
      )}

      {pwModal && (
        <PwModal title={pwModal.title} sub={pwModal.sub} loading={pwLoading}
          onConfirm={handlePw}
          onCancel={() => setPwModal(null)}
        />
      )}
      {mnModal && <MnModal words={mnModal} onClose={() => setMnModal(false)} />}
    </div>
  )
}

// ── Onboarding: Welcome ───────────────────────────────────────────────────────

function WelcomeScreen({ onNew, onRestore }) {
  const { dark, toggle } = useTheme()
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-bg">
      <button onClick={toggle} className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface border border-border transition-colors text-sm">
        {dark ? '☀' : '🌙'}
      </button>
      <div className="w-full max-w-[320px]">
        <div className="flex flex-col items-center mb-10">
          <img src={chakramLogo} alt="Chakram" className="h-16 w-auto mb-3" />
          <p className="text-muted text-sm tracking-wide">ചക്രം · Kerala's Digital Currency</p>
        </div>
        <button onClick={onNew}
          className="w-full py-4 rounded-2xl bg-gold hover:bg-golddim text-white font-bold text-base mb-3 shadow-md active:scale-[0.98] transition-all">
          Create New Wallet
        </button>
        <button onClick={onRestore}
          className="w-full py-4 rounded-2xl bg-surface border border-border text-text font-semibold text-base active:scale-[0.98] transition-all hover:border-gold">
          Restore from Phrase
        </button>
        <p className="text-center text-muted text-xs mt-6">Open-source · Ed25519 · UTXO model</p>
      </div>
    </div>
  )
}

// ── Onboarding: Create ────────────────────────────────────────────────────────

function StepDots({ total, current }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i < current ? 'w-4 bg-green' : i === current ? 'w-4 bg-gold' : 'w-1.5 bg-border'}`} />
      ))}
    </div>
  )
}

function CreateScreen({ onBack, onCreated, showToast }) {
  const [step,    setStep]    = useState(0)
  const [words,   setWords]   = useState([])
  const [checked, setChecked] = useState(false)
  const [pw,      setPw]      = useState('')
  const [pw2,     setPw2]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ent = crypto.getRandomValues(new Uint8Array(16))
    const seed = sha256(ent)
    const mn = entToMn(ent)
    sessionStorage.setItem('_s', b64e(seed)); sessionStorage.setItem('_mn', mn)
    const { pkh, address } = walletFromSeed(seed)
    sessionStorage.setItem('_a', address); sessionStorage.setItem('_pkh', b64e(pkh))
    setWords(mn.split(' '))
  }, [])

  const pwOk = pw.length >= 8 && pw === pw2

  async function create() {
    if (!pwOk) return
    setLoading(true)
    try {
      const seed = b64d(sessionStorage.getItem('_s'))
      const mn   = sessionStorage.getItem('_mn')
      const addr = sessionStorage.getItem('_a')
      const pkh  = b64d(sessionStorage.getItem('_pkh'))
      const { ct, salt, iv } = await encSeed(seed, pw)
      storeW(addr, mn, ct, salt, iv)
      sessionStorage.clear()
      onCreated({ address: addr, seed, pubKeyHash: pkh })
    } catch (e) { showToast(e.message, 'err'); setLoading(false) }
  }

  const inputCls = 'w-full bg-surface2 border border-border text-text placeholder-muted text-sm px-4 py-3 rounded-xl outline-none focus:border-gold transition-all mb-3'

  return (
    <div className="flex-1 overflow-y-auto p-5 bg-bg">
      <button onClick={onBack} className="text-muted text-sm hover:text-gold mb-5 block">← Back</button>

      {step === 0 && (
        <>
          <StepDots total={2} current={0} />
          <h2 className="text-xl font-bold text-text mb-1">Recovery Phrase</h2>
          <p className="text-muted text-sm mb-5 leading-relaxed">Write these 12 words down in order. This is the <strong className="text-text">only</strong> way to recover your wallet.</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {words.map((w, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl px-3 py-2 flex items-center gap-2 shadow-sm">
                <span className="text-muted text-[10px] w-4 shrink-0">{i+1}</span>
                <span className="text-text text-xs font-mono font-semibold select-all">{w}</span>
              </div>
            ))}
          </div>
          <div className="bg-orange/8 border border-orange/25 rounded-xl p-3 text-orange text-xs mb-5 leading-relaxed">
            ⚠ Never share your recovery phrase. Store it offline — never in a screenshot or cloud.
          </div>
          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-gold shrink-0" />
            <span className="text-muted text-sm">I've written down all 12 words in order</span>
          </label>
          <button disabled={!checked} onClick={() => setStep(1)}
            className="w-full py-4 rounded-2xl bg-gold hover:bg-golddim text-white font-bold text-sm disabled:opacity-40 shadow-md transition-all">
            Continue →
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <StepDots total={2} current={1} />
          <h2 className="text-xl font-bold text-text mb-1">Set Password</h2>
          <p className="text-muted text-sm mb-5">Encrypts your wallet locally. Required to send transactions.</p>
          <input type="password" value={pw}  onChange={e => setPw(e.target.value)}  placeholder="Minimum 8 characters" className={inputCls} />
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm password"   className={inputCls} />
          {pw2 && pw !== pw2 && <p className="text-red text-xs -mt-2 mb-3">Passwords do not match</p>}
          <p className="text-muted text-xs mb-5">Forgot it? You can always restore from your recovery phrase.</p>
          <button disabled={!pwOk || loading} onClick={create}
            className="w-full py-4 rounded-2xl bg-gold hover:bg-golddim text-white font-bold disabled:opacity-40 shadow-md transition-all">
            {loading ? 'Creating Wallet…' : 'Create Wallet'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Onboarding: Restore ───────────────────────────────────────────────────────

function RestoreScreen({ onBack, onRestored, showToast }) {
  const [wordInputs, setWordInputs] = useState(Array(12).fill(''))
  const [pw, setPw]   = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const setWord = (i, v) => setWordInputs(prev => { const n = [...prev]; n[i] = v; return n })
  const wordBorder = w => !w ? 'border-border' : BIP39.includes(w.trim().toLowerCase()) ? 'border-green' : 'border-red'

  async function restore() {
    setErr('')
    const ws = wordInputs.map(w => w.trim().toLowerCase())
    const blanks = ws.map((w, i) => !w ? i + 1 : null).filter(Boolean)
    if (blanks.length) { setErr('Missing words: ' + blanks.join(', ')); return }
    if (pw !== pw2) { setErr('Passwords do not match'); return }
    if (pw.length < 8) { setErr('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const { seed, pkh, address } = walletFromMn(ws.join(' '))
      const { ct, salt, iv } = await encSeed(seed, pw)
      storeW(address, ws.join(' '), ct, salt, iv)
      onRestored({ address, seed, pubKeyHash: pkh })
    } catch (e) { setErr(e.message); setLoading(false) }
  }

  const inputCls = 'w-full bg-surface2 border border-border text-text placeholder-muted text-sm px-4 py-3 rounded-xl outline-none focus:border-gold transition-all mb-3'

  return (
    <div className="flex-1 overflow-y-auto p-5 bg-bg">
      <button onClick={onBack} className="text-muted text-sm hover:text-gold mb-5 block">← Back</button>
      <h2 className="text-xl font-bold text-text mb-1">Restore Wallet</h2>
      <p className="text-muted text-sm mb-5">Enter your 12-word recovery phrase in order.</p>
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {wordInputs.map((w, i) => (
          <div key={i} className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted text-[9px] select-none">{i+1}</span>
            <input value={w} onChange={e => setWord(i, e.target.value)}
              autoComplete="off" autoCorrect="off" spellCheck={false}
              className={`w-full bg-surface2 border text-text text-[11px] font-mono pl-5 pr-1 py-2 rounded-lg outline-none focus:ring-1 focus:ring-gold/30 transition-all ${wordBorder(w)}`}
            />
          </div>
        ))}
      </div>
      {err && <p className="text-red text-xs mb-3">{err}</p>}
      <input type="password" value={pw}  onChange={e => setPw(e.target.value)}  placeholder="New password (min 8 chars)" className={inputCls} />
      <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm password" className={inputCls} />
      <button disabled={loading} onClick={restore}
        className="w-full py-4 rounded-2xl bg-gold hover:bg-golddim text-white font-bold disabled:opacity-40 shadow-md transition-all">
        {loading ? 'Restoring…' : 'Restore Wallet'}
      </button>
    </div>
  )
}

// ── Unlock screen (returning user) ────────────────────────────────────────────

function UnlockScreen({ onUnlock }) {
  const { dark, toggle } = useTheme()
  const [pw, setPw]   = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-bg">
      <button onClick={toggle} className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface border border-border transition-colors text-sm">
        {dark ? '☀' : '🌙'}
      </button>
      <img src={chakramLogo} alt="Chakram" className="h-16 w-auto mb-3" />
      <p className="text-muted text-sm mb-10">Welcome back</p>
      <div className="w-full max-w-[320px]">
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr('') }}
          onKeyDown={e => e.key === 'Enter' && onUnlock(pw, setErr)}
          placeholder="Enter your wallet password" autoFocus
          className="w-full bg-surface border border-border text-text placeholder-muted text-sm px-4 py-3.5 rounded-2xl outline-none focus:border-gold transition-all mb-2 shadow-sm text-center"
        />
        {err && <p className="text-red text-xs mb-2 text-center">{err}</p>}
        <button onClick={() => onUnlock(pw, setErr)}
          className="w-full py-4 rounded-2xl bg-gold hover:bg-golddim text-white font-bold text-base shadow-md active:scale-[0.98] transition-all mt-1">
          Unlock
        </button>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Wallet() {
  const [screen, setScreen] = useState('loading')
  const [ws, setWs]         = useState({ address: null, seed: null, pubKeyHash: null })
  const [toast, showToast]  = useToast()

  useEffect(() => {
    const data = loadW()
    setScreen(data ? 'unlock' : 'welcome')
  }, [])

  async function handleUnlock(pw, setErr) {
    try {
      const data = loadW()
      const seed = await decSeed(data.ct, data.salt, data.iv, pw)
      const pkh  = addrToPkh(data.addr)
      setWs({ address: data.addr, seed, pubKeyHash: pkh })
      setScreen('wallet')
    } catch { setErr('Incorrect password') }
  }

  const toWallet = s => { setWs(s); setScreen('wallet') }
  const lock     = () => { setWs(s => ({ ...s, seed: null })); setScreen('unlock') }
  const remove   = () => { setWs({ address: null, seed: null, pubKeyHash: null }); setScreen('welcome') }

  return (
    <div className="min-h-screen bg-surface2 dark:bg-bg flex justify-center">
      <div className="w-full max-w-[430px] bg-surface dark:bg-surface min-h-screen flex flex-col relative shadow-2xl dark:shadow-none overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {screen === 'loading'  && <div className="flex-1 bg-surface" />}
        {screen === 'welcome'  && <WelcomeScreen  onNew={() => setScreen('create')} onRestore={() => setScreen('restore')} />}
        {screen === 'unlock'   && <UnlockScreen   onUnlock={handleUnlock} />}
        {screen === 'create'   && <CreateScreen   onBack={() => setScreen('welcome')} onCreated={toWallet}  showToast={showToast} />}
        {screen === 'restore'  && <RestoreScreen  onBack={() => setScreen('welcome')} onRestored={toWallet} showToast={showToast} />}
        {screen === 'wallet'   && <WalletApp      state={ws} onLock={lock} onRemove={remove} showToast={showToast} />}
        <Toast {...toast} />
      </div>
    </div>
  )
}
