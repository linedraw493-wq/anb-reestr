import { Navigate, Route, Routes } from 'react-router-dom'
import Blogger from './routes/Blogger'
import Card from './routes/Card'
import Code from './routes/Code'
import Done from './routes/Done'
import Glavnaya from './routes/Glavnaya'
import Invite from './routes/Invite'
import Katalog from './routes/Katalog'
import Login from './routes/Login'
import Moderator from './routes/Moderator'
import Priglasheniya from './routes/Priglasheniya'
import Svodka from './routes/Svodka'
import SpiskiEkran from './routes/Spiski'

export default function App() {
  return (
    <Routes>
      {/* публичное: витрина и каталог видны всем, вход не нужен */}
      <Route path="/" element={<Glavnaya />} />
      <Route path="/katalog" element={<Katalog />} />
      <Route path="/b/:id" element={<Blogger />} />

      {/* цепочка входа */}
      <Route path="/i/:token" element={<Invite />} />
      <Route path="/vhod" element={<Login />} />
      <Route path="/kod" element={<Code />} />
      <Route path="/gotovo" element={<Done />} />

      <Route path="/kartochka" element={<Card />} />

      {/* инструмент модератора — на сервере закроется ролью admin */}
      <Route path="/moderator" element={<Moderator />} />
      <Route path="/moderator/spiski" element={<SpiskiEkran />} />
      <Route path="/moderator/priglasheniya" element={<Priglasheniya />} />
      <Route path="/moderator/svodka" element={<Svodka />} />

      <Route path="*" element={<Navigate to="/katalog" replace />} />
    </Routes>
  )
}
