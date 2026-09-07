import { Navigate, Route, Routes } from 'react-router-dom'
import Blogger from './routes/Blogger'
import Card from './routes/Card'
import Code from './routes/Code'
import Done from './routes/Done'
import Invite from './routes/Invite'
import Katalog from './routes/Katalog'
import Login from './routes/Login'
import VhodAdmin from './routes/VhodAdmin'
import Moderator from './routes/Moderator'
import Moderatory from './routes/Moderatory'
import Priglasheniya from './routes/Priglasheniya'
import Svodka from './routes/Svodka'
import SpiskiEkran from './routes/Spiski'
import { Adminka } from './ui/Adminka'

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
      {/* Запасная дверь: логин и пароль. Ссылок сюда нет ни с одного
          экрана — адрес знает тот, кому сказали. Слово владельца
          07.09.2026: «скрытно, но понятно для обычного юзера». */}
      <Route path="/vhod/admin" element={<VhodAdmin />} />
      <Route path="/kod" element={<Code />} />
      <Route path="/gotovo" element={<Done />} />

      <Route path="/kartochka" element={<Card />} />

      {/* Админка — одно табло: колонка слева живёт постоянно, меняется
          только содержимое справа. Слово владельца 07.09.2026: «функционал
          должен быть в одном табло», «мув плавный и мягкий». Вход в неё —
          `/admin`; гостя `Adminka` отправит за кодом и вернёт обратно. */}
      <Route path="/admin" element={<Adminka />}>
        <Route index element={<Moderator />} />
        <Route path="priglasheniya" element={<Priglasheniya />} />
        <Route path="prava" element={<Moderatory />} />
        <Route path="spiski" element={<SpiskiEkran />} />
        <Route path="svodka" element={<Svodka />} />
      </Route>

      {/* Старые адреса админки живут ссылками в записях и закладках —
          уводим на новые, а не показываем «страница не найдена». */}
      <Route path="/moderator" element={<Navigate to="/admin" replace />} />
      <Route path="/moderator/spiski" element={<Navigate to="/admin/spiski" replace />} />
      <Route
        path="/moderator/priglasheniya"
        element={<Navigate to="/admin/priglasheniya" replace />}
      />
      <Route path="/moderator/svodka" element={<Navigate to="/admin/svodka" replace />} />
      <Route path="/moderator/lyudi" element={<Navigate to="/admin/prava" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
