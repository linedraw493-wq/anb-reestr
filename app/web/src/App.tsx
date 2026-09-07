import { Navigate, Route, Routes } from 'react-router-dom'
import Blogger from './routes/Blogger'
import Card from './routes/Card'
import Code from './routes/Code'
import Done from './routes/Done'
import Invite from './routes/Invite'
import Katalog from './routes/Katalog'
import Login from './routes/Login'
import Moderator from './routes/Moderator'
import Moderatory from './routes/Moderatory'
import Priglasheniya from './routes/Priglasheniya'
import Svodka from './routes/Svodka'
import SpiskiEkran from './routes/Spiski'

export default function App() {
  return (
    <Routes>
      {/* Главная страница сайта — сам каталог. Слово владельца 02.09.2026:
          человек приходит искать блогеров, а не читать про нас. Витрина с
          рассказом убрана. Старый адрес /katalog остаётся живым: он уже
          разошёлся ссылками с фильтрами. */}
      <Route path="/" element={<Katalog />} />
      <Route path="/katalog" element={<Katalog />} />
      <Route path="/b/:id" element={<Blogger />} />

      {/* цепочка входа */}
      <Route path="/i/:token" element={<Invite />} />
      <Route path="/vhod" element={<Login />} />
      <Route path="/kod" element={<Code />} />
      <Route path="/gotovo" element={<Done />} />

      <Route path="/kartochka" element={<Card />} />

      {/* инструмент модератора — на сервере закрыт ролью */}
      <Route path="/moderator" element={<Moderator />} />
      <Route path="/moderator/spiski" element={<SpiskiEkran />} />
      <Route path="/moderator/priglasheniya" element={<Priglasheniya />} />
      <Route path="/moderator/svodka" element={<Svodka />} />
      <Route path="/moderator/lyudi" element={<Moderatory />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
