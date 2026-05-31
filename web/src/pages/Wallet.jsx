import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useTheme } from '../context/ThemeContext.jsx'
import chakramLogo from '../assets/chakram.png'
import { BIP39 } from '../lib/bip39.js'
import {
  CASH, FEE, fmt,
  sha256, entToMn, walletFromSeed, walletFromMn,
  addrToPkh, validAddr,
  encSeed, decSeed,
  loadW, storeW, clearW,
  getInfo, getBal, getUTXOs, postTx,
  buildSignTx, b64d, b64e,
} from '../lib/walletCrypto.js'

// ── Toast ──────────────────────────────────────────────────────────────────────
function useToast() {
  const [t, setT] = useState({ msg: '', type: '', show: false })
  const timer = useRef(null)
  const toast = useCallback((msg, type = '') => {
    clearTimeout(timer.current)
    setT({ msg, type, show: true })
    timer.current = setTimeout(() => setT(s => ({ ...s, show: false })), 3200)
  }, [])
  return [t, toast]
}

function Toast({ msg, type, show }) {
  const colors = { ok: 'border-green bg-greenbg text-green', err: 'border-red bg-redbg text-red', '': 'border-border bg-surface text-text' }
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-xl border shadow-lg text-sm font-medium transition-all duration-200 pointer-events-none max-w-xs text-center
      ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      ${colors[type] || colors['']}`}>
      {msg}
    </div>
  )
}

// ── Shared inputs / buttons ────────────────────────────────────────────────────
const inputCls = 'w-full bg-surface2 border border-border text-text placeholder-muted text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all'

function Field({ label, hint, error, className = '', ...props }) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</label>}
      <input className={inputCls} {...props} />
      {hint  && <p className="text-muted text-xs mt-1">{hint}</p>}
      {error && <p className="text-red  text-xs mt-1">{error}</p>}
    </div>
  )
}

function Btn({ variant = 'primary', full = true, disabled, onClick, children, className = '' }) {
  const base = `${full ? 'w-full' : ''} py-2.5 px-4 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed`
  const v = {
    primary: 'bg-gold hover:bg-golddim text-white shadow-sm',
    outline: 'border border-border hover:border-gold text-text hover:text-gold bg-surface',
    danger:  'border border-red/40 text-red hover:bg-redbg',
  }
  return <button className={`${base} ${v[variant]} ${className}`} disabled={disabled} onClick={onClick}>{children}</button>
}

function StepDots({ total, current }) {
  return (
    <div className="flex gap-1.5 mb-5">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${
          i < current ? 'w-4 bg-green' : i === current ? 'w-4 bg-gold' : 'w-1.5 bg-border'
        }`} />
      ))}
    </div>
  )
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-muted text-xs">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ── Wallet top bar (on wallet screen) ─────────────────────────────────────────
function WalletTopBar({ onRefresh, onLock }) {
  const { dark, toggle } = useTheme()
  return (
    <div className="bg-surface border-b border-border px-4 h-12 flex items-center justify-between">
      <img src={chakramLogo} alt="Chakram" className="h-7 w-auto" />
      <div className="flex items-center gap-2">
        <button onClick={toggle} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface2 transition-colors text-sm">
          {dark ? '☀' : '🌙'}
        </button>
        <button onClick={onRefresh} className="text-xs text-muted hover:text-text border border-border hover:border-gold px-3 py-1.5 rounded-lg transition-colors">↻ refresh</button>
        <button onClick={onLock}    className="text-xs text-muted hover:text-text border border-border hover:border-gold px-3 py-1.5 rounded-lg transition-colors">Lock</button>
      </div>
    </div>
  )
}

