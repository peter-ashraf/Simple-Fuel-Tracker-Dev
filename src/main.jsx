import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { FuelProvider } from './hooks/useFuelContext.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import './index.css'
import './i18n'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <FuelProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </FuelProvider>
    </ThemeProvider>
  </StrictMode>,
)
