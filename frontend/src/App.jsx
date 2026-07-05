import { Routes, Route } from 'react-router-dom'
import Chat from './page/Chat'
import Sidebar from './sidebar/Sidebar'

function App() {
  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto bg-background text-slate-900">
        <Routes>
          <Route path="/" element={<Chat />} />
        </Routes>
      </main>
    </div>
  )
}

export default App