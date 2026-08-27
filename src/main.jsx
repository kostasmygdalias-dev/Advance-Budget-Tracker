import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { installGlobalErrorReporting } from '@/lib/errorReporting'
// Self-hosted (not the Google Fonts CDN — avoids sending user IPs to Google
// on every load, which is an actual GDPR concern for an EU-facing app).
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@/index.css'

installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
