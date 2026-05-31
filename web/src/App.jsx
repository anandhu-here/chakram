import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Explorer  from './pages/Explorer.jsx'
import Wallet    from './pages/Wallet.jsx'
import Faucet    from './pages/Faucet.jsx'
import Download  from './pages/Download.jsx'
import Docs      from './pages/Docs.jsx'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"         element={<Explorer />} />
          <Route path="/wallet"   element={<Wallet />} />
          <Route path="/faucet"   element={<Faucet />} />
          <Route path="/download" element={<Download />} />
          <Route path="/docs"     element={<Docs />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
