import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import { registerInstallPrompt } from './app/pwa/install-manager.js'
import { registerServiceWorker } from './app/pwa/update-manager.js'
import './styles/index.css'

registerInstallPrompt()
registerServiceWorker().catch(() => undefined)

const root = createRoot(document.getElementById('root'))
root.render(<App />)
