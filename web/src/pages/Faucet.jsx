import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

const STORAGE_KEY = 'chakram_faucet_requests'
const COOLDOWN_MS = 24 * 60 * 60 * 1000

const timeAgo = ts => {
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60) return d + 's ago'
  if (d < 3600) return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}
const trunc = (s, n = 22) => s?.length > n ? s.slice(0, n) + '…' : s

const loadReqs  = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
const saveReqs  = r  => localStorage.setItem(STORAGE_KEY, JSON.stringify(r))
const lastReq   = a  => loadReqs().find(r => r.address === a) || null
const addReq    = a  => { const r = loadReqs().filter(x => x.address !== a); r.unshift({ address: a, timestamp: Date.now(), amount: 10 }); saveReqs(r.slice(0, 20)) }

export default function Faucet() {
  const [addr,    setAddr]    = useState('')
  const [result,  setResult]  = useState(null)
  const [history, setHistory] = useState([])
  const [supply,  setSupply]  = useState(null)

  useEffect(() => {
    setHistory(loadReqs().slice(0, 5))
    fetch('/info').then(r => r.json()).then(d => setSupply((d.total_supply_mined / 1_000_000).toFixed(2))).catch(() => {})
  }, [])

  function submit() {
    setResult(null)
    const a = addr.trim()
    if (!a) return setResult({ type: 'error', msg: 'Please enter a CK1 address.' })
    if (!a.startsWith('CK1') || a.length < 25 || a.length > 40)
      return setResult({ type: 'error', msg: 'Invalid address — must start with CK1.' })
    const last = lastReq(a)
    if (last) {
      const elapsed = Date.now() - last.timestamp
      if (elapsed < COOLDOWN_MS) {
        const h = Math.ceil((COOLDOWN_MS - elapsed) / 3_600_000)
        return setResult({ type: 'cooldown', msg: `This address was already requested within 24h. Try again in ~${h} hour${h !== 1 ? 's' : ''}.` })
      }
    }
    addReq(a)
    setHistory(loadReqs().slice(0, 5))
    setAddr('')
    setResult({ type: 'success', msg: `Request submitted! The faucet will send 10 testnet CHK to ${a}. Funds typically arrive within a few minutes.` })
  }

  const resultConfig = {
    success: { bg: 'bg-greenbg border-green/30', text: 'text-green', icon: '✓' },
    error:   { bg: 'bg-redbg  border-red/30',   text: 'text-red',   icon: '✕' },
    cooldown:{ bg: 'bg-goldbg border-gold/30',   text: 'text-gold',  icon: '⏳' },
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar right={
        <div className="flex gap-2">
          <span className="bg-greenbg text-green border border-green/30 text-[10px] font-bold px-2.5 py-1 rounded-full">FAUCET</span>
          <span className="bg-orange/10 text-orange border border-orange/30 text-[10px] font-bold px-2.5 py-1 rounded-full">TESTNET</span>
        </div>
      } />

      <div className=" mx-auto px-4 sm:px-6 py-12">

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-goldbg border border-gold/30 mb-4 text-2xl">💧</div>
          <h1 className="text-3xl font-bold text-text mb-2">Testnet Faucet</h1>
          <p className="text-muted">Get free testnet CHK — no sign-up, no fees</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-surface rounded-xl border border-border p-5 text-center shadow-sm">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-1">CHK Distributed</p>
            <p className="text-xl font-bold text-text tabular-nums">{supply ?? '—'} <span className="text-muted text-sm font-normal">CHK</span></p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5 text-center shadow-sm">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-1">Your Requests</p>
            <p className="text-xl font-bold text-text tabular-nums">
              {loadReqs().filter(r => Date.now() - r.timestamp < COOLDOWN_MS).length}
              <span className="text-muted text-sm font-normal"> today</span>
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-text mb-1">Request Testnet CHK</h2>
          <p className="text-muted text-sm mb-4">Enter a valid CK1 address. Limited to once per address per 24 hours.</p>
          <div className="flex gap-3 mb-3">
            <input
              value={addr}
              onChange={e => setAddr(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="CK1…"
              className="flex-1 bg-surface2 border border-border text-text placeholder-muted text-sm px-4 py-2.5 rounded-lg outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all font-mono"
            />
            <button
              onClick={submit}
              className="bg-gold hover:bg-golddim text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap shadow-sm"
            >
              Request 10 CHK
            </button>
          </div>
          <p className="text-muted text-xs">
            Don't have an address?{' '}
            <Link to="/wallet" className="text-gold hover:underline font-medium">Create one in the wallet →</Link>
          </p>
          {result && (
            <div className={`mt-4 flex gap-3 items-start p-4 rounded-xl border text-sm ${resultConfig[result.type].bg} ${resultConfig[result.type].text}`}>
              <span className="shrink-0 font-bold">{resultConfig[result.type].icon}</span>
              <span className="leading-relaxed">{result.msg}</span>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-text mb-4">How it works</h2>
          <div className="space-y-4">
            {[
              ['Submit', 'Enter your CK1 address and click Request 10 CHK.'],
              ['Review', 'The faucet operator reviews requests and sends CHK from the miner wallet.'],
              ['Receive', 'Check your balance in the wallet — funds arrive within a few minutes.'],
              ['Test',   'Use CHK to test transactions on the Chakram testnet. These coins have no real-world value.'],
            ].map(([step, desc], i) => (
              <div key={i} className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-goldbg border border-gold/30 text-gold text-xs font-bold flex items-center justify-center shrink-0">{i+1}</div>
                <div>
                  <p className="font-medium text-text text-sm">{step}</p>
                  <p className="text-muted text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-text mb-4">Your recent requests</h2>
          {history.length === 0 ? (
            <p className="text-muted text-sm text-center py-4">No requests yet</p>
          ) : (
            <div className="divide-y divide-border">
              {history.map((r, i) => (
                <div key={i} className="flex justify-between items-center py-3 text-sm">
                  <span className="font-mono text-xs text-muted">{trunc(r.address)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-green font-semibold text-xs">+{r.amount} CHK</span>
                    <span className="text-muted text-xs">{timeAgo(r.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-muted text-xs">Chakram Testnet Faucet — Built with ❤️ in Kerala</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/"       className="text-gold text-xs hover:underline">Explorer</Link>
          <Link to="/wallet" className="text-gold text-xs hover:underline">Wallet</Link>
          <a href="https://github.com/anandhu-here/chakram" target="_blank" rel="noopener" className="text-gold text-xs hover:underline">GitHub ↗</a>
        </div>
      </footer>
    </div>
  )
}
