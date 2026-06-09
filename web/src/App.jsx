import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Explorer  from './pages/Explorer.jsx'
import Wallet    from './pages/Wallet.jsx'
import Download  from './pages/Download.jsx'
import Docs      from './pages/Docs.jsx'
import Releases from './pages/Releases.jsx'

// Map subdomain prefix → path.
// wallet.chakram.one/ → /wallet, faucet.chakram.one/ → /faucet, etc.
const SUBDOMAIN_ROUTES = {
  wallet:   '/wallet',
  docs:     '/docs',
  download: '/download',
}

function SubdomainRedirect() {
  const navigate  = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname !== '/') return
    const sub = window.location.hostname.split('.')[0].toLowerCase()
    const target = SUBDOMAIN_ROUTES[sub]
    if (target) navigate(target, { replace: true })
  }, [pathname, navigate])

  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <SubdomainRedirect />
        <Routes>
          <Route path="/"         element={<Explorer />} />
          <Route path="/wallet"   element={<Wallet />} />
          <Route path="/download" element={<Download />} />
          <Route path="/docs"     element={<Docs />} />
          <Route path="/releases" element={<Releases />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