// ── Password modal ─────────────────────────────────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 animate-scale-in">
        <h3 className="font-semibold text-text mb-1">{title}</h3>
        <p className="text-muted text-sm mb-4 leading-relaxed">{sub}</p>
        <input ref={ref} type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="Your wallet password"
          className={inputCls + ' mb-2'} />
        {err && <p className="text-red text-xs mb-2">{err}</p>}
        <div className="flex gap-2 mt-3">
          <Btn variant="outline" onClick={onCancel} className="flex-1">Cancel</Btn>
          <Btn disabled={loading} onClick={go} className="flex-1">{loading ? 'Checking…' : 'Confirm'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Mnemonic reveal modal ──────────────────────────────────────────────────────
function MnModal({ words, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-md p-6 animate-scale-in">
        <h3 className="font-semibold text-text mb-1">Recovery Phrase</h3>
        <p className="text-muted text-sm mb-5">Keep this private. Anyone with these words controls your funds.</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {words.map((w, i) => (
            <div key={i} className="bg-surface2 border border-border rounded-lg px-3 py-2 flex items-center gap-2 select-all">
              <span className="text-muted text-[10px] w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="text-text text-xs font-mono font-medium">{w}</span>
            </div>
          ))}
        </div>
        <Btn variant="outline" onClick={onClose}>Done</Btn>
      </div>
    </div>
  )
}

// ── Welcome screen ─────────────────────────────────────────────────────────────
function WelcomeScreen({ onNew, onRestore }) {
  const { dark, toggle } = useTheme()
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      <button onClick={toggle} className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface border border-border transition-colors">
        {dark ? '☀' : '🌙'}
      </button>
      <div className="bg-surface border border-border rounded-2xl p-10 w-full max-w-sm shadow-sm text-center">
        <img src={chakramLogo} alt="Chakram" className="h-14 w-auto mx-auto mb-2" />
        <p className="text-muted text-xs mb-8 tracking-wide">ചക്രം · Kerala's Digital Currency</p>
        <Btn onClick={onNew}>Create New Wallet</Btn>
        <Divider label="or" />
        <Btn variant="outline" onClick={onRestore}>Restore from Phrase</Btn>
      </div>
      <p className="text-muted text-xs mt-6">Open-source · Ed25519 · UTXO</p>
    </div>
  )
}

// ── Create screen ──────────────────────────────────────────────────────────────
function CreateScreen({ onBack, onCreated, toast }) {
  const [step, setStep] = useState(0)
  const [words, setWords] = useState([])
  const [checked, setChecked] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ent = crypto.getRandomValues(new Uint8Array(16))
    const seed = sha256(ent)
    const mn = entToMn(ent)
    sessionStorage.setItem('_s', b64e(seed))
    sessionStorage.setItem('_mn', mn)
    const { pkh, address } = walletFromSeed(seed)
    sessionStorage.setItem('_a', address)
    sessionStorage.setItem('_pkh', b64e(pkh))
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
    } catch (e) { toast(e.message, 'err'); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md shadow-sm">
        <button onClick={onBack} className="text-muted text-xs hover:text-gold transition-colors mb-5 flex items-center gap-1">
          ← back
        </button>

        {step === 0 && (
          <>
            <StepDots total={2} current={0} />
            <h2 className="font-bold text-text text-lg mb-1">Recovery Phrase</h2>
            <p className="text-muted text-sm mb-5 leading-relaxed">
              Write these 12 words down in order. This is the <strong className="text-text">only</strong> way to recover your wallet.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {words.map((w, i) => (
                <div key={i} className="bg-surface2 border border-border rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-muted text-[10px] w-4 shrink-0">{i+1}</span>
                  <span className="text-text text-xs font-mono font-medium select-all">{w}</span>
                </div>
              ))}
            </div>
            <div className="bg-orange/5 border border-orange/25 rounded-xl p-3 text-orange text-xs mb-4 leading-relaxed">
              ⚠ Never share your recovery phrase. Store it offline — never in a screenshot or cloud.
            </div>
            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-gold shrink-0" />
              <span className="text-muted text-sm">I've written down all 12 words in order</span>
            </label>
            <Btn disabled={!checked} onClick={() => setStep(1)}>Continue →</Btn>
          </>
        )}

        {step === 1 && (
          <>
            <StepDots total={2} current={1} />
            <h2 className="font-bold text-text text-lg mb-1">Set Password</h2>
            <p className="text-muted text-sm mb-5">Encrypts your wallet locally. Required to send transactions.</p>
            <Field label="Password" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Minimum 8 characters" />
            <Field label="Confirm Password" type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Repeat password"
              error={pw2 && pw !== pw2 ? 'Passwords do not match' : ''}
              hint="Forgot it? Restore from your recovery phrase." />
            <Btn disabled={!pwOk || loading} onClick={create}>{loading ? 'Creating wallet…' : 'Create Wallet'}</Btn>
          </>
        )}
      </div>
    </div>
  )
}

