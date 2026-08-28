import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import { unregisterLegacyServiceWorkers } from './app/utils/serviceWorkerCleanup.js'
import './styles/index.css'

unregisterLegacyServiceWorkers().catch(() => undefined)

const root = createRoot(document.getElementById('root'))
root.render(<App />)
