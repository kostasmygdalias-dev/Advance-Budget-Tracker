import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
// Self-hosted (not the Google Fonts CDN — avoids sending user IPs to Google
// on every load, which is an actual GDPR concern for an EU-facing app).
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
