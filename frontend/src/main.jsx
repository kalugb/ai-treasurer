import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import ChatPage from './routes/ChatPage'
import Page1 from './routes/Page1'
import Page2 from './routes/Page2'
import Page3 from './routes/Page3'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<ChatPage />} />
          <Route path="page-1" element={<Page1 />} />
          <Route path="page-2" element={<Page2 />} />
          <Route path="page-3" element={<Page3 />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
