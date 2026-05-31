import { useRef, useEffect, useState, useCallback } from 'react'

const timeAgo = ts => {
  const d = Math.floor(Date.now() / 1000) - ts
  if (d < 5)     return 'just now'
  if (d < 60)    return d + 's ago'
  if (d < 3600)  return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}
const trunc = (s, n = 12) => s && s.length > n ? s.slice(0, n) + '…' : s

// ── Shared detail panel ───────────────────────────────────────────────────────
function DetailPanel({ block, fullBlock, loading, onClose }) {
  if (!block) return null
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold text-gold">
            Block #{block.height.toLocaleString()}
          </span>
          {block.miner && (
            <>
              <span className="text-muted text-xs">·</span>
              <span className="font-mono text-[11px] text-green" title={block.miner}>
                {trunc(block.miner, 20)}
              </span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-text text-sm leading-none transition-colors"
          aria-label="Close detail panel"
        >✕</button>
      </div>

      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <Row label="Hash"      value={block.hash} mono />
          <Row label="Age"       value={new Date(block.timestamp * 1000).toUTCString()} />
          <Row label="Txs"       value={block.tx_count} />
          {loading && <p className="text-muted text-xs py-2">Loading details…</p>}
          {fullBlock && (
            <>
              <Row label="Prev hash"  value={fullBlock.previous_hash} mono />
              <Row label="Difficulty" value={fullBlock.difficulty} />
              <Row label="Nonce"      value={fullBlock.nonce?.toLocaleString()} />
            </>
          )}
        </div>
        {fullBlock?.transactions?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-2 pt-0.5">
              Transactions
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {fullBlock.transactions.map(tx => (
                <div key={tx.txid} className="flex items-start gap-2 bg-surface2 rounded-lg border border-border px-2.5 py-2">
                  {tx.is_coinbase && (
                    <span className="shrink-0 text-[9px] font-bold text-gold border border-gold/40 bg-goldbg rounded px-1 py-0.5 mt-0.5">CB</span>
                  )}
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] text-muted truncate">{tx.txid.slice(0, 24)}…</p>
                    {tx.outputs?.map((o, i) => (
                      <p key={i} className="font-mono text-[10px] text-gold mt-0.5">{o.value_chk?.toFixed(4)} CHK</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-border last:border-0 text-xs">
      <span className="text-muted w-20 shrink-0">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} text-text break-all`}>{value ?? '—'}</span>
    </div>
  )
}

// ── View A: horizontal scrolling chain ───────────────────────────────────────
function ChainArrow() {
  return (
    <div className="flex items-center shrink-0 w-8 relative">
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-dashed border-border" />
      <svg className="absolute right-0 top-1/2 -translate-y-1/2 shrink-0" width="8" height="10" viewBox="0 0 8 10" fill="none">
        <path d="M1 1L7 5L1 9" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function BlockCard({ block, isNew, isSelected, isLatest, onClick }) {
  const [age, setAge] = useState(() => timeAgo(block.timestamp))
  useEffect(() => {
    const t = setInterval(() => setAge(timeAgo(block.timestamp)), 10_000)
    return () => clearInterval(t)
  }, [block.timestamp])

  return (
    <button
      onClick={onClick}
      className={[
        'relative shrink-0 w-[148px] rounded-xl border text-left transition-all duration-200 p-3.5',
        'focus:outline-none focus:ring-2 focus:ring-gold/40',
        isNew ? 'animate-slide-down' : '',
        isSelected
          ? 'bg-goldbg border-gold/60 shadow-md'
          : 'bg-surface border-border hover:border-gold/40 hover:bg-surface2',
      ].filter(Boolean).join(' ')}
    >
      {isLatest && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-widest uppercase bg-green text-white px-2 py-0.5 rounded-full">
          latest
        </span>
      )}
      <p className="text-[10px] text-muted mb-1 font-mono">#{block.height.toLocaleString()}</p>
      <p className="font-mono text-[11px] text-text font-semibold leading-tight mb-2.5" title={block.hash}>
        {block.hash.slice(0, 10)}…
      </p>
      <span className="inline-flex items-center gap-1 bg-surface2 border border-border rounded-md px-1.5 py-0.5 text-[10px] text-muted mb-2">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0">
          <rect x="0.5" y="0.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1"/>
          <line x1="2" y1="3" x2="6" y2="3" stroke="currentColor" strokeWidth="1"/>
          <line x1="2" y1="5" x2="5" y2="5" stroke="currentColor" strokeWidth="1"/>
        </svg>
        {block.tx_count} txs
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] text-muted">{age}</p>
        {block.miner && (
          <p className="font-mono text-[10px] text-green truncate" title={block.miner}>
            {trunc(block.miner, 14)}
          </p>
        )}
      </div>
    </button>
  )
}

function HorizontalChain({ blocks, selected, onSelect }) {
  const scrollRef  = useRef(null)
  const isDragging = useRef(false)
  const startX     = useRef(0)
  const scrollLeft = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
  }, [blocks.length])

  const onMouseDown = e => {
    isDragging.current = true
    startX.current = e.pageX - scrollRef.current.offsetLeft
    scrollLeft.current = scrollRef.current.scrollLeft
    scrollRef.current.style.cursor = 'grabbing'
  }
  const onMouseMove = e => {
    if (!isDragging.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    scrollRef.current.scrollLeft = scrollLeft.current - (x - startX.current)
  }
  const onMouseUp = () => {
    isDragging.current = false
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
  }

  const ordered = [...blocks].reverse()

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto pb-3 cursor-grab select-none"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="flex items-center gap-0 min-w-max px-1 py-4">
        {ordered.length === 0 ? (
          <div className="flex items-center gap-2 text-muted text-sm px-2 py-8">
            <div className="w-4 h-4 border-2 border-border border-t-gold rounded-full animate-spin" />
            Loading blocks…
          </div>
        ) : ordered.map((block, i) => (
          <div key={block.height} className="flex items-center">
            {i > 0 && <ChainArrow />}
            <BlockCard
              block={block}
              isNew={i === ordered.length - 1 && blocks[0]?.height === block.height}
              isLatest={i === ordered.length - 1}
              isSelected={selected?.height === block.height}
              onClick={() => onSelect(block)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── View B: boustrophedon grid ────────────────────────────────────────────────
// Snake path: row 0 → left-to-right, row 1 → right-to-left, row 2 → left-to-right …
// Blocks fill oldest-first; newest block occupies the last slot.
// When blocks.length > CAPACITY the oldest falls off automatically (parent already caps at 20).

const COLS     = 5
const ROWS     = 4
const CAPACITY = COLS * ROWS   // 20 — matches the 20-block cap in Explorer

function snakePosition(idx) {
  const row = Math.floor(idx / COLS)
  const col = row % 2 === 0 ? idx % COLS : COLS - 1 - (idx % COLS)
  return { row, col }
}

function GridCell({ block, idx, total, isSelected, onClick }) {
  const [age, setAge] = useState(() => timeAgo(block.timestamp))
  useEffect(() => {
    const t = setInterval(() => setAge(timeAgo(block.timestamp)), 10_000)
    return () => clearInterval(t)
  }, [block.timestamp])

  const isLatest = idx === total - 1
  const { row, col } = snakePosition(idx)

  // Cell size comes from the grid; we use CSS grid so no absolute positioning needed.
  // We encode row/col via CSS custom properties for the grid-area.
  return (
    <button
      onClick={onClick}
      title={block.hash}
      style={{ gridRow: row + 1, gridColumn: col + 1 }}
      className={[
        'relative rounded-xl border text-left p-2.5 transition-all duration-200 animate-slide-down',
        'focus:outline-none focus:ring-2 focus:ring-gold/40',
        isSelected
          ? 'bg-goldbg border-gold/60'
          : isLatest
            ? 'bg-surface border-green/50 hover:border-green/80'
            : 'bg-surface border-border hover:border-gold/40 hover:bg-surface2',
      ].filter(Boolean).join(' ')}
    >
      {isLatest && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold tracking-widest uppercase bg-green text-white px-1.5 py-px rounded-full whitespace-nowrap">
          latest
        </span>
      )}
      <p className="text-[9px] text-muted font-mono leading-tight">#{block.height.toLocaleString()}</p>
      <p className="font-mono text-[10px] text-text font-semibold leading-tight mt-0.5 truncate" title={block.hash}>
        {block.hash.slice(0, 9)}…
      </p>
      <p className="text-[9px] text-muted mt-1">{block.tx_count} txs</p>
      <p className="text-[9px] text-muted/70 mt-0.5">{age}</p>
      {block.miner && (
        <p className="font-mono text-[9px] text-green mt-0.5 truncate">{trunc(block.miner, 12)}</p>
      )}
    </button>
  )
}

// Direction turn indicator rendered between rows in the grid gutters
function TurnArrows() {
  // We render a thin SVG overlay on top of the grid showing the snake path direction.
  // One row-end arrow (right edge going down) and one row-start arrow (left edge going down).
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {Array.from({ length: ROWS - 1 }).map((_, r) => {
        const goingRight = r % 2 === 0   // row r flows left→right, so turn is at right edge
        return (
          <svg
            key={r}
            className="absolute"
            style={{
              width: 12,
              height: 20,
              // vertically centred in the gap between row r and r+1
              top:  `calc(${(r + 1) / ROWS * 100}% - 10px)`,
              left: goingRight ? 'calc(100% - 2px)' : '-10px',
            }}
            viewBox="0 0 12 20"
            fill="none"
          >
            <path
              d={goingRight
                ? 'M2 2 Q10 2 10 10 Q10 18 2 18'
                : 'M10 2 Q2 2 2 10 Q2 18 10 18'}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
            <path
              d={goingRight ? 'M0 14 L3 18 L6 14' : 'M6 14 L9 18 L12 14'}
              stroke="var(--border)"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )
      })}
    </div>
  )
}

function BoustrophedonGrid({ blocks, selected, onSelect }) {
  // blocks is newest-first; we want oldest-first for the snake (oldest = slot 0 = top-left)
  const ordered = [...blocks].reverse()

  return (
    <div className="relative mt-1 mb-1 mx-6">
      <TurnArrows />
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows:    `repeat(${ROWS}, 72px)`,
        }}
      >
        {ordered.length === 0 ? (
          <div className="col-span-5 row-span-4 flex items-center justify-center gap-2 text-muted text-sm">
            <div className="w-4 h-4 border-2 border-border border-t-gold rounded-full animate-spin" />
            Loading blocks…
          </div>
        ) : ordered.map((block, i) => (
          <GridCell
            key={block.height}
            block={block}
            idx={i}
            total={ordered.length}
            isSelected={selected?.height === block.height}
            onClick={() => onSelect(block)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-surface2 border border-border rounded-lg p-0.5">
      <button
        onClick={() => onChange('chain')}
        className={[
          'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all',
          view === 'chain'
            ? 'bg-surface border border-border text-text shadow-sm'
            : 'text-muted hover:text-text',
        ].join(' ')}
        aria-pressed={view === 'chain'}
      >
        {/* chain icon */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="0.5" y="3.5" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1"/>
          <rect x="7.5" y="3.5" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1"/>
          <line x1="4.5" y1="6" x2="7.5" y2="6" stroke="currentColor" strokeWidth="1"/>
        </svg>
        Chain
      </button>
      <button
        onClick={() => onChange('grid')}
        className={[
          'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all',
          view === 'grid'
            ? 'bg-surface border border-border text-text shadow-sm'
            : 'text-muted hover:text-text',
        ].join(' ')}
        aria-pressed={view === 'grid'}
      >
        {/* grid icon */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/>
          <rect x="7" y="0.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/>
          <rect x="0.5" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/>
          <rect x="7" y="7" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/>
        </svg>
        Grid
      </button>
    </div>
  )
}

// ── Main LiveChain component ──────────────────────────────────────────────────
export default function LiveChain({ blocks }) {
  const [view,       setView]       = useState('chain')  // 'chain' | 'grid'
  const [selected,   setSelected]   = useState(null)
  const [fullBlock,  setFullBlock]  = useState(null)
  const [loadingFull, setLoadingFull] = useState(false)

  // Fetch full block detail on selection
  useEffect(() => {
    if (!selected) { setFullBlock(null); return }
    setFullBlock(null)
    setLoadingFull(true)
    fetch('/block/' + selected.height)
      .then(r => r.json())
      .then(d => { setFullBlock(d); setLoadingFull(false) })
      .catch(() => setLoadingFull(false))
  }, [selected?.height])

  const handleSelect = useCallback(block => {
    setSelected(prev => prev?.height === block.height ? null : block)
  }, [])

  const handleViewChange = v => {
    setView(v)
    setSelected(null)
    setFullBlock(null)
  }

  return (
    <div>
      {/* header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">Latest Blocks</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {view === 'chain' ? 'drag to scroll' : `${Math.min(blocks.length, CAPACITY)} of ${CAPACITY} slots`}
            {' · updates every 5s'}
          </span>
          <ViewToggle view={view} onChange={handleViewChange} />
        </div>
      </div>

      {/* active view */}
      {view === 'chain' ? (
        <HorizontalChain blocks={blocks} selected={selected} onSelect={handleSelect} />
      ) : (
        <BoustrophedonGrid blocks={blocks} selected={selected} onSelect={handleSelect} />
      )}

      {/* shared detail panel */}
      <DetailPanel
        block={selected}
        fullBlock={fullBlock}
        loading={loadingFull}
        onClose={() => { setSelected(null); setFullBlock(null) }}
      />
    </div>
  )
}