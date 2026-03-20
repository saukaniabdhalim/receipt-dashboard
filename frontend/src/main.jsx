import React from 'react'
import ReactDOM from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { createMsalConfig, resolveMsalAuthConfig } from './msalConfig.js'
import { getWorkerConfig } from './services/gistStorage.js'
import App from './App.jsx'
import './index.css'

async function bootstrap() {
  let workerConfig = {}
  try {
    workerConfig = await getWorkerConfig()
  } catch {
    // Ignore worker lookup failures and fall back to Vite env values.
  }

  const authConfig = resolveMsalAuthConfig(workerConfig)
  const msalInstance = new PublicClientApplication(createMsalConfig(authConfig))

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  )
}

bootstrap()
