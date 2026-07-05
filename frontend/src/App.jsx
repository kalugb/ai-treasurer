import { Routes, Route, Link } from 'react-router-dom'
import Home from './page/Home'
import Sidebar from './sidebar/Sidebar'

function App() {
  return (
    <div className="min-h-screen flex">
      <Sidebar />

      <main className="w-[90%]">
        <Routes>
            <Route path="/" element={<Home />} />
        </Routes>
			</main>
    </div>
  )
}

export default App