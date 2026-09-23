import { Session } from './ui/Session'
import { Today } from './ui/Today'
import { Lists } from './ui/Lists'
import { Progress } from './ui/Progress'
import { useStore } from './store'

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'lists', label: 'Списки' },
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
        <div className="seal">声</div>
        <p>Сышэн</p>
      </div>
    )
  }

  if (store.session) return <Session />

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="seal">声</span>
          <div>
            <b>Сышэн</b>
            <small>四声</small>
          </div>
        </div>
        <button
          type="button"
          className="text-btn"
          onClick={() => store.updateSettings({ theme: store.settings.theme === 'night' ? 'paper' : 'night' })}
        >
          {store.settings.theme === 'night' ? 'Бумага' : 'Ночь'}
        </button>
      </header>
      <main>
        {store.tab === 'today' && <Today />}
        {store.tab === 'lists' && <Lists />}
        {store.tab === 'progress' && <Progress />}
      </main>
      <nav className="tabs">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" className={store.tab === tab.id ? 'tab on' : 'tab'} onClick={() => store.setTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