// ── Restore screen ─────────────────────────────────────────────────────────────
function RestoreScreen({ onBack, onRestored, toast }) {
  const [words, setWords] = useState(Array(12).fill(''))
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const setWord = (i, v) => setWords(prev => { const n = [...prev]; n[i] = v; return n })
  const wordCls = w => {
    if (!w) return 'border-border'
    return BIP39.includes(w.trim().toLowerCase()) ? 'border-green' : 'border-red'
  }

  async function restore() {
    setErr('')
    const ws = words.map(w => w.trim().toLowerCase())
    const blanks = ws.map((w, i) => !w ? i + 1 : null).filter(Boolean)
    if (blanks.length) { setErr('Missing words at position: ' + blanks.join(', ')); return }
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

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md shadow-sm">
        <button onClick={onBack} className="text-muted text-xs hover:text-gold transition-colors mb-5">← back</button>
        <h2 className="font-bold text-text text-lg mb-1">Restore Wallet</h2>
        <p className="text-muted text-sm mb-5">Enter your 12-word recovery phrase in order.</p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {words.map((w, i) => (
            <div key={i} className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-[9px] pointer-events-none select-none">{i+1}</span>
              <input value={w} onChange={e => setWord(i, e.target.value)}
                autoComplete="off" autoCorrect="off" spellCheck={false}
                className={`w-full bg-surface2 border text-text text-xs font-mono pl-5 pr-1 py-2 rounded-lg outline-none focus:ring-1 focus:ring-gold/30 transition-all ${wordCls(w)}`}
              />
            </div>
          ))}
        </div>

        {err && <p className="text-red text-xs mb-3">{err}</p>}
        <Field label="Password"         type="password" value={pw}  onChange={e => setPw(e.target.value)}  placeholder="Minimum 8 characters" />
        <Field label="Confirm Password" type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Repeat password"
          error={pw2 && pw !== pw2 ? 'Passwords do not match' : ''} />
        <Btn disabled={loading} onClick={restore}>{loading ? 'Restoring…' : 'Restore Wallet'}</Btn>
      </div>
    </div>
  )
}

