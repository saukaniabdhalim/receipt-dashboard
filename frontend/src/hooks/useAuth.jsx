import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'
import { msalConfig, loginRequest } from '../msalConfig'
import { getToken, getUserProfile } from '../services/oneDriveService'

const AuthContext = createContext(null)

let msalInstance = null

function getMsalInstance() {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig)
  }
  return msalInstance
}

export function AuthProvider({ children }) {
  const [msal] = useState(() => getMsalInstance())
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [msalReady, setMsalReady] = useState(false)

  useEffect(() => {
    msal.initialize().then(() => {
      setMsalReady(true)
      // Handle redirect response
      msal.handleRedirectPromise().then((resp) => {
        if (resp?.account) {
          msal.setActiveAccount(resp.account)
        }
        const accounts = msal.getAllAccounts()
        if (accounts.length > 0) {
          msal.setActiveAccount(accounts[0])
          refreshToken()
        } else {
          setLoading(false)
        }
      }).catch((e) => {
        console.warn('MSAL redirect error:', e)
        setLoading(false)
      })
    }).catch((e) => {
      console.warn('MSAL init error:', e)
      setLoading(false)
      setMsalReady(true)
    })
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const t = await getToken(msal, loginRequest)
      setToken(t)
      const profile = await getUserProfile(t)
      setUser(profile)
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        setToken(null)
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [msal])

  const login = useCallback(async () => {
    setError(null)
    try {
      if (!msalReady) throw new Error('MSAL not initialized')
      await msal.loginPopup(loginRequest)
      await refreshToken()
    } catch (e) {
      if (e.errorCode !== 'user_cancelled') {
        setError(e.message)
      }
    }
  }, [msal, msalReady, refreshToken])

  const logout = useCallback(async () => {
    try {
      await msal.logoutPopup()
    } catch {}
    setUser(null)
    setToken(null)
  }, [msal])

  return (
    <AuthContext.Provider value={{ msal, user, token, loading, error, login, logout, msalReady }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
