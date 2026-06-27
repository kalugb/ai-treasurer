import { Outlet } from 'react-router-dom'
import Sidebar from './components/sidebar/Sidebar'

export default function App() {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main className="flex-1 min-w-0 bg-[#F7F4EF]">
        <Outlet />
      </main>
    </div>
  )
}
