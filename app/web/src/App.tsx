import { Navigate, Route, Routes } from 'react-router-dom'
import Card from './routes/Card'
import Code from './routes/Code'
import Done from './routes/Done'
import Invite from './routes/Invite'
import Login from './routes/Login'
import Moderator from './routes/Moderator'

export default function App() {
  return (
    <Routes>
      {/* цепочка входа */}
      <Route path="/i/:token" element={<Invite />} />
      <Route path="/vhod" element={<Login />} />
      <Route path="/kod" element={<Code />} />
      <Route path="/gotovo" element={<Done />} />

      <Route path="/kartochka" element={<Card />} />

      {/* инструмент модератора — на сервере закроется ролью admin */}
      <Route path="/moderator" element={<Moderator />} />

      <Route path="*" element={<Navigate to="/vhod" replace />} />
    </Routes>
  )
}
