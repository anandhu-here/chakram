import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'

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

const trunc = (s, n = 20) => s && s.length > n ? s.slice(0, n) + '…' : s

const fmtSupply = v => {
  const c = v / 1_000_000
  if (c >= 1_000_000) return (c / 1_000_000).toFixed(2) + 'M'
  if (c >= 1000)      return (c / 1000).toFixed(1) + 'K'
  return c.toFixed(2)
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, icon, accent }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
      accent ? 'bg-goldbg border-gold/40' : 'bg-surface border-border'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-widest">{label}</p>
        {icon && <span className="text-sm opacity-50">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${
        accent ? 'text-gold' : 'text-text'
      }`}>
        {value ?? <span className="text-border">—</span>}
      </p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ── KV row inside modal ────────────────────────────────────────────────────────
function KV({ label, value }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-muted w-20 shrink-0 pt-0.5">{label}</span>
      <span className="font-mono text-[11px] text-text break-all flex-1">{value}</span>
    </div>
  )
}

// ── Modal shell ────────────────────────────────────────────────────────────────
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
      <div className="bg-surface rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="font-semibold text-text text-sm">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors text-base leading-none"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
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
            <KV label="Prev hash"  value={data.previous_hash} />
            <KV label="Timestamp"  value={new Date(data.timestamp * 1000).toUTCString()} />
            <KV label="Difficulty" value={data.difficulty} />
            <KV label="Nonce"      value={data.nonce.toLocaleString()} />
            <KV label="Txs"        value={data.tx_count} />
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">
              Transactions
            </p>
            {(data.transactions || []).map(tx => (
              <div key={tx.txid} className="bg-surface2 rounded-lg border border-border p-3 mb-2">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {tx.is_coinbase && (
                    <span className="bg-goldbg text-gold text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gold/30">
                      COINBASE
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted break-all">{tx.txid}</span>
                </div>
                {tx.outputs?.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {tx.outputs.map((out, i) => (
                      <div key={i} className="flex justify-between items-center text-[11px] py-0.5">
                        <span className="font-mono text-green">{trunc(out.pubkey_hash, 26)}</span>
                        <span className="font-mono font-semibold text-gold ml-3 shrink-0">
                          {out.value_chk?.toFixed(6)} CHK
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
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
          <KV label="Address" value={data.address} />
          <KV label="Balance" value={`${data.balance_chk?.toFixed(6)} CHK`} />
          <KV label="Raw"     value={`${data.balance.toLocaleString()} Cash`} />
          <KV label="UTXOs"   value={data.utxo_count} />
        </>
      )}
    </Modal>
  )
}

// ── Block row ──────────────────────────────────────────────────────────────────
function BlockRow({ block, isNew, onClick }) {
  return (
    <div
      onClick={() => onClick(block.height)}
      className={`grid items-center gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-surface2/60
        ${isNew ? 'animate-fade-in' : ''}
      `}
      style={{ gridTemplateColumns: '72px 1fr auto' }}
    >
      {/* Height */}
      <div className="font-mono text-sm font-semibold text-gold">
        #{block.height.toLocaleString()}
      </div>

      {/* Hash + meta */}
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-muted truncate">
          {block.hash}
        </div>
        <div className="text-[11px] text-muted/60 mt-0.5">
          Diff {block.difficulty?.toLocaleString()} · Nonce {block.nonce?.toLocaleString()}
        </div>
      </div>

      {/* Time + tx count */}
      <div className="text-right shrink-0">
        <div className="text-[11px] text-muted">{timeAgo(block.timestamp)}</div>
        <div className="inline-flex items-center gap-1 mt-1 text-[11px] text-muted bg-surface2 border border-border px-2 py-0.5 rounded-full">
          {block.tx_count ?? '—'} tx
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Explorer() {
  const [info,      setInfo]      = useState(null)
  const [blocks,    setBlocks]    = useState([])
  const [newHeights, setNewHeights] = useState(new Set())
  const [bpm,       setBpm]       = useState(null)
  const [online,    setOnline]    = useState(false)
  const [status,    setStatus]    = useState('Connecting…')
  const [genesis,   setGenesis]   = useState(null)
  const [network,   setNetwork]   = useState(null)
  const [modal,     setModal]     = useState(null)
  const [search,    setSearch]    = useState('')
  const [searchErr, setSearchErr] = useState('')

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
      const freshHeights = new Set(newB.map(b => b.height))
      newB.forEach(b => known.current.add(b.height))
      setNewHeights(freshHeights)
      setBlocks(prev =>
        [...newB].sort((a, b) => b.height - a.height).concat(prev).slice(0, 20)
      )
      setTimeout(() => setNewHeights(new Set()), 2000)
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
  const networkLabel = network
    ? network.charAt(0).toUpperCase() + network.slice(1)
    : ''

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
     

      {/* Search error */}
      {searchErr && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <p className="text-red text-sm">{searchErr}</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
          <Stat label="Latest Block" value={info?.height?.toLocaleString()} icon="⛏" accent />
          <Stat label="Blocks / min" value={bpm} icon="⚡" />
          <Stat label="CHK Mined"    value={info ? fmtSupply(info.total_supply_mined) : null} sub="of 44.8M max" icon="🪙" />
          <Stat label="Active Peers" value={info?.peers} icon="🔗" />
        </div>

        {/* ── Block feed ── */}
        <div className="flex items-center justify-between pt-6 pb-2.5">
          <h2 className="text-sm font-semibold text-text">Recent blocks</h2>
          <span className="text-[11px] text-muted">Auto-refreshes every 5s</span>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {blocks.length === 0 ? (
            <div className="py-10 text-center text-muted text-sm">
              {online ? 'Loading blocks…' : 'Node unreachable'}
            </div>
          ) : (
            blocks.map(b => (
              <BlockRow
                key={b.height}
                block={b}
                isNew={newHeights.has(b.height)}
                onClick={h => setModal({ type: 'block', key: h })}
              />
            ))
          )}
        </div>

      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-border mt-12 py-5 text-center">
        <p className="text-muted text-xs">
          Chakram {networkLabel}
          {genesis && (
            <>
              {' · '}
              <span className="font-mono text-[10px] text-muted/50" title={genesis}>
                Genesis: {genesis.slice(0, 20)}…
              </span>
            </>
          )}
        </p>
        <a
          href="https://github.com/anandhu-here/chakram"
          target="_blank"
          rel="noopener"
          className="text-gold text-xs mt-1.5 inline-block hover:underline"
        >
          GitHub ↗
        </a>
      </footer>

      {/* ── Modals ── */}
      {modal?.type === 'block'   && <BlockModal   height={modal.key}  onClose={() => setModal(null)} />}
      {modal?.type === 'address' && <AddressModal address={modal.key} onClose={() => setModal(null)} />}
    </div>
  )
}