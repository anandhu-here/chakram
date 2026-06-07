import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext.jsx'
import chakramLogo from '../assets/chakram.png'

const NAV = [
  { to: '/',         label: 'Explorer'  },
  { to: '/wallet',   label: 'Wallet'    },
  { to: '/download', label: 'Download'  },
  { to: '/docs',     label: 'Docs'      },
]

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

export default function Navbar({ right, search }) {
  const { pathname } = useLocation()
  const { dark, toggle } = useTheme()

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">

        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 mr-2">
          <img src={chakramLogo} alt="Chakram" className="h-8 w-auto" />
          <span className="font-bold text-text tracking-wider text-sm hidden sm:block">CHAKRAM</span>
        </Link>

        {/* Search slot */}
        {search && <div className="flex-1 min-w-0 max-w-md hidden md:block">{search}</div>}

        {/* Nav links */}
        <nav className="flex items-center ml-auto">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`
                relative px-3 py-1 text-sm font-medium transition-colors duration-150
                ${pathname === to ? 'text-gold' : 'text-muted hover:text-text'}
              `}
            >
              {label}
              {pathname === to && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-gold rounded-full" />
              )}
            </Link>
          ))}
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface2 transition-colors"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Right slot (status, badges) */}
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>

      {/* Mobile search */}
      {search && <div className="md:hidden px-4 pb-3">{search}</div>}
    </header>
  )
}