// ── Wallet screen ──────────────────────────────────────────────────────────────
function WalletScreen({ state, onLock, onRemove, toast }) {
  const { address, seed, pubKeyHash } = state
  const [tab,      setTab]      = useState('receive')
  const [balance,  setBalance]  = useState(null)
  const [network,  setNetwork]  = useState('')
  const [to,       setTo]       = useState('')
  const [amt,      setAmt]      = useState('')
  const [toErr,    setToErr]    = useState('')
  const [sendErr,  setSendErr]  = useState('')
  const [sending,  setSending]  = useState(false)
  const [pwModal,  setPwModal]  = useState(null)
  const [mnModal,  setMnModal]  = useState(false)
  const [pwLoading,setPwLoading]= useState(false)

  const pendingSend = useRef(null)
  const seedRef     = useRef(seed)
  useEffect(() => { seedRef.current = seed }, [seed])

  const refreshBal = useCallback(async () => {
    try { const d = await getBal(address); setBalance(d.balance) }
    catch { setBalance(null) }
  }, [address])

  useEffect(() => {
    refreshBal()
    getInfo().then(d => setNetwork(d.network || '')).catch(() => {})
  }, [refreshBal])

  function fillMax() { if (balance !== null) setAmt(fmt(Math.max(0, balance - FEE))) }

  function preview() {
    const a = parseFloat(amt)
    if (!to || !amt || isNaN(a) || a <= 0) return null
    const c = Math.round(a * CASH)
    return { send: fmt(c), total: fmt(c + FEE), cash: c }
  }

  async function initSend() {
    const toAddr = to.trim(); const a = parseFloat(amt)
    setToErr(''); setSendErr('')
    if (!toAddr)             { setToErr('Enter recipient address'); return }
    if (!validAddr(toAddr))  { setToErr('Invalid address'); return }
    if (toAddr === address)  { setToErr('Cannot send to own address'); return }
    if (isNaN(a) || a <= 0) { setSendErr('Enter a valid amount'); return }
    const cash = Math.round(a * CASH), needed = cash + FEE
    if (balance !== null && needed > balance) { setSendErr(`Insufficient balance. Need ${fmt(needed)} CHK`); return }
    pendingSend.current = { to: toAddr, cash }
    if (seedRef.current) { await execSend(seedRef.current) }
    else {
      setPwModal({ title: 'Confirm Send', sub: `Send ${fmt(cash)} CHK to ${toAddr.slice(0, 14)}…`, action: 'send' })
    }
  }

  async function execSend(activeSeed) {
    setSending(true); setSendErr('')
    try {
      const { to: toAddr, cash } = pendingSend.current
      const utxos = await getUTXOs(address)
      const { tx, txIDHex } = await buildSignTx(utxos, toAddr, cash, activeSeed, pubKeyHash)
      await postTx(tx)
      toast('Sent! tx: ' + txIDHex.slice(0, 16) + '…', 'ok')
      setTo(''); setAmt(''); pendingSend.current = null
      await refreshBal()
    } catch (e) { setSendErr(e.message) }
    finally { setSending(false) }
  }

  async function handlePw(pw) {
    setPwLoading(true)
    try {
      const data = loadW()
      const dec = await decSeed(data.ct, data.salt, data.iv, pw)
      seedRef.current = dec
      setPwModal(null); setPwLoading(false)
      if (pwModal.action === 'send') await execSend(dec)
      else if (pwModal.action === 'mnemonic') setMnModal(loadW().mn.split(' '))
    } catch (e) { setPwLoading(false); throw e }
  }

  const p = preview()
  const tabCls = t => `flex-1 py-3 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all ${
    tab === t ? 'text-gold border-gold' : 'text-muted border-transparent hover:text-text'
  }`

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <WalletTopBar onRefresh={refreshBal} onLock={onLock} />

      {/* Balance hero */}
      <div className="bg-surface border-b border-border px-4 pt-6 pb-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest text-center mb-3">Total Balance</p>
        <p className="text-4xl font-bold text-text text-center tabular-nums">
          {balance !== null ? fmt(balance) : '—'}
          <span className="text-muted text-lg font-normal ml-2">CHK</span>
        </p>
        {network && (
          <div className="flex justify-center mt-3">
            <span className="text-xs bg-surface2 border border-border text-muted px-3 py-1 rounded-full">
              {network.charAt(0).toUpperCase() + network.slice(1)}
            </span>
          </div>
        )}
        <div className="mt-4 bg-surface2 border border-border rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="font-mono text-xs text-muted flex-1 truncate">{address}</span>
          <button
            onClick={() => navigator.clipboard.writeText(address).then(() => toast('Copied!', 'ok')).catch(() => toast('Copy failed', 'err'))}
            className="text-xs text-gold hover:underline shrink-0 font-medium"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface border-b border-border sticky top-0 z-10">
        {['receive', 'send', 'settings'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={tabCls(t)}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6">

        {tab === 'receive' && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
              <QRCodeSVG
                value={address}
                size={180}
                bgColor="transparent"
                fgColor="var(--text)"
              />
            </div>
            <div className="bg-surface2 border border-border rounded-xl p-4 font-mono text-xs text-text break-all text-center leading-relaxed w-full">
              {address}
            </div>
            <Btn variant="outline" full={false} onClick={() => navigator.clipboard.writeText(address).then(() => toast('Copied!', 'ok'))}>
              Copy Address
            </Btn>
            <p className="text-muted text-xs text-center">Share this address to receive CHK</p>
          </div>
        )}

        {tab === 'send' && (
          <div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Recipient Address</label>
              <input value={to} onChange={e => { setTo(e.target.value); setToErr('') }}
                placeholder="CK1…" autoComplete="off"
                className={inputCls} />
              {toErr && <p className="text-red text-xs mt-1">{toErr}</p>}
            </div>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Amount (CHK)</label>
                <button onClick={fillMax} className="text-gold text-xs font-semibold hover:underline">MAX</button>
              </div>
              <input type="number" min="0" step="0.000001" value={amt} onChange={e => setAmt(e.target.value)}
                placeholder="0.000000" className={inputCls} />
              <p className="text-muted text-xs mt-1">Available: {balance !== null ? fmt(balance) + ' CHK' : '—'}</p>
            </div>

            <div className="bg-surface2 border border-border rounded-xl p-3 text-xs text-muted mb-4">
              Network fee: <span className="text-text font-medium">0.001000 CHK</span>
            </div>

            {p && (
              <div className="bg-surface2 border border-border rounded-xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted">
                  <span>You send</span><span className="text-text">{p.send} CHK</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Network fee</span><span className="text-text">0.001000 CHK</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-2">
                  <span className="text-muted">Total</span><span className="text-gold">{p.total} CHK</span>
                </div>
              </div>
            )}
            {sendErr && <p className="text-red text-xs mb-3">{sendErr}</p>}
            <Btn disabled={sending} onClick={initSend}>{sending ? 'Sending…' : 'Send CHK'}</Btn>
          </div>
        )}

        {tab === 'settings' && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Wallet Address</p>
            <div className="bg-surface2 border border-border rounded-xl p-4 font-mono text-xs text-text break-all mb-6">{address}</div>

            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Security</p>
            <p className="text-muted text-sm mb-3 leading-relaxed">Your recovery phrase gives full access to your funds. Keep it private.</p>
            <Btn variant="outline" full={false} onClick={() => setPwModal({ title: 'Reveal Recovery Phrase', sub: 'Enter your password to view your recovery phrase.', action: 'mnemonic' })}>
              Reveal Recovery Phrase
            </Btn>

            <div className="border-t border-border mt-8 pt-6">
              <p className="text-xs font-semibold text-red uppercase tracking-wider mb-3">Danger Zone</p>
              <Btn variant="danger" full={false} onClick={() => {
                if (!confirm('Remove this wallet from this browser?\n\nMake sure you have your recovery phrase saved.')) return
                clearW(); onRemove()
              }}>
                Remove Wallet from Browser
              </Btn>
            </div>
          </div>
        )}
      </div>

      {pwModal && (
        <PwModal title={pwModal.title} sub={pwModal.sub} loading={pwLoading}
          onConfirm={handlePw}
          onCancel={() => { setPwModal(null); pendingSend.current = null }} />
      )}
      {mnModal && <MnModal words={mnModal} onClose={() => setMnModal(false)} />}
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function Wallet() {
  const [screen, setScreen] = useState('loading')
  const [ws, setWs] = useState({ address: null, seed: null, pubKeyHash: null })
  const [toast, showToast] = useToast()

  useEffect(() => {
    const data = loadW()
    if (data) {
      try {
        const pkh = addrToPkh(data.addr)
        setWs({ address: data.addr, seed: null, pubKeyHash: pkh })
        setScreen('wallet')
      } catch { setScreen('welcome') }
    } else {
      setScreen('welcome')
    }
  }, [])

  const toWallet = s => { setWs(s); setScreen('wallet') }
  const lock     = () => setWs(s => ({ ...s, seed: null }))
  const remove   = () => { setWs({ address: null, seed: null, pubKeyHash: null }); setScreen('welcome') }

  return (
    <>
      {screen === 'loading'  && <div className="min-h-screen bg-bg" />}
      {screen === 'welcome'  && <WelcomeScreen  onNew={() => setScreen('create')} onRestore={() => setScreen('restore')} />}
      {screen === 'create'   && <CreateScreen   onBack={() => setScreen('welcome')} onCreated={toWallet}  toast={showToast} />}
      {screen === 'restore'  && <RestoreScreen  onBack={() => setScreen('welcome')} onRestored={toWallet} toast={showToast} />}
      {screen === 'wallet'   && <WalletScreen   state={ws} onLock={lock} onRemove={remove} toast={showToast} />}
      <Toast {...toast} />
    </>
  )
}
