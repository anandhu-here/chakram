import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext.jsx'
import chakramLogo from '../assets/chakram.png'

function Badge({ type }) {
  const s = {
    get:  'bg-blue/10 text-blue border-blue/25',
    post: 'bg-green/10 text-green border-green/25',
  }
  return <span className={`text-xs font-bold px-2.5 py-0.5 rounded border uppercase tracking-widest ${s[type]}`}>{type}</span>
}

function Endpoint({ id, method, path, desc, children }) {
  return (
    <div id={id} className="border border-border rounded-2xl mb-8 overflow-hidden">
      <div className="px-6 py-5 bg-surface2">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <Badge type={method} />
          <code className="font-mono text-base text-text">{path}</code>
        </div>
        <p className="text-muted text-base leading-relaxed">{desc}</p>
      </div>
      <div className="px-6 pb-5 pt-4">{children}</div>
    </div>
  )
}

function Pre({ children }) {
  return (
    <pre className="bg-surface2 border border-border rounded-xl p-5 text-sm font-mono text-text leading-relaxed overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  )
}

function Callout({ type = 'info', children }) {
  const s = {
    info: 'bg-blue/5 border-blue/20 text-blue',
    warn: 'bg-goldbg border-gold/30 text-gold',
    tip:  'bg-greenbg border-green/30 text-green',
  }
  return <div className={`border rounded-xl p-5 my-5 text-base leading-relaxed ${s[type]}`}>{children}</div>
}

const H2 = ({ id, children }) => (
  <h2 id={id} className="text-2xl font-bold text-text mt-16 mb-5 pb-3 border-b border-border">{children}</h2>
)
const H3 = ({ children }) => <h3 className="text-lg font-semibold text-text mt-8 mb-3">{children}</h3>
const P  = ({ children }) => <p className="text-muted text-base leading-relaxed mb-4">{children}</p>

function DataTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto my-5 rounded-xl border border-border">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface2">
            {headers.map(h => (
              <th key={h} className="text-left px-5 py-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-border">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface2 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={`px-5 py-3.5 text-sm ${j === 0 ? 'font-semibold text-text whitespace-nowrap' : 'text-muted'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const SECTIONS = [
  { title: 'Introduction', links: [
    { href: '#overview',    label: 'Overview' },
    { href: '#network',     label: 'Network' },
    { href: '#checkpoints', label: 'Checkpoints' },
    { href: '#units',       label: 'Units & Supply' },
  ]},
  { title: 'HTTP API', links: [
    { href: '#api',               label: 'Reference' },
    { href: '#api-info',          label: '/info',           sub: true },
    { href: '#api-block',         label: '/block',          sub: true },
    { href: '#api-blocks-latest', label: '/blocks/latest',  sub: true },
    { href: '#api-tx',            label: '/tx',             sub: true },
    { href: '#api-address',       label: '/address',        sub: true },
    { href: '#api-utxos',         label: '/utxos',          sub: true },
    { href: '#api-peers',         label: '/peers',          sub: true },
    { href: '#api-submit',        label: '/tx/submit',      sub: true },
  ]},
  { title: 'Protocol', links: [
    { href: '#keys',         label: 'Keys & Addresses' },
    { href: '#transactions', label: 'Transactions' },
    { href: '#signing',      label: 'Signing' },
    { href: '#utxo-model',   label: 'UTXO Model' },
  ]},
  { title: 'Node', links: [
    { href: '#running',        label: 'Running' },
    { href: '#peer-discovery', label: 'Peer Discovery' },
    { href: '#mining',         label: 'Mining' },
    { href: '#p2p',            label: 'P2P Protocol' },
  ]},
  { title: 'Developer', links: [
    { href: '#integration', label: 'Integration' },
    { href: '#errors',      label: 'Errors' },
  ]},
]

export default function Docs() {
  const [active, setActive] = useState('#overview')
  const [open, setOpen] = useState(false)
  const { dark, toggle } = useTheme()

  useEffect(() => {
    const sections = document.querySelectorAll('section[id]')
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive('#' + e.target.id) })
    }, { rootMargin: '-10% 0px -80% 0px' })
    sections.forEach(s => obs.observe(s))
    return () => obs.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* Mobile header */}
      <div className="md:hidden bg-surface/90 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <img src={chakramLogo} alt="" className="h-7 w-auto" />
          <span className="font-bold text-text text-base tracking-wider">DOCS</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="w-9 h-9 flex items-center justify-center text-muted hover:text-text rounded-xl border border-border transition-colors text-sm">
            {dark ? '☀' : '🌙'}
          </button>
          <button onClick={() => setOpen(v => !v)} className="text-sm border border-border px-3.5 py-2 rounded-xl text-muted hover:text-text transition-colors font-medium">
            Menu
          </button>
        </div>
      </div>

      <div className="flex flex-1">

        {/* Sidebar */}
        <nav className={`
          bg-surface border-r border-border w-64 shrink-0 overflow-y-auto pb-8
          fixed md:sticky top-0 md:top-0 h-screen z-30 transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="px-5 py-5 border-b border-border flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5">
              <img src={chakramLogo} alt="" className="h-8 w-auto" />
              <span className="font-bold text-text text-base tracking-wide">Docs</span>
            </Link>
            <button onClick={toggle} className="hidden md:flex w-8 h-8 items-center justify-center text-muted hover:text-text rounded-lg hover:bg-surface2 transition-colors text-sm">
              {dark ? '☀' : '🌙'}
            </button>
          </div>
          <div className="py-4">
            {SECTIONS.map(s => (
              <div key={s.title}>
                <p className="text-xs font-bold text-muted uppercase tracking-[0.12em] px-5 pt-5 pb-1.5">{s.title}</p>
                {s.links.map(l => (
                  <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                    className={`block text-sm py-2 border-l-2 transition-colors
                      ${l.sub ? 'pl-9' : 'pl-5'}
                      ${active === l.href ? 'text-gold border-gold bg-goldbg/50 font-medium' : 'text-muted border-transparent hover:text-text hover:border-border'}`}>
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </nav>

        {open && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setOpen(false)} />}

        {/* Content */}
        <main className="flex-1 px-6 md:px-14 py-12 max-w-4xl overflow-x-hidden">

          {/* ── Overview ── */}
          <section id="overview">
            <h1 className="text-3xl font-bold text-text mb-3 tracking-tight">Chakram Protocol</h1>
            <P>Chakram (CHK) is a Kerala-inspired UTXO cryptocurrency using <strong className="text-text">RandomX proof-of-work</strong>, <strong className="text-text">Ed25519 signatures</strong>, and a lightweight JSON HTTP API.</P>
            <DataTable headers={['Property', 'Value']} rows={[
              ['Coin',          'Chakram'],
              ['Ticker',        'CHK'],
              ['Address prefix','CK1'],
              ['Signatures',    'Ed25519'],
              ['Proof of work', 'RandomX (ASIC-resistant CPU mining)'],
              ['Model',         'UTXO'],
              ['Block time',    '30 seconds (target)'],
              ['Max block size','1 MB'],
              ['Protocol',      'v1 (JSON over TCP)'],
            ]} />
          </section>

          {/* ── Network ── */}
          <section id="network">
            <H2 id="network">Network Parameters</H2>
            <DataTable headers={['Parameter', 'Mainnet', 'Testnet']} rows={[
              ['P2P port',    '8338',               '18338'],
              ['RPC port',    '8339',               '18339'],
              ['Magic bytes', '43 48 41 4B (CHAK)', '43 48 41 54 (CHAT)'],
              ['DNS seeds',   'seeds.chakram.one',  '—'],
              ['Fallback seeds',
                '35.207.229.32:8338\n34.1.166.49:8338\n35.207.217.64:8338',
                '35.207.229.32:18338\n34.1.166.49:18338'],
              ['Max peers (regular node)', '12', '12'],
              ['Max peers (seed mode)',    '125', '125'],
            ]} />
            <Callout type="info">
              On startup, nodes resolve <code className="font-mono text-xs">seeds.chakram.one</code> to discover seed IPs. If DNS is unreachable, the hardcoded fallback IPs are used automatically. Discovered peers are saved to <code className="font-mono text-xs">~/.chakram/mainnet/peers.json</code> so the node can reconnect without DNS on the next start.
            </Callout>
            <H3>Difficulty Adjustment</H3>
            <DataTable headers={['Parameter', 'Value']} rows={[
              ['Target block time',   '30 seconds'],
              ['Algorithm',           'LWMA-3 sliding window (post-bootstrap)'],
              ['Look-back window',    '60 blocks'],
              ['Minimum difficulty',  '4'],
              ['Bootstrap phase',     'First 60 blocks use a 30s time floor (TEB) instead of LWMA'],
            ]} />
          </section>

          {/* ── Checkpoints ── */}
          <section id="checkpoints">
            <H2 id="checkpoints">Checkpoints</H2>
            <P>Checkpoints are block hashes hardcoded into the binary. Any block at a checkpointed height must exactly match — a peer serving a different hash is rejected and disconnected. Reorganisations can never roll back past the highest checkpoint.</P>
            <DataTable headers={['Height', 'Hash', 'Notes']} rows={[
              ['600', '081454bdec667c88b5b5b10ca539688efeb2c8b872cbe250e30be7b0813c752d', 'First checkpoint — genesis era'],
            ]} />
            <P>New checkpoints are added with each major release after the chain has stabilised. You can independently verify any checkpoint by querying <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">/block/600</code> on any fully synced node and comparing the returned hash.</P>
            <Callout type="tip">Checkpoints protect the network against long-range history rewrite attacks. Bitcoin uses the same mechanism — checkpoints are manually reviewed and committed to the codebase by maintainers.</Callout>
          </section>

          {/* ── Units ── */}
          <section id="units">
            <H2 id="units">Units & Supply</H2>
            <P>All API values are in <strong className="text-text">Cash</strong> — the smallest indivisible unit. Divide by 1,000,000 to get CHK.</P>
            <DataTable headers={['Parameter', 'Value']} rows={[
              ['1 CHK',                '1,000,000 Cash'],
              ['Minimum fee',          '1,000 Cash (0.001 CHK)'],
              ['Initial block reward', '50 CHK'],
              ['Halving interval',     '2,102,400 blocks (~2 years at 30s blocks)'],
              ['Coinbase maturity',    '10 blocks (~5 minutes)'],
              ['Max supply',           '44,800,000 CHK'],
            ]} />
            <Callout type="info">All amounts in the API are integers in <strong>Cash</strong>. Never use floating-point arithmetic for currency — always work in Cash integers and convert only for display.</Callout>
          </section>

          {/* ── API ── */}
          <section id="api">
            <H2 id="api">HTTP API Reference</H2>
            <P>JSON REST over HTTP. Every response is <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-sm font-mono">application/json</code>. Errors return <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-sm font-mono">{`{"error":"..."}`}</code>.</P>
            <Callout type="info">
              Base URL: <code className="font-mono text-xs">http://&lt;node&gt;:8339</code> (mainnet) · <code className="font-mono text-xs">http://&lt;node&gt;:18339</code> (testnet) · CORS: unrestricted
            </Callout>

            <Endpoint id="api-info" method="get" path="/info" desc="Current node status: height, peers, sync state, mining, wallet address, total supply mined.">
              <Pre>{`{
  "name":               "Chakram",
  "ticker":             "CHK",
  "version":            "v1.0.62",
  "protocol_version":   1,
  "network":            "mainnet",
  "height":             14823,
  "peers":              5,
  "sync_status":        "Synced — height 14823",
  "mining":             false,
  "wallet":             "CK1AbcDef...",
  "total_supply_mined": 741150000000
}`}</Pre>
            </Endpoint>

            <Endpoint id="api-block" method="get" path="/block/{height}  ·  /block/hash/{hash}" desc="Full block with all transactions. Lookup by height or 64-char hex hash.">
              <Pre>{`{
  "height":        1000,
  "hash":          "000014a3c8...",
  "previous_hash": "00001a8f47...",
  "timestamp":     1779936400,
  "difficulty":    12,
  "nonce":         192038,
  "tx_count":      1,
  "transactions":  [{ "txid": "...", "is_coinbase": true, "inputs": [], "outputs": [...] }]
}`}</Pre>
            </Endpoint>

            <Endpoint id="api-blocks-latest" method="get" path="/blocks/latest/{count}" desc="Most recent N blocks (max 50), newest first. Returns summary — no full transactions.">
              <Pre>{`[{ "height": 14823, "hash": "000014a3...", "timestamp": 1779936400, "tx_count": 2, "miner": "CK1..." }]`}</Pre>
            </Endpoint>

            <Endpoint id="api-tx" method="get" path="/tx/{txid}" desc="Transaction by hex txid. O(1) lookup via the tx index.">
              <Pre>{`{
  "txid":         "a1b2c3...",
  "block_height": 14800,
  "is_coinbase":  false,
  "timestamp":    1779936000,
  "inputs":       [{ "txid": "...", "output_index": 0 }],
  "outputs":      [{ "value": 5000000, "value_chk": 5.0, "pubkey_hash": "..." }]
}`}</Pre>
            </Endpoint>

            <Endpoint id="api-address" method="get" path="/address/{address}" desc="Balance for a CK1 address, derived from its unspent outputs.">
              <Pre>{`{ "address": "CK1...", "balance": 12500000, "balance_chk": 12.5, "utxo_count": 3 }`}</Pre>
            </Endpoint>

            <Endpoint id="api-utxos" method="get" path="/utxos/{address}" desc="All unspent outputs for an address. Use these as inputs when building transactions.">
              <Pre>{`[{ "txid": "a1b2c3...", "output_index": 0, "value": 10000000, "value_chk": 10.0, "block_height": 14700, "is_coinbase": false, "mature": true }]`}</Pre>
              <Callout type="warn">Only use UTXOs where <code className="font-mono text-xs">mature === true</code> as inputs. Spending an immature coinbase (less than 10 confirmations) causes the transaction to be rejected.</Callout>
            </Endpoint>

            <Endpoint id="api-peers" method="get" path="/peers" desc="Currently connected peers and their sync height.">
              <Pre>{`[{ "address": "35.207.229.32:8338", "height": 14823, "connected": true }]`}</Pre>
            </Endpoint>

            <Endpoint id="api-submit" method="post" path="/tx/submit" desc="Broadcast a signed transaction. Node validates, adds to mempool, and relays to all peers.">
              <Pre>{`// Request body
{ "TxID": "<base64>", "IsCoinbase": false, "Inputs": [...], "Outputs": [...], "Timestamp": 1779936000 }

// Success
{ "txid": "a1b2c3...", "status": "submitted" }

// Error
{ "error": "mempool rejected: mempool: input 0: invalid Ed25519 signature" }`}</Pre>
              <Callout type="warn"><strong>Encoding:</strong> All byte fields (TxID, PublicKey, Signature, PublicKeyHash) must be <strong>base64-encoded</strong> in the request JSON. The <code className="font-mono text-xs">/utxos/</code> and <code className="font-mono text-xs">/tx/</code> endpoints return TxIDs as hex — hex-decode them to raw bytes, then base64-encode for submission.</Callout>
            </Endpoint>
          </section>

          {/* ── Keys ── */}
          <section id="keys">
            <H2 id="keys">Keys & Addresses</H2>
            <H3>Key Generation</H3>
            <Pre>{`entropy = random_bytes(16)
seed    = SHA256(entropy)           // 32 bytes — Ed25519 private key
pubKey  = ed25519.PublicKey(seed)   // 32 bytes`}</Pre>
            <Callout type="warn">The seed is equivalent to a private key. Never expose it. Store only the encrypted wallet file.</Callout>
            <H3>BIP39 Mnemonic</H3>
            <Pre>{`entropy (16 bytes) → SHA256 → take top 4 bits as checksum
pack into 132 bits → 12 × 11-bit BIP39 indices → 12 words`}</Pre>
            <H3>Address Format</H3>
            <Pre>{`pkh      = RIPEMD160(SHA256(publicKey))
checksum = SHA256(SHA256(pkh))[0:4]
address  = "CK1" + Base58Encode(pkh ++ checksum)`}</Pre>
          </section>

          {/* ── Transactions ── */}
          <section id="transactions">
            <H2 id="transactions">Transactions</H2>
            <DataTable headers={['Field', 'Type', 'Notes']} rows={[
              ['TxID',       'base64 32B', 'Computed, not chosen'],
              ['IsCoinbase', 'bool',       'Always false for user txs'],
              ['Inputs',     'array',      'UTXOs being spent'],
              ['Outputs',    'array',      'New UTXOs created'],
              ['Timestamp',  'int64',      'Unix seconds at signing'],
            ]} />
            <H3>Transaction ID</H3>
            <Pre>{`// Canonical serialisation (little-endian):
[1B]   IsCoinbase flag
for each input:  [32B] TxID + [4B] OutputIndex (uint32 LE)
for each output: [8B] Value (uint64 LE) + [20B] PublicKeyHash
[8B]   Timestamp (int64 LE)

TxID = SHA256(SHA256(canonical_bytes))`}</Pre>
            <Callout type="tip">Compute TxID <strong>before</strong> signing. TxID does not commit to Signature or PublicKey — it is stable after signatures are added.</Callout>
          </section>

          {/* ── Signing ── */}
          <section id="signing">
            <H2 id="signing">Signing</H2>
            <Pre>{`// For each input i (txid_bytes = hex-decoded from /utxos response):
preimage  = txid_bytes ++ uint32_LE(output_index)
message   = SHA256(preimage)
signature = ed25519.Sign(privKey, message)

// When submitting via /tx/submit, Go's JSON encoder base64-encodes []byte fields:
input[i].Signature  → base64(signature)      // set automatically
input[i].PublicKey  → base64(pubKey)         // set automatically`}</Pre>
            <P>Fee is implicit: <code className="bg-surface2 border border-border px-1 py-0.5 rounded text-xs font-mono">fee = Σ inputs − Σ outputs</code>. Minimum: 1,000 Cash. Add a change output back to your own address if needed.</P>
          </section>

          {/* ── UTXO Model ── */}
          <section id="utxo-model">
            <H2 id="utxo-model">UTXO Model</H2>
            <Pre>{`1. GET /utxos/CK1... → spendable outputs
2. Select UTXOs where total >= amount + fee
3. Build: inputs, outputs (recipient + change), timestamp
4. TxID = SHA256(SHA256(canonical_bytes))
5. Sign each input
6. POST /tx/submit`}</Pre>
            <Callout type="info">Only use UTXOs where <code className="font-mono text-xs">mature === true</code>. Coinbase outputs require 10 confirmations (~5 min) before they can be spent.</Callout>
          </section>

          {/* ── Running ── */}
          <section id="running">
            <H2 id="running">Running a Node</H2>
            <Pre>{`# Download the binary for your platform from the Download page, then:
chmod +x chakram

./chakram node                     # mainnet full node
./chakram node --mine              # mainnet with mining enabled
./chakram node --testnet           # connect to testnet
./chakram node --testnet --mine    # testnet with mining
./chakram node --seed-mode         # infrastructure seed node`}</Pre>
            <DataTable headers={['Flag', 'Default', 'Description']} rows={[
              ['--mine',        'off',      'Enable RandomX block mining. Rewards go to the node wallet.'],
              ['--mineraddress','(wallet)',  'Send mining rewards to a different CK1 address.'],
              ['--password',    'chakram',  'Wallet encryption password. Set a strong one in production.'],
              ['--testnet',     'off',      'Connect to testnet instead of mainnet.'],
              ['--seed-mode',   'off',      'Infrastructure flag: raises the inbound peer limit from 12 to 125. For seed VMs only.'],
              ['--threads',     '1',        'Number of RandomX mining threads.'],
            ]} />
            <DataTable headers={['Port', 'Protocol', 'Purpose']} rows={[
              ['8338 / 18338', 'TCP', 'P2P — peer connections, block and tx propagation'],
              ['8339 / 18339', 'HTTP', 'RPC — block explorer, wallet API, node status'],
            ]} />
            <H3>Data Directory</H3>
            <P>All node data is stored under <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">~/.chakram/mainnet/</code> (or <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">~/.chakram/testnet/</code>). This includes the chain database, wallet file, and address book.</P>
            <DataTable headers={['File', 'Description']} rows={[
              ['~/.chakram/mainnet/wallet.json',  'Encrypted wallet — Ed25519 key + mnemonic'],
              ['~/.chakram/mainnet/peers.json',   'Persistent address book — known peer IPs saved across restarts'],
              ['~/.chakram/mainnet/badger/',      'BadgerDB chain and UTXO database'],
            ]} />
          </section>

          {/* ── Peer Discovery ── */}
          <section id="peer-discovery">
            <H2 id="peer-discovery">Peer Discovery</H2>
            <P>Chakram uses a multi-layer peer discovery system so nodes can always find the network, even if individual seeds are offline.</P>
            <H3>Discovery order</H3>
            <DataTable headers={['Step', 'Method', 'Details']} rows={[
              ['1', 'DNS seeds', 'Resolve seeds.chakram.one → get all seed IPs automatically'],
              ['2', 'Hardcoded fallback', 'If DNS fails, use the 3 IPs compiled into the binary'],
              ['3', 'Address book', 'peers.json contains peers discovered in previous sessions — used on restart'],
              ['4', 'Peer exchange', 'After connecting, nodes exchange peer lists (MsgGetPeers / MsgPeers)'],
            ]} />
            <H3>Address book</H3>
            <P>Every time a peer completes the handshake, its address is saved to <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">peers.json</code>. On the next start the node tries up to 8 of these known addresses before the 5-second reconnect ticker takes over. The address book holds up to 1,000 entries; oldest are evicted when full.</P>
            <H3>Running a community seed</H3>
            <P>Anyone can run a community seed node. Start with <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">--seed-mode</code>, set up DNS A records pointing to your server, and submit a pull request to add your hostname to the <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">DNSSeeds</code> list in <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">config.go</code>. Once merged and released, all new nodes will resolve your hostname alongside the core team seeds. Each operator controls their own DNS independently.</P>
            <Callout type="tip">This is the same model Bitcoin uses — multiple independent DNS seed operators, each running their own crawler. No single party controls discovery.</Callout>
          </section>

          {/* ── Mining ── */}
          <section id="mining">
            <H2 id="mining">Mining</H2>
            <P>Chakram uses <strong className="text-text">RandomX</strong> — an ASIC-resistant algorithm designed for CPU mining. The full node binary includes everything needed; no separate miner is required.</P>
            <Pre>{`./chakram node --mine
./chakram node --mine --mineraddress CK1YourAddress
./chakram node --mine --threads 4`}</Pre>
            <DataTable headers={['Parameter', 'Value']} rows={[
              ['Algorithm',        'RandomX (full mode — 2 GB dataset, ~10× faster than light mode)'],
              ['Epoch length',     '64 blocks (~32 min) — RandomX dataset rebuilt each epoch'],
              ['Block reward',     '50 CHK (era 1)'],
              ['Halving interval', '2,102,400 blocks (~2 years)'],
              ['Coinbase maturity','10 blocks — reward is unspendable until 10 confirmations'],
              ['Thread default',   '1 — increase with --threads for higher hashrate'],
            ]} />
            <Callout type="info">Mining pauses automatically when the node has fewer than 2 connected peers or is still syncing. This prevents extending a stale fork instead of the canonical chain.</Callout>
          </section>

          {/* ── P2P Protocol ── */}
          <section id="p2p">
            <H2 id="p2p">P2P Protocol</H2>
            <P>All messages share a fixed 9-byte header followed by a JSON payload.</P>
            <Pre>{`[4B]  Magic  — 0x4348414B mainnet / 0x43484154 testnet
[1B]  Type   — message type (see table below)
[4B]  Length — payload size in bytes (uint32 big-endian, max 32 MB)
[NB]  Payload — JSON`}</Pre>
            <DataTable headers={['Type', 'Name', 'Description']} rows={[
              ['0x01','Version',  'Handshake — announces height, protocol version, user agent, and listen port'],
              ['0x02','VerAck',   'Handshake acknowledgement — marks the peer as fully connected'],
              ['0x03','GetBlocks','Request block inventory from a given height (max 500 per request)'],
              ['0x04','Inv',      'Announce a new block or transaction by hash'],
              ['0x05','GetData',  'Request the full data for a specific block or transaction'],
              ['0x06','Block',    'Full block delivery'],
              ['0x07','Tx',       'Relay a transaction'],
              ['0x08','Ping',     'Keepalive — sent every 30s; peers not seen in 90s are disconnected'],
              ['0x09','Pong',     'Keepalive response'],
              ['0x0A','GetPeers', "Request the peer's known address list"],
              ['0x0B','Peers',    'Peer address list response (up to 50 addresses)'],
            ]} />
            <H3>Handshake</H3>
            <P>Both sides send <code className="bg-surface2 border border-border px-1 py-0.5 rounded text-xs font-mono">Version</code> immediately on connect. The <code className="bg-surface2 border border-border px-1 py-0.5 rounded text-xs font-mono">listen_port</code> field in Version is critical — inbound connections arrive on an ephemeral port, so the peer must advertise its actual listen port so the address saved to the address book is dialable on reconnect.</P>
            <Pre>{`// Version payload
{
  "version":      1,
  "height":       14823,
  "user_agent":   "Chakram/v1.0.62 (protocol 1)",
  "timestamp":    1779936400,
  "nonce":        12345678,        // random; self-connection detection
  "listen_port":  8338             // actual TCP listen port
}`}</Pre>
            <H3>Connection limits</H3>
            <DataTable headers={['Mode', 'Max peers', 'Flag']} rows={[
              ['Regular node', '12', '(default)'],
              ['Seed node',    '125', '--seed-mode'],
            ]} />
            <P>Peers that send structurally invalid messages accumulate violations. At 5 violations the peer IP is banned for 24 hours. Bans are enforced at the TCP accept stage — banned IPs are dropped before any data is read.</P>
          </section>

          {/* ── Integration ── */}
          <section id="integration">
            <H2 id="integration">Integration Guide</H2>
            <H3>JavaScript</H3>
            <Pre>{`import { hashes, getPublicKey, sign } from '@noble/ed25519'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
hashes.sha512 = sha512  // required for sync operations

const pub = getPublicKey(seed)
const pkh = ripemd160(sha256(pub))
const sig = sign(sha256(new Uint8Array([...txid, ...indexLE])), seed)`}</Pre>
            <H3>Python</H3>
            <Pre>{`from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import hashlib, struct

seed    = hashlib.sha256(entropy).digest()
privkey = Ed25519PrivateKey.from_private_bytes(seed)
message = hashlib.sha256(txid_bytes + struct.pack('<I', output_index)).digest()
sig     = privkey.sign(message)`}</Pre>
            <H3>Go</H3>
            <Pre>{`seed    := sha256.Sum256(entropy)
privKey := ed25519.NewKeyFromSeed(seed[:])
preimage := append(txID, binary.LittleEndian.AppendUint32(nil, outputIndex)...)
message  := sha256.Sum256(preimage)
sig      := ed25519.Sign(privKey, message[:])`}</Pre>
          </section>

          {/* ── Errors ── */}
          <section id="errors">
            <H2 id="errors">Error Reference</H2>
            <DataTable headers={['HTTP', 'Error pattern', 'Cause']} rows={[
              ['400', 'invalid height',                                       'Non-integer height in /block/:height'],
              ['400', 'invalid hash',                                         'Non-hex hash in /block/hash/:hash'],
              ['400', 'invalid txid',                                         'Non-hex txid in /tx/:txid'],
              ['400', 'invalid address',                                      'Not a valid CK1 address'],
              ['400', 'transaction invalid: ...',                             'Structural validation failed (missing fields, zero value, etc.)'],
              ['400', 'mempool rejected: mempool: input N: utxo not found',   'UTXO spent or non-existent'],
              ['400', 'mempool rejected: mempool: input N: invalid Ed25519 signature', 'Signature does not verify'],
              ['400', 'mempool rejected: mempool: input N: coinbase output not yet mature', 'Coinbase UTXO before 10 confirmations'],
              ['400', 'mempool rejected: mempool: full',                      'Mempool at 10,000 tx limit'],
              ['404', 'block not found',                                      'No block at height/hash'],
              ['404', 'transaction not found',                                'TxID not in chain index'],
              ['405', 'method not allowed',                                   'Wrong HTTP method'],
            ]} />
            <div className="mt-12 pt-6 border-t border-border text-xs text-muted">
              Chakram Protocol — Kerala's Digital Currency —{' '}
              <Link to="/" className="text-gold hover:underline">Explorer</Link> ·{' '}
              <Link to="/wallet" className="text-gold hover:underline">Wallet</Link> ·{' '}
              <Link to="/download" className="text-gold hover:underline">Download</Link>
            </div>
          </section>

        </main>
      </div>
    </div>
  )
}
