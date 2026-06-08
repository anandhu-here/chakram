import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

const GCS = 'https://storage.googleapis.com/chakram-dist/latest'

function Step({ num, title, children }) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-goldbg border-2 border-gold/50 text-gold font-black text-base flex items-center justify-center shrink-0 shadow-sm">{num}</div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="pb-10 flex-1 min-w-0">
        <h3 className="font-bold text-text text-lg mb-2">{title}</h3>
        <div className="text-muted text-base leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <pre className="bg-surface2 border border-border rounded-xl p-5 mt-4 text-sm font-mono text-text overflow-x-auto leading-relaxed whitespace-pre-wrap">
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
    <div className={`mt-4 p-4 rounded-xl border text-base leading-relaxed ${styles[variant]}`}>
      {children}
    </div>
  )
}

function DlBtn({ href, children }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 border border-border bg-surface2 hover:border-gold hover:text-gold text-text text-sm font-medium px-5 py-2.5 rounded-xl transition-colors mt-3 mr-3">
      {children}
    </a>
  )
}

const TABS = [
  { id: 'mac',     label: '🍎 Mac'     },
  { id: 'windows', label: '🪟 Windows'  },
  { id: 'linux',   label: '🐧 Linux'   },
  { id: 'android', label: '🤖 Android' },
]

export default function Download() {
  const [tab, setTab] = useState('mac')

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      {/* Hero */}
      <div className="px-4 sm:px-8 pt-20 pb-14 text-center">
        <div className="inline-flex items-center gap-2 bg-goldbg border border-gold/30 text-gold text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
          ⛏ RandomX · CPU Mining
        </div>
        <h1 className="text-5xl sm:text-6xl font-black text-text mb-5 leading-tight tracking-tight">
          Run a <span className="text-gold">Chakram</span> Node
        </h1>
        <p className="text-muted text-xl max-w-xl mx-auto mb-10 leading-relaxed">
          Download the app and you're mining in under 5 minutes. No command line needed.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a href={`${GCS}/Chakram-mac-arm.zip`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-bold px-6 py-3.5 rounded-2xl transition-colors shadow-md active:scale-[0.98] text-base">
            ⬇ Mac — Apple Silicon
          </a>
          <a href={`${GCS}/Chakram-mac-intel.zip`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-bold px-6 py-3.5 rounded-2xl transition-colors shadow-md active:scale-[0.98] text-base">
            ⬇ Mac — Intel
          </a>
          <a href={`${GCS}/Chakram.exe`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-bold px-6 py-3.5 rounded-2xl transition-colors shadow-md active:scale-[0.98] text-base">
            ⬇ Windows
          </a>
          <a href={`${GCS}/chakram-wallet-unsigned.apk`}
            className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white font-bold px-6 py-3.5 rounded-2xl transition-colors shadow-md active:scale-[0.98] text-base">
            ⬇ Android APK
          </a>
          <Link to="/docs"
            className="inline-flex items-center gap-2 border-2 border-border bg-surface hover:border-gold hover:text-gold text-text font-bold px-6 py-3.5 rounded-2xl transition-colors text-base">
            Read the Docs ↗
          </Link>
        </div>
      </div>

      {/* Platform tabs */}
      <div className="px-4 sm:px-8 mb-10">
        <div className="flex bg-surface2 border border-border rounded-2xl p-1.5 gap-1.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-base font-semibold rounded-xl transition-all ${
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
      <div className="px-4 sm:px-8 pb-20 max-w-3xl">

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

        {tab === 'android' && (
          <div>
            {[
              {
                title: 'Download the APK',
                body: <>
                  <DlBtn href={`${GCS}/chakram-wallet-unsigned.apk`}>⬇ chakram-wallet-unsigned.apk</DlBtn>
                  <p className="mt-3">Saves to your Downloads folder. This is the Chakram mobile wallet — send, receive, and manage CHK from your phone.</p>
                  <Note variant="warn">⚠️ This APK is unsigned. You must allow installation from unknown sources on your device.</Note>
                </>,
              },
              {
                title: 'Allow unknown sources',
                body: <>
                  Android blocks apps not from the Play Store by default. To install:
                  <Code>{`Settings → Apps → Special app access\n→ Install unknown apps\n→ Your browser or Files app → Allow`}</Code>
                  <p className="mt-2">On older Android: <strong className="text-text">Settings → Security → Unknown sources → Enable</strong>.</p>
                </>,
              },
              {
                title: 'Install the APK',
                body: <>
                  Open your <strong className="text-text">Downloads</strong> folder and tap <strong className="text-text">chakram-wallet-unsigned.apk</strong>. Tap <strong className="text-text">Install</strong> when prompted.
                  <Note variant="info">ℹ️ Android may scan the file — this is normal. The app is open-source and safe.</Note>
                </>,
              },
              {
                title: 'Create or restore your wallet',
                body: <>
                  On first launch, create a new wallet or restore from your 12-word recovery phrase. Your wallet is encrypted on-device with your password.
                  <Note variant="warn">⚠️ Write down your 12-word recovery phrase. It's the only way to recover your funds if you lose the device.</Note>
                </>,
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
