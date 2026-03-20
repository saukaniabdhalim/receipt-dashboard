// ============================================================
// MSAL (Microsoft Authentication) Configuration
// Replace CLIENT_ID with your Azure AD App Registration Client ID
// Replace TENANT_ID with your Azure AD Tenant ID (or 'common' for multi-tenant)
// ============================================================

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'common'}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        if (import.meta.env.DEV) console.debug('[MSAL]', message)
      },
    },
  },
}

export const loginRequest = {
  scopes: ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'],
}

export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphFilesEndpoint: 'https://graph.microsoft.com/v1.0/me/drive',
}
