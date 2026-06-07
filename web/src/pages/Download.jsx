import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

const GCS = 'https://storage.googleapis.com/chakram-dist/latest'

function Step({ num, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-goldbg border border-gold/40 text-gold font-bold text-sm flex items-center justify-center shrink-0">{num}</div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="pb-8 flex-1 min-w-0">
        <h3 className="font-semibold text-text mb-2">{title}</h3>
        <div className="text-muted text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <pre className="bg-surface2 border border-border rounded-lg p-4 mt-3 text-xs font-mono text-text overflow-x-auto leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  )
}

function Note({ variant = 'info', children }) {
  const styles = {
    info:  'bg-blue/5  border-blue/20  text-blue',
    warn:  'bg-orange/5 border-orange/20 text-orange',
    gold:  'bg-goldbg  border-gold/30  text-gold',
  }
  return (
    <div className={`mt-3 p-3 rounded-lg border text-sm leading-relaxed ${styles[variant]}`}>
      {children}
    </div>
  )
}

function DlBtn({ href, children }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 border border-border bg-surface2 hover:border-gold hover:text-gold text-text text-sm px-4 py-2 rounded-lg transition-colors mt-2 mr-2">
      {children}
    </a>
  )
}

const TABS = [
  { id: 'mac',     label: '🍎 Mac'    },
  { id: 'windows', label: '🪟 Windows' },
  { id: 'linux',   label: '🐧 Linux'  },
]

