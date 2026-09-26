import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { StoreProvider } from './store'
import './styles.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <div className="sky" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
    <App />
  </StoreProvider>,
)
