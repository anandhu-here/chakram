import { useState, useEffect, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar.jsx'
import LiveChain from '../components/LiveChain.jsx'

const api = async path => {
  const r = await fetch(path)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

function timeAgo(ts) {
  const d = Math.floor(Date.now() / 1000) - ts
  if (d < 5)     return 'just now'
  if (d < 60)    return d + 's ago'
  if (d < 3600)  return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}
const trunc = (s, n = 16) => s && s.length > n ? s.slice(0, n) + '…' : s
const fmtSupply = v => {
  const c = v / 1_000_000
  if (c >= 1_000_000) return (c / 1_000_000).toFixed(2) + 'M'
  if (c >= 1000)      return (c / 1000).toFixed(1) + 'K'
  return c.toFixed(2)
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function Stat({ label, value, sub }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-bold text-text tabular-nums leading-none">{value ?? '—'}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

// ── Shared modal shell ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-text text-sm tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function KV({ label, value }) {
  return (
    <div className="flex gap-4 py-2 border-b border-border last:border-0 text-sm">
      <span className="text-muted w-28 shrink-0 text-xs pt-0.5">{label}</span>
      <span className="font-mono text-xs text-text break-all flex-1">{value}</span>
    </div>
  )
}

// ── Block detail modal ─────────────────────────────────────────────────────────
function BlockModal({ height, onClose }) {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)
  useEffect(() => {
    api('/block/' + height).then(setData).catch(e => setErr(e.message))
  }, [height])

  return (
    <Modal title={`Block #${height.toLocaleString()}`} onClose={onClose}>
      {err   && <p className="text-red text-sm">{err}</p>}
      {!data && !err && <p className="text-muted text-sm">Loading…</p>}
      {data && (
        <>
          <div className="mb-5">
            <KV label="Hash"       value={data.hash} />
            <KV label="Prev Hash"  value={data.previous_hash} />
            <KV label="Timestamp"  value={new Date(data.timestamp * 1000).toUTCString()} />
            <KV label="Difficulty" value={data.difficulty} />
            <KV label="Nonce"      value={data.nonce.toLocaleString()} />
            <KV label="Txs"        value={data.tx_count} />
          </div>

          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Transactions</p>
          {(data.transactions || []).map(tx => (
            <div key={tx.txid} className="bg-surface2 rounded-xl border border-border p-4 mb-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {tx.is_coinbase && (
                  <span className="bg-goldbg text-gold text-[10px] font-bold px-2 py-0.5 rounded-full border border-gold/30">COINBASE</span>
                )}
                <span className="font-mono text-xs text-muted break-all">{tx.txid}</span>
              </div>
              {tx.outputs?.length > 0 && (
                <div className="space-y-1 mt-2">
                  {tx.outputs.map((out, i) => (
                    <div key={i} className="flex justify-between items-center text-xs py-1">
                      <span className="font-mono text-green">{trunc(out.pubkey_hash, 24)}</span>
                      <span className="font-mono font-semibold text-gold ml-4 shrink-0">{out.value_chk?.toFixed(6)} CHK</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}

// ── Address modal ──────────────────────────────────────────────────────────────
function AddressModal({ address, onClose }) {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)
  useEffect(() => {
    api('/address/' + encodeURIComponent(address)).then(setData).catch(e => setErr(e.message))
  }, [address])

  return (
    <Modal title="Address" onClose={onClose}>
      {err   && <p className="text-red text-sm">{err}</p>}
      {!data && !err && <p className="text-muted text-sm">Loading…</p>}
      {data && (
        <>
          <KV label="Address"    value={data.address} />
          <KV label="Balance"    value={`${data.balance_chk?.toFixed(6)} CHK`} />
          <KV label="Raw"        value={`${data.balance.toLocaleString()} Cash`} />
          <KV label="UTXOs"      value={data.utxo_count} />
        </>
      )}
    </Modal>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Explorer() {
  const [info,      setInfo]     = useState(null)
  const [blocks,    setBlocks]   = useState([])
  const [bpm,       setBpm]      = useState(null)
  const [online,    setOnline]   = useState(false)
  const [status,    setStatus]   = useState('Connecting…')
  const [genesis,   setGenesis]  = useState(null)
  const [network,   setNetwork]  = useState(null)
  const [modal,     setModal]    = useState(null)
  const [search,    setSearch]   = useState('')
  const [searchErr, setSearchErr]= useState('')

  const known = useRef(new Set())
  const gRef  = useRef(null)

  const refresh = useCallback(async () => {
    let infoD, blocksD
    try {
      [infoD, blocksD] = await Promise.all([api('/info'), api('/blocks/latest/20')])
    } catch {
      setOnline(false); setStatus('Node unreachable'); return
    }
    setOnline(true); setStatus('Online')
    setInfo(infoD)
    setNetwork((infoD.network || 'mainnet').toLowerCase())

    if (blocksD.length >= 2) {
      const sl   = blocksD.slice(0, Math.min(10, blocksD.length))
      const span = sl[0].timestamp - sl[sl.length - 1].timestamp
      if (span > 0) setBpm(((sl.length - 1) / span * 60).toFixed(2))
    }

    if (!gRef.current) {
      try { const g = await api('/block/0'); gRef.current = g.hash; setGenesis(g.hash) } catch {}
    }

    const newB = blocksD.filter(b => !known.current.has(b.height))
    if (newB.length > 0) {
      newB.forEach(b => known.current.add(b.height))
      setBlocks(prev =>
        [...newB].sort((a, b) => b.height - a.height).concat(prev).slice(0, 20)
      )
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  async function doSearch() {
    const q = search.trim(); setSearchErr('')
    if (!q) return
    if (/^\d+$/.test(q)) { setModal({ type: 'block', key: parseInt(q, 10) }); return }
    if (/^[0-9a-fA-F]{64}$/.test(q)) {
      try { const b = await api('/block/hash/' + q); setModal({ type: 'block', key: b.height }) }
      catch { setSearchErr('Block not found') }
      return
    }
    if (q.startsWith('CK1')) { setModal({ type: 'address', key: q }); return }
    setSearchErr('Enter a block height, 64-char hash, or CK1 address')
  }

  const netIsTest = network === 'testnet'

  const searchBar = (
    <div className="flex gap-2">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && doSearch()}
        placeholder="Height, block hash, or CK1 address…"
        className="flex-1 bg-surface2 border border-border text-text placeholder-muted text-sm px-3.5 py-2 rounded-lg outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all"
      />
      <button
        onClick={doSearch}
        className="bg-gold hover:bg-golddim text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap shadow-sm"
      >
        Search
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      <Navbar
        search={searchBar}
        right={
          <div className="flex items-center gap-3">
            {network && (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                netIsTest
                  ? 'bg-orange/10 text-orange border-orange/30'
                  : 'bg-goldbg text-gold border-gold/30'
              }`}>
                {network.toUpperCase()}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-green animate-pulse-dot' : 'bg-red'}`} />
              <span className="hidden sm:block">{status}</span>
            </div>
          </div>
        }
      />

      {searchErr && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
          <p className="text-red text-xs">{searchErr}</p>
        </div>
      )}

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Latest Block" value={info?.height?.toLocaleString()} />
        <Stat label="Blocks / min" value={bpm} />
        <Stat label="CHK Mined"    value={info ? fmtSupply(info.total_supply_mined) : null} sub="of 44.8M max" />
        <Stat label="Active Peers" value={info?.peers} />
      </div>

      {/* Living chain */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <LiveChain
          blocks={blocks}
          onOpenModal={h => setModal({ type: 'block', key: h })}
        />
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center">
        <p className="text-muted text-xs">
          Chakram {network ? network.charAt(0).toUpperCase() + network.slice(1) : ''}
        </p>
        {genesis && (
          <p className="text-muted/40 text-[10px] mt-1 font-mono max-w-xl mx-auto px-4 truncate" title={genesis}>
            Genesis: {genesis}
          </p>
        )}
        <a
          href="https://github.com/anandhu-here/chakram"
          target="_blank"
          rel="noopener"
          className="text-gold text-xs mt-2 inline-block hover:underline"
        >
          GitHub ↗
        </a>
      </footer>

      {modal?.type === 'block'   && <BlockModal   height={modal.key}  onClose={() => setModal(null)} />}
      {modal?.type === 'address' && <AddressModal address={modal.key} onClose={() => setModal(null)} />}
    </div>
  )
}