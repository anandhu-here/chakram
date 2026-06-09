import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

const GCS = 'https://storage.googleapis.com/chakram-dist/latest'

const TABS = [
  { id: 'mac',     label: '🍎 Mac'     },
  { id: 'windows', label: '🪟 Windows'  },
  { id: 'linux',   label: '🐧 Linux'   },
  { id: 'android', label: '🤖 Android' },
]

const PANEL_META = {
  mac:     { title: 'Install on Mac',     sub: 'Works on Apple Silicon and Intel, macOS 12 or later.' },
  windows: { title: 'Install on Windows', sub: 'Windows 10 or later, 64-bit.'                         },
  linux:   { title: 'Install on Linux',   sub: 'x86-64, any modern distro.'                           },
  android: { title: 'Install on Android', sub: 'Wallet app — send, receive, and manage CHK.'          },
}

function StepRow({ num, title, children }) {
  return (
    <div className="flex gap-4 px-6 py-5 border-b border-border last:border-b-0">
      <div className="w-6 h-6 rounded-full border border-border text-muted text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-text mb-1.5">{title}</h3>
        <div className="text-sm text-muted leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <pre className="bg-surface2 border border-border rounded-lg px-4 py-3 mt-2.5 text-xs font-mono text-text overflow-x-auto leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  )
}

function Note({ variant = 'info', children }) {
  const styles = {
    info: 'bg-blue/5  border-blue/20  text-blue',
    warn: 'bg-orange/5 border-orange/20 text-orange',
  }
  return (
    <div className={`mt-2.5 px-3.5 py-2.5 rounded-lg border text-xs leading-relaxed ${styles[variant]}`}>
      {children}
    </div>
  )
}

function DlBtn({ href, children }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 border border-border bg-surface2 hover:border-gold hover:text-gold text-text text-xs font-medium px-3 py-1.5 rounded-md transition-colors mt-2 mr-2"
    >
      {children}
    </a>
  )
}

