import { Session } from './ui/Session'
import { Today } from './ui/Today'
import { Lists } from './ui/Lists'
import { Dictionary } from './ui/Dictionary'
import { Progress } from './ui/Progress'
import { useStore } from './store'

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'lists', label: 'Списки' },
  { id: 'dict', label: 'Словарь' },
  { id: 'progress', label: 'Память' },
] as const

export function App() {
  const store = useStore()

  if (store.error) {
    return (
      <main className="screen">
        <h1>Память браузера закрыта</h1>
        <p>{store.error}</p>
      </main>
    )
  }

  if (!store.ready) {
    return (
      <div className="splash">
        <img className="logo" src="/icon-512.png" alt="" />
        <p>Sisheng</p>
      </div>
    )
  }

  if (store.session) return <Session />

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/icon-512.png" alt="" />
          <div>
            <b>Sisheng</b>
            <small>四声</small>
          </div>
        </div>
        <button
          type="button"
          className="theme-btn"
          onClick={() => store.updateSettings({ theme: store.settings.theme === 'night' ? 'paper' : 'night' })}
        >
          {store.settings.theme === 'night' ? <SunIcon /> : <MoonIcon />}
          {store.settings.theme === 'night' ? 'Бумага' : 'Космос'}
        </button>
      </header>
      <main key={store.tab}>
        {store.tab === 'today' && <Today />}
        {store.tab === 'lists' && <Lists />}
        {store.tab === 'dict' && <Dictionary />}
        {store.tab === 'progress' && <Progress />}
      </main>
      <nav className="tabs" style={{ ['--i' as string]: TABS.findIndex((tab) => tab.id === store.tab) }}>
        {TABS.map((tab) => (
          <button key={tab.id} type="button" className={store.tab === tab.id ? 'tab on' : 'tab'} onClick={() => store.setTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />
      <circle cx="18" cy="5" r="1" fill="currentColor" />
      <circle cx="21" cy="9" r="0.7" fill="currentColor" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
