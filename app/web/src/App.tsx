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
      <Route path="/kod" element={<Code />} />
      <Route path="/gotovo" element={<Done />} />

      <Route path="/kartochka" element={<Card />} />

      {/* Админка — свой адрес, слово владельца 07.09.2026: «сделай отдельную
          ссылку на админку». Один вход в неё: `/admin`. Гостя `Adminka`
          отправляет за кодом и возвращает обратно, блогеру говорит «сюда
          нельзя». Права всё равно проверяет сервер, это только вежливость. */}
      <Route
        path="/admin"
        element={
          <Adminka>
            <Moderator />
          </Adminka>
        }
      />
      <Route
        path="/admin/spiski"
        element={
          <Adminka>
            <SpiskiEkran />
          </Adminka>
        }
      />
      <Route
        path="/admin/priglasheniya"
        element={
          <Adminka>
            <Priglasheniya />
          </Adminka>
        }
      />
      <Route
        path="/admin/svodka"
        element={
          <Adminka>
            <Svodka />
          </Adminka>
        }
      />
      <Route
        path="/admin/prava"
        element={
          <Adminka>
            <Moderatory />
          </Adminka>
        }
      />

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
