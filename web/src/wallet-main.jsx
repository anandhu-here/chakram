import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Wallet from './pages/Wallet.jsx'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: true })
  StatusBar.setStyle({ style: Style.Default })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <Wallet />
    </ThemeProvider>
  </StrictMode>,
)