export default function Download() {
  const [tab, setTab] = useState('mac')

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      {/* Hero */}
      <div className=" mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-text mb-4 leading-tight">
          Run a <span className="text-gold">Chakram</span> Node
        </h1>
        <p className="text-muted text-lg max-w-lg mx-auto mb-8">
          Download the app and you're mining in under 5 minutes. No command line needed.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a href={`${GCS}/Chakram-mac-arm.zip`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-semibold px-5 py-3 rounded-xl transition-colors shadow-sm">
            ⬇ Mac — Apple Silicon
          </a>
          <a href={`${GCS}/Chakram-mac-intel.zip`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-semibold px-5 py-3 rounded-xl transition-colors shadow-sm">
            ⬇ Mac — Intel
          </a>
          <a href={`${GCS}/Chakram.exe`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-semibold px-5 py-3 rounded-xl transition-colors shadow-sm">
            ⬇ Windows
          </a>
          <Link to="/docs"
            className="inline-flex items-center gap-2 border border-border bg-surface hover:border-gold hover:text-gold text-text font-semibold px-5 py-3 rounded-xl transition-colors">
            Read the Docs
          </Link>
        </div>
      </div>

      {/* Platform tabs */}
      <div className=" mx-auto px-4 sm:px-6 mb-8">
        <div className="flex bg-surface2 border border-border rounded-xl p-1 gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t.id
                  ? 'bg-surface shadow-sm text-text border border-border'
                  : 'text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className=" mx-auto px-4 sm:px-6 pb-16">

        {tab === 'mac' && (
          <div>
            {[
              {
                title: 'Download the Mac app',
                body: <>
                  Pick your chip:
                  <DlBtn href={`${GCS}/Chakram-mac-arm.zip`}>⬇ Apple Silicon (M1/M2/M3/M4)</DlBtn>
                  <DlBtn href={`${GCS}/Chakram-mac-intel.zip`}>⬇ Intel Mac</DlBtn>
                  <p className="mt-3">Not sure? <strong className="text-text">Apple menu → About This Mac</strong>. If it says Apple M-series, download Silicon. If Intel Core, download Intel.</p>
                </>,
              },
              {
                title: 'Unzip the file',
                body: <>
                  Double-click <strong className="text-text">Chakram-mac.zip</strong> in Downloads — Mac unzips automatically.
                  <Code>📦 Chakram-mac.zip{'\n'}🖥 Chakram.app  ← this is the app</Code>
                </>,
              },
              {
                title: 'Try to open Chakram.app',
                body: <>
                  Double-click <strong className="text-text">Chakram.app</strong>. Mac shows a security warning — <strong className="text-text">this is normal</strong> for apps not from the App Store.
                  <Code>🚫 "Chakram" cannot be opened because Apple cannot check it for malicious software.</Code>
                  Click <strong className="text-text">OK</strong>, then continue to the next step.
                  <Note variant="info">ℹ️ Chakram is open-source and distributed directly — not through the App Store. It's safe.</Note>
                </>,
              },
              {
                title: 'Allow in System Settings',
                body: <>
                  Open <strong className="text-text">System Settings → Privacy &amp; Security</strong>. Scroll down to find <em>"Chakram was blocked"</em> and click <strong className="text-text">Open Anyway</strong>.
                  <Note variant="gold">💡 On macOS Ventura or older: System Preferences → Security &amp; Privacy → General tab.</Note>
                </>,
              },
              {
                title: 'Confirm and open',
                body: <>Mac asks one more time. Click <strong className="text-text">Open</strong>. You only do this once — Mac remembers.</>,
              },
              {
                title: 'Create your wallet',
                body: <>
                  On first launch, create a wallet. Choose a <strong className="text-text">password</strong> then write down your <strong className="text-text">12-word recovery phrase</strong> on paper.
                  <Note variant="warn">⚠️ Never share your 12 words. Anyone who has them controls your wallet.</Note>
                </>,
              },
              {
                title: 'Start mining',
                body: <>
                  The app connects to mainnet and syncs the blockchain. Click <strong className="text-text">Start Mining</strong> to begin earning CHK.
                  <Note variant="info">💡 Mining works on any modern Mac — no special hardware needed. More cores = more chances to win.</Note>
                </>,
              },
            ].map((s, i) => <Step key={i} num={i + 1} title={s.title}>{s.body}</Step>)}
          </div>
        )}

        {tab === 'windows' && (
          <div>
            {[
              {
                title: 'Download the Windows app',
                body: <><DlBtn href={`${GCS}/Chakram.exe`}>⬇ Chakram.exe</DlBtn><p className="mt-3">Saves to your Downloads folder.</p></>,
              },
              {
                title: 'Run Chakram.exe',
                body: <>
                  Double-click <strong className="text-text">Chakram.exe</strong>. Windows SmartScreen may warn you — <strong className="text-text">this is normal</strong>.
                  <Code>🛡 Windows protected your PC{'\n\n'}Microsoft Defender SmartScreen prevented an unrecognized app…</Code>
                  Click <strong className="text-text">More info</strong> then <strong className="text-text">Run anyway</strong>.
                  <Note variant="info">ℹ️ Chakram is distributed directly, not through the Microsoft Store. It's safe.</Note>
                </>,
              },
              {
                title: 'Create your wallet',
                body: <>
                  On first launch, choose a <strong className="text-text">password</strong> and write down your <strong className="text-text">12-word recovery phrase</strong>.
                  <Note variant="warn">⚠️ Never share your 12 words. Anyone who has them controls your wallet.</Note>
                </>,
              },
              {
                title: 'Start mining',
                body: <>Connects to mainnet and syncs. Click <strong className="text-text">Start Mining</strong> to begin earning CHK.<Note variant="info">💡 No special hardware needed.</Note></>,
              },
            ].map((s, i) => <Step key={i} num={i + 1} title={s.title}>{s.body}</Step>)}
          </div>
        )}

        {tab === 'linux' && (
          <div>
            {[
              {
                title: 'Download the binary',
                body: <Code>{`curl -L ${GCS}/chakram-linux -o chakram`}</Code>,
              },
              {
                title: 'Make it executable',
                body: <Code>chmod +x chakram</Code>,
              },
              {
                title: 'Create a wallet',
                body: <>
                  <Code>./chakram wallet new</Code>
                  <p className="mt-2">Write down your 12-word phrase somewhere safe.</p>
                </>,
              },
              {
                title: 'Run a node and mine',
                body: <>
                  <Code>./chakram node --mine</Code>
                  To keep it running after closing the terminal:
                  <Code>{`screen -S chakram\n./chakram node --mine\n\n# Ctrl+A then D to detach`}</Code>
                  <Note variant="info">💡 For a permanent node, see the <Link to="/docs" className="text-gold hover:underline">docs</Link> for systemd setup.</Note>
                </>,
              },
            ].map((s, i) => <Step key={i} num={i + 1} title={s.title}>{s.body}</Step>)}
          </div>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-muted text-xs">
          Chakram (CHK) —{' '}
          <a href="https://github.com/anandhu-here/chakram" target="_blank" rel="noopener" className="text-gold hover:underline">GitHub ↗</a>
          {' · '}<Link to="/docs" className="text-gold hover:underline">Docs</Link>
          {' · '}<Link to="/wallet" className="text-gold hover:underline">Wallet</Link>
        </p>
      </footer>
    </div>
  )
}
