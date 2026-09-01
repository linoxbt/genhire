import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WalletProviders } from './lib/appkit'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WalletProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProviders>
    </ErrorBoundary>
  </StrictMode>,
)
