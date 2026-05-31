import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext.jsx'
import chakramLogo from '../assets/chakram.png'

function Badge({ type }) {
  const s = {
    get:  'bg-blue/10 text-blue border-blue/25',
    post: 'bg-green/10 text-green border-green/25',
  }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${s[type]}`}>{type}</span>
}

function Endpoint({ id, method, path, desc, children }) {
  return (
    <div id={id} className="border border-border rounded-xl mb-6 overflow-hidden">
      <div className="px-5 py-4 bg-surface2">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Badge type={method} />
          <code className="font-mono text-sm text-text">{path}</code>
        </div>
        <p className="text-muted text-sm leading-relaxed">{desc}</p>
      </div>
      <div className="px-5 pb-4 pt-3">{children}</div>
    </div>
  )
}

function Pre({ children }) {
  return (
    <pre className="bg-surface2 border border-border rounded-lg p-4 text-xs font-mono text-text leading-relaxed overflow-x-auto whitespace-pre-wrap">
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
  return <div className={`border rounded-xl p-4 my-4 text-sm leading-relaxed ${s[type]}`}>{children}</div>
}

const H2 = ({ id, children }) => (
  <h2 id={id} className="text-xl font-bold text-text mt-14 mb-4 pb-3 border-b border-border">{children}</h2>
)
const H3 = ({ children }) => <h3 className="text-base font-semibold text-text mt-6 mb-2">{children}</h3>
const P  = ({ children }) => <p className="text-muted text-sm leading-relaxed mb-3">{children}</p>

function DataTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-surface2">
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface2 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-3 text-xs ${j === 0 ? 'font-semibold text-text whitespace-nowrap' : 'text-muted'}`}>{cell}</td>
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
    { href: '#overview', label: 'Overview' },
    { href: '#network',  label: 'Network' },
    { href: '#units',    label: 'Units & Supply' },
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
    { href: '#running', label: 'Running' },
    { href: '#mining',  label: 'Mining' },
    { href: '#p2p',     label: 'P2P Protocol' },
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
      <div className="md:hidden bg-surface border-b border-border px-4 h-12 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <img src={chakramLogo} alt="" className="h-6 w-auto" />
          <span className="font-bold text-text text-sm tracking-wider">DOCS</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="w-8 h-8 flex items-center justify-center text-muted hover:text-text rounded-lg border border-border transition-colors text-sm">
            {dark ? '☀' : '🌙'}
          </button>
          <button onClick={() => setOpen(v => !v)} className="text-xs border border-border px-3 py-1.5 rounded-lg text-muted hover:text-text transition-colors">
            Menu
          </button>
        </div>
      </div>

      <div className="flex flex-1">

        {/* Sidebar */}
        <nav className={`
          bg-surface border-r border-border w-52 shrink-0 overflow-y-auto pb-8
          fixed md:sticky top-0 md:top-0 h-screen z-30 transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="px-5 py-5 border-b border-border flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src={chakramLogo} alt="" className="h-7 w-auto" />
              <span className="font-bold text-text text-sm tracking-wide">Docs</span>
            </Link>
            <button onClick={toggle} className="hidden md:flex w-7 h-7 items-center justify-center text-muted hover:text-text rounded-lg hover:bg-surface2 transition-colors text-xs">
              {dark ? '☀' : '🌙'}
            </button>
          </div>
          <div className="py-3">
            {SECTIONS.map(s => (
              <div key={s.title}>
                <p className="text-[9px] font-bold text-muted uppercase tracking-[0.15em] px-5 pt-4 pb-1">{s.title}</p>
                {s.links.map(l => (
                  <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                    className={`block text-[11px] py-1.5 border-l-2 transition-colors
                      ${l.sub ? 'pl-8' : 'pl-5'}
                      ${active === l.href ? 'text-gold border-gold bg-goldbg/50' : 'text-muted border-transparent hover:text-text hover:border-border'}`}>
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </nav>

        {open && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setOpen(false)} />}

        {/* Content */}
        <main className="flex-1 px-6 md:px-12 py-10 max-w-3xl overflow-x-hidden">

          <section id="overview">
            <h1 className="text-2xl font-bold text-text mb-2 tracking-tight">Chakram Protocol</h1>
            <P>Chakram (CHK) is a Kerala-inspired UTXO cryptocurrency using <strong className="text-text">RandomX proof-of-work</strong>, <strong className="text-text">Ed25519 signatures</strong>, and a lightweight JSON HTTP API.</P>
            <DataTable headers={['Property', 'Value']} rows={[
              ['Coin', 'Chakram'],
              ['Ticker', 'CHK'],
              ['Address prefix', 'CK1'],
              ['Signatures', 'Ed25519'],
              ['Proof of work', 'RandomX'],
              ['Model', 'UTXO'],
              ['Block time', '30 seconds (target)'],
              ['Max block size', '1 MB'],
            ]} />
          </section>

          <section id="network">
            <H2 id="network">Network Parameters</H2>
            <DataTable headers={['Parameter', 'Mainnet', 'Testnet']} rows={[
              ['P2P port',    '8338',                    '18338'],
              ['RPC port',    '8339',                    '18339'],
              ['Magic bytes', '43 48 41 4B (CHAK)',      '43 48 41 54 (CHAT)'],
              ['Seed nodes',  '35.207.229.32:8338\n34.1.166.49:8338', '35.207.229.32:18338\n34.1.166.49:18338'],
            ]} />
            <H3>Difficulty Adjustment</H3>
            <DataTable headers={['Parameter', 'Value']} rows={[
              ['Target block time',    '30 seconds'],
              ['Adjustment',           'Per block, LWMA-3 (after bootstrap)'],
              ['Look-back window',     '60 blocks'],
              ['Minimum difficulty',   '4'],
            ]} />
          </section>

          <section id="units">
            <H2 id="units">Units & Supply</H2>
            <P>All API values are in <strong className="text-text">Cash</strong> — the smallest unit. Divide by 1,000,000 to get CHK.</P>
            <DataTable headers={['Parameter', 'Value']} rows={[
              ['1 CHK',               '1,000,000 Cash'],
              ['Minimum fee',         '1,000 Cash (0.001 CHK)'],
              ['Initial block reward','50 CHK'],
              ['Halving interval',    '2,102,400 blocks (~2 years)'],
              ['Coinbase maturity',   '10 blocks'],
              ['Max supply',          '44,800,000 CHK'],
            ]} />
            <Callout type="info">All amounts in the API are integers in <strong>Cash</strong>. Never use floating-point for currency — work in Cash integers.</Callout>
          </section>

          <section id="api">
            <H2 id="api">HTTP API Reference</H2>
            <P>JSON REST over HTTP. Every response is <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">application/json</code>. Errors return <code className="bg-surface2 border border-border px-1.5 py-0.5 rounded text-xs font-mono">{`{"error":"..."}`}</code>.</P>
            <Callout type="info">
              Base URL: <code className="font-mono text-xs">http://&lt;node&gt;:8339</code> (mainnet) · <code className="font-mono text-xs">http://&lt;node&gt;:18339</code> (testnet) · CORS: unrestricted
            </Callout>

            <Endpoint id="api-info" method="get" path="/info" desc="Current node status: height, peers, sync state, mining, wallet address, total supply mined.">
              <Pre>{`{
  "name":               "Chakram",
  "ticker":             "CHK",
  "version":            1,
  "network":            "testnet",
  "height":             14823,
  "peers":              3,
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
              <Callout type="warn">Only use UTXOs where <code className="font-mono text-xs">mature === true</code> as inputs. Spending an immature coinbase causes the transaction to be rejected.</Callout>
            </Endpoint>

            <Endpoint id="api-peers" method="get" path="/peers" desc="Currently connected peers.">
              <Pre>{`[{ "address": "35.207.229.32:18338", "height": 14823, "connected": true }]`}</Pre>
            </Endpoint>

            <Endpoint id="api-submit" method="post" path="/tx/submit" desc="Broadcast a signed transaction. Node validates, adds to mempool, and relays to all peers.">
              <Pre>{`// Request body
{ "TxID": "<base64>", "IsCoinbase": false, "Inputs": [...], "Outputs": [...], "Timestamp": 1779936000 }

// Success
{ "txid": "a1b2c3...", "status": "submitted" }

// Error
{ "error": "mempool rejected: insufficient fee" }`}</Pre>
              <Callout type="warn"><strong>Encoding:</strong> All byte fields (TxID, PublicKey, Signature, PublicKeyHash) must be <strong>base64-encoded</strong>. The <code className="font-mono text-xs">/tx/</code> lookup endpoint returns TxIDs in hex — convert to base64 when building inputs.</Callout>
            </Endpoint>
          </section>

          <section id="keys">
            <H2 id="keys">Keys & Addresses</H2>
            <H3>Key Generation</H3>
            <Pre>{`entropy = random_bytes(16)
seed    = SHA256(entropy)           // 32 bytes — Ed25519 private key
pubKey  = ed25519.PublicKey(seed)   // 32 bytes`}</Pre>
            <Callout type="warn">The seed is equivalent to a private key. Never expose it. Store only the encrypted form.</Callout>
            <H3>BIP39 Mnemonic</H3>
            <Pre>{`entropy (16 bytes) → SHA256 → take top 4 bits as checksum
pack into 132 bits → 12 × 11-bit BIP39 indices → 12 words`}</Pre>
            <H3>Address Format</H3>
            <Pre>{`pkh      = RIPEMD160(SHA256(publicKey))
checksum = SHA256(SHA256(pkh))[0:4]
address  = "CK1" + Base58Encode(pkh ++ checksum)`}</Pre>
          </section>

          <section id="transactions">
            <H2 id="transactions">Transactions</H2>
            <DataTable headers={['Field', 'Type', 'Notes']} rows={[
              ['TxID',        'base64 32B', 'Computed, not chosen'],
              ['IsCoinbase',  'bool',       'Always false for user txs'],
              ['Inputs',      'array',      'UTXOs being spent'],
              ['Outputs',     'array',      'New UTXOs created'],
              ['Timestamp',   'int64',      'Unix seconds at signing'],
            ]} />
            <H3>Transaction ID</H3>
            <Pre>{`// Canonical serialisation (little-endian):
[1B]   IsCoinbase flag
for each input:  [32B] TxID + [4B] OutputIndex (uint32 LE)
for each output: [8B] Value (uint64 LE) + [20B] PublicKeyHash
[8B]   Timestamp (int64 LE)

TxID = SHA256(SHA256(canonical_bytes))`}</Pre>
            <Callout type="tip">Compute TxID <strong>before</strong> signing. Use zero-filled Signature and PublicKey. TxID is stable after signatures are added.</Callout>
          </section>

          <section id="signing">
            <H2 id="signing">Signing</H2>
            <Pre>{`// For each input i:
preimage  = base64_decode(input[i].TxID) ++ uint32_LE(input[i].OutputIndex)
message   = SHA256(preimage)
signature = ed25519.Sign(seed, message)

input[i].Signature = base64_encode(signature)
input[i].PublicKey = base64_encode(ed25519.PublicKey(seed))`}</Pre>
            <P>Fee is implicit: <code className="bg-surface2 border border-border px-1 py-0.5 rounded text-xs font-mono">fee = Σ inputs − Σ outputs</code>. Minimum: 1,000 Cash. Add a change output if needed.</P>
          </section>

          <section id="utxo-model">
            <H2 id="utxo-model">UTXO Model</H2>
            <Pre>{`1. GET /utxos/CK1... → spendable outputs
2. Select UTXOs where total >= amount + fee
3. Build: inputs, outputs, timestamp
4. TxID = SHA256(SHA256(canonical_bytes))
5. Sign each input
6. POST /tx/submit`}</Pre>
            <Callout type="info">Only use UTXOs where <code className="font-mono text-xs">mature === true</code>. Coinbase outputs need 10 confirmations (~5 min) before spending.</Callout>
          </section>

          <section id="running">
            <H2 id="running">Running a Node</H2>
            <Pre>{`./chakram                          # mainnet
./chakram --testnet                # testnet
./chakram --peer 35.207.229.32:18338
./chakram --datadir /var/lib/chakram`}</Pre>
            <DataTable headers={['Port', 'Protocol', 'Purpose']} rows={[
              ['8338 / 18338', 'TCP', 'P2P peer connections'],
              ['8339 / 18339', 'TCP', 'HTTP RPC, explorer, wallet'],
            ]} />
          </section>

          <section id="mining">
            <H2 id="mining">Mining</H2>
            <P>Chakram uses <strong className="text-text">RandomX</strong> — ASIC-resistant CPU mining. Built into the node binary.</P>
            <Pre>{`./chakram --mine
./chakram --testnet --mine`}</Pre>
            <DataTable headers={['Parameter', 'Value']} rows={[
              ['Algorithm',        'RandomX (light mode)'],
              ['Epoch length',     '64 blocks (~32 min)'],
              ['Block reward',     '50 CHK (era 1)'],
              ['Halving interval', '2,102,400 blocks (~2 years)'],
              ['Maturity',         '10 blocks'],
            ]} />
          </section>

          <section id="p2p">
            <H2 id="p2p">P2P Protocol</H2>
            <Pre>{`[4B]  Magic (0x43484143 mainnet / 0x43484154 testnet)
[1B]  Message type
[4B]  Payload length (uint32 big-endian)
[NB]  Payload (JSON)`}</Pre>
            <DataTable headers={['Type', 'Name', 'Description']} rows={[
              ['0x01','Version',   'Handshake — announces height + version'],
              ['0x02','GetBlocks', 'Request blocks from height N'],
              ['0x03','Blocks',    'Block response'],
              ['0x04','Inv',       'Announce new block or tx hash'],
              ['0x05','GetData',   'Request specific block or tx'],
              ['0x06','Tx',        'Relay a transaction'],
              ['0x07','GetPeers',  'Request peer list'],
              ['0x08','Peers',     'Peer list response'],
            ]} />
          </section>

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

          <section id="errors">
            <H2 id="errors">Error Reference</H2>
            <DataTable headers={['HTTP', 'Error', 'Cause']} rows={[
              ['400', 'invalid height',                          'Non-integer height'],
              ['400', 'invalid hash',                           'Non-hex hash string'],
              ['400', 'invalid address',                        'Not a valid CK1 address'],
              ['400', 'mempool rejected: insufficient fee',     'Fee < 1,000 Cash'],
              ['400', 'mempool rejected: utxo not found',      'Spent or non-existent UTXO'],
              ['400', 'mempool rejected: invalid Ed25519 signature', 'Signature does not verify'],
              ['400', 'mempool rejected: coinbase output not yet mature', 'Reward before 10 confirmations'],
              ['404', 'block not found',                        'No block at height/hash'],
              ['404', 'transaction not found',                  'TxID not in index'],
              ['405', 'method not allowed',                     'Wrong HTTP method'],
            ]} />
            <div className="mt-12 pt-6 border-t border-border text-xs text-muted">
              Chakram Protocol — Kerala's Digital Currency —{' '}
              <Link to="/" className="text-gold hover:underline">Explorer</Link> ·{' '}
              <Link to="/wallet" className="text-gold hover:underline">Wallet</Link> ·{' '}
              <Link to="/faucet" className="text-gold hover:underline">Faucet</Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
