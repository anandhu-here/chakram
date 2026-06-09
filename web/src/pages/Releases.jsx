import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

const GH_API = 'https://api.github.com/repos/anandhu-here/chakram/releases'

const PLATFORM_ASSETS = {
  'chakram-mac-arm':     { label: 'Mac ARM',   icon: '🍎' },
  'chakram-mac':         { label: 'Mac Intel', icon: '🍎' },
  'chakram-windows.exe': { label: 'Windows',   icon: '🪟' },
  'chakram-linux':       { label: 'Linux',     icon: '🐧' },
}

function ReleaseRow({ release, isLatest }) {
  const date = new Date(release.published_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const assets = (release.assets || []).filter(a => PLATFORM_ASSETS[a.name])

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface2/50 transition-colors">
      <td className="py-3 px-4 w-40">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-text text-sm">{release.tag_name}</span>
          {isLatest && (
            <span className="text-xs font-semibold bg-goldbg border border-gold/40 text-gold px-2 py-0.5 rounded-full">
              Latest
            </span>
          )}
        </div>
        <div className="text-xs text-muted mt-0.5">{date}</div>
      </td>
      <td className="py-3 px-4">
        <div className="flex flex-wrap gap-1.5">
          {assets.length > 0 ? assets.map(a => (
            <a
              key={a.name}
              href={a.browser_download_url}
              className="inline-flex items-center gap-1 text-xs border border-border hover:border-gold hover:text-gold text-muted px-2.5 py-1 rounded-md transition-colors"
            >
              <span>{PLATFORM_ASSETS[a.name].icon}</span>
              {PLATFORM_ASSETS[a.name].label}
            </a>
          )) : (
            <span className="text-xs text-muted">GUI — see release notes</span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 w-24 hidden sm:table-cell">
        <a
          href={release.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gold hover:underline"
        >
          Changelog ↗
        </a>
      </td>
    </tr>
  )
}

export default function Releases() {
  const [releases, setReleases] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [showAll,  setShowAll]  = useState(false)

  useEffect(() => {
    fetch(`${GH_API}?per_page=50`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setReleases(data)
        else setError(true)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  const visible = showAll ? releases : releases.slice(0, 10)
  const latest  = releases[0]

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      {/* ── Hero ── */}
      <div className="px-4 sm:px-8 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-goldbg border border-gold/30 text-gold text-xs font-semibold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wide">
          Chakram (CHK)
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-text mb-4 leading-tight tracking-tight">
          Release <span className="text-gold">History</span>
        </h1>
        <p className="text-muted text-lg max-w-md mx-auto mb-8 leading-relaxed">
          All Chakram node releases. Download any version or view changelogs on GitHub.
        </p>

        {/* Latest version quick-download — populated once API loads */}
        {latest && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted">
              Latest:{' '}
              <span className="font-mono font-semibold text-text">{latest.tag_name}</span>
              {' · '}
              {new Date(latest.published_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </p>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {(latest.assets || [])
                .filter(a => PLATFORM_ASSETS[a.name])
                .map(a => (
                  <a
                    key={a.name}
                    href={a.browser_download_url}
                    className="inline-flex items-center gap-2 bg-gold hover:bg-golddim text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors active:scale-[0.98]"
                  >
                    ⬇ {PLATFORM_ASSETS[a.name].icon} {PLATFORM_ASSETS[a.name].label}
                  </a>
                ))}
              <Link
                to="/download"
                className="inline-flex items-center gap-2 border border-border bg-surface hover:border-gold hover:text-gold text-text text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                Install guide ↗
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="px-4 sm:px-8 pb-20 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text">
            All releases
            {!loading && !error && (
              <span className="ml-2 text-xs font-normal text-muted">({releases.length})</span>
            )}
          </h2>
          <a
            href="https://github.com/anandhu-here/chakram/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gold hover:underline"
          >
            View on GitHub ↗
          </a>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-surface">
          {loading && (
            <div className="py-10 text-center text-muted text-sm">Loading releases…</div>
          )}
          {error && !loading && (
            <div className="py-10 text-center text-muted text-sm">
              Could not load releases.{' '}
              <a
                href="https://github.com/anandhu-here/chakram/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold hover:underline"
              >
                View on GitHub ↗
              </a>
            </div>
          )}
          {!loading && !error && releases.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface2">
                  <th className="text-left py-2.5 px-4 text-muted font-semibold text-xs uppercase tracking-wider">Version</th>
                  <th className="text-left py-2.5 px-4 text-muted font-semibold text-xs uppercase tracking-wider">Downloads</th>
                  <th className="text-left py-2.5 px-4 text-muted font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <ReleaseRow key={r.id} release={r} isLatest={i === 0} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && releases.length > 10 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="mt-3 w-full py-2.5 text-xs text-muted hover:text-gold border border-border hover:border-gold rounded-xl transition-colors"
          >
            {showAll ? 'Show fewer' : `Show all ${releases.length} releases`}
          </button>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-muted text-xs">
          Chakram (CHK) —{' '}
          <a href="https://github.com/anandhu-here/chakram" target="_blank" rel="noopener" className="text-gold hover:underline">GitHub ↗</a>
          {' · '}<Link to="/download" className="text-gold hover:underline">Download</Link>
          {' · '}<Link to="/docs"     className="text-gold hover:underline">Docs</Link>
          {' · '}<Link to="/wallet"   className="text-gold hover:underline">Wallet</Link>
        </p>
      </footer>
    </div>
  )
}