export default function Download() {
  const [tab, setTab] = useState('mac')
  const meta = PANEL_META[tab]

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      {/* ── Hero ── */}
      <div className="px-4 sm:px-8 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-goldbg border border-gold/30 text-gold text-xs font-semibold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wide">
          RandomX · CPU Mining
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-text mb-4 leading-tight tracking-tight">
          Run a <span className="text-gold">Chakram</span> Node
        </h1>
        <p className="text-muted text-lg max-w-md mx-auto mb-8 leading-relaxed">
          Download the app and start mining CHK in under five minutes. No command line needed.
        </p>
        <div className="flex flex-wrap gap-2.5 justify-center">
          <a href={`${GCS}/Chakram-mac-arm.zip`}   className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors active:scale-[0.98]">⬇ Mac — Apple Silicon</a>
          <a href={`${GCS}/Chakram-mac-intel.zip`} className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors active:scale-[0.98]">⬇ Mac — Intel</a>
          <a href={`${GCS}/Chakram.exe`}           className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors active:scale-[0.98]">⬇ Windows</a>
          <a href={`${GCS}/chakram-wallet-unsigned.apk`} className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors active:scale-[0.98]">⬇ Android APK</a>
          <Link to="/docs"     className="inline-flex items-center gap-2 border border-border bg-surface hover:border-gold hover:text-gold text-text text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">Read the Docs ↗</Link>
          <Link to="/releases" className="inline-flex items-center gap-2 border border-border bg-surface hover:border-gold hover:text-gold text-text text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">All Releases ↗</Link>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="px-4 sm:px-8 pb-16 mx-auto">
        <div className="flex gap-6 items-start">

          {/* Sidebar tab list */}
          <nav className="hidden sm:flex flex-col gap-0.5 w-44 shrink-0 sticky top-6">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  tab === t.id
                    ? 'bg-surface border border-border text-text font-semibold'
                    : 'text-muted hover:bg-surface2 hover:text-text'
                }`}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Mobile tab bar */}
          <div className="sm:hidden w-full mb-4">
            <div className="flex bg-surface2 border border-border rounded-xl p-1 gap-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                    tab === t.id
                      ? 'bg-surface border border-border text-text shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Steps panel */}
          <div className="flex-1 min-w-0 bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text">{meta.title}</h2>
              <p className="text-xs text-muted mt-0.5">{meta.sub}</p>
            </div>

            {tab === 'mac' && <>
              <StepRow num={1} title="Download the app">
                Pick your chip — not sure? Check <strong className="text-text">Apple menu → About This Mac</strong>. M-series = Silicon, Intel Core = Intel.
                <div>
                  <DlBtn href={`${GCS}/Chakram-mac-arm.zip`}>⬇ Apple Silicon (M1 – M4)</DlBtn>
                  <DlBtn href={`${GCS}/Chakram-mac-intel.zip`}>⬇ Intel Mac</DlBtn>
                </div>
              </StepRow>
              <StepRow num={2} title="Unzip and open">
                Double-click the zip to extract <strong className="text-text">Chakram.app</strong>, then double-click to open. Mac will show a security warning — this is normal for apps outside the App Store.
                <Code>🚫 "Chakram" cannot be opened because Apple cannot check it for malicious software.</Code>
                <p className="mt-2">Click <strong className="text-text">OK</strong>, then go to <strong className="text-text">System Settings → Privacy &amp; Security</strong> and click <strong className="text-text">Open Anyway</strong>.</p>
                <Note variant="info">ℹ️ Chakram is open-source and distributed directly — source at github.com/anandhu-here/chakram.</Note>
              </StepRow>
              <StepRow num={3} title="Create your wallet">
                On first launch, choose a <strong className="text-text">password</strong> and write down your <strong className="text-text">12-word recovery phrase</strong> on paper.
                <Note variant="warn">⚠️ Never share your 12 words. Anyone with them controls your wallet.</Note>
              </StepRow>
              <StepRow num={4} title="Start mining">
                The app connects to mainnet and syncs. Click <strong className="text-text">Start Mining</strong> to begin earning CHK. No special hardware needed.
              </StepRow>
            </>}

            {tab === 'windows' && <>
              <StepRow num={1} title="Download Chakram.exe">
                <DlBtn href={`${GCS}/Chakram.exe`}>⬇ Chakram.exe</DlBtn>
                <p className="mt-2">The file saves to your Downloads folder.</p>
              </StepRow>
              <StepRow num={2} title="Run the installer">
                Double-click <strong className="text-text">Chakram.exe</strong>. Windows SmartScreen may warn you — click <strong className="text-text">More info</strong> then <strong className="text-text">Run anyway</strong>.
                <Note variant="info">ℹ️ Chakram is open-source and distributed directly, not through the Microsoft Store.</Note>
              </StepRow>
              <StepRow num={3} title="Create your wallet">
                Choose a <strong className="text-text">password</strong> and write down your <strong className="text-text">12-word recovery phrase</strong>.
                <Note variant="warn">⚠️ Never share your 12 words. Anyone with them controls your wallet.</Note>
              </StepRow>
              <StepRow num={4} title="Start mining">
                Connects to mainnet and syncs. Click <strong className="text-text">Start Mining</strong> to earn CHK. No special hardware needed.
              </StepRow>
            </>}

            {tab === 'linux' && <>
              <StepRow num={1} title="Download the binary">
                <Code>{`curl -L ${GCS}/chakram-linux -o chakram\nchmod +x chakram`}</Code>
              </StepRow>
              <StepRow num={2} title="Create a wallet">
                <Code>./chakram wallet new</Code>
                <p className="mt-2">Write down your 12-word phrase somewhere safe.</p>
              </StepRow>
              <StepRow num={3} title="Run a node and mine">
                <Code>./chakram node --mine</Code>
                <p className="mt-2">To keep it running after closing the terminal:</p>
                <Code>{`screen -S chakram\n./chakram node --mine\n\n# Ctrl+A then D to detach`}</Code>
                <Note variant="info">💡 For a permanent node, see the <Link to="/docs" className="text-gold hover:underline">docs</Link> for systemd setup.</Note>
              </StepRow>
            </>}

            {tab === 'android' && <>
              <StepRow num={1} title="Download the APK">
                <DlBtn href={`${GCS}/chakram-wallet-unsigned.apk`}>⬇ chakram-wallet-unsigned.apk</DlBtn>
                <Note variant="warn">⚠️ This APK is unsigned — you must allow installation from unknown sources.</Note>
              </StepRow>
              <StepRow num={2} title="Allow unknown sources">
                <Code>{`Settings → Apps → Special app access\n→ Install unknown apps\n→ Your browser or Files app → Allow`}</Code>
              </StepRow>
              <StepRow num={3} title="Install and open">
                Tap <strong className="text-text">chakram-wallet-unsigned.apk</strong> in Downloads and tap <strong className="text-text">Install</strong>.
              </StepRow>
              <StepRow num={4} title="Create or restore your wallet">
                Create a new wallet or restore from your 12-word phrase.
                <Note variant="warn">⚠️ Write down your 12-word recovery phrase — it's the only way to recover funds if you lose the device.</Note>
              </StepRow>
            </>}
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-muted text-xs">
          Chakram (CHK) —{' '}
          <a href="https://github.com/anandhu-here/chakram" target="_blank" rel="noopener" className="text-gold hover:underline">GitHub ↗</a>
          {' · '}<Link to="/docs"     className="text-gold hover:underline">Docs</Link>
          {' · '}<Link to="/releases" className="text-gold hover:underline">Releases</Link>
          {' · '}<Link to="/wallet"   className="text-gold hover:underline">Wallet</Link>
        </p>
      </footer>
    </div>
  )
}