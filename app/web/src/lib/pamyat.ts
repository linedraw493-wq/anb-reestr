/* Память устройства: номер, с которого сюда входили.

   Сам вход держится cookie — она и есть «запомнил меня»: 60 дней, и срок
   отодвигается при каждом заходе. Здесь другое, помельче: если человек
   всё-таки вышел или срок истёк, ему не надо вспоминать и набирать номер
   заново — экран входа подставит тот, что был. Уходит только в этот
   браузер, на сервер не отправляется и в карточку не попадает.

   Слово владельца 07.09.2026: «сделай хэширование, чтобы запоминал вход в
   аккаунт». */

const KEY = 'anb.nomer'

export function zapomnitNomer(telefon: string): void {
  try {
    localStorage.setItem(KEY, telefon)
  } catch {
    /* приватное окно или запрет на хранение — просто не запомним */
  }
}

export function vspomnitNomer(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function zabytNomer(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}
