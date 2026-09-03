import { useEffect, useState } from 'react'
import { USE_FAKE } from './rezhim'

/* ---------------------------------------------------------------------------
   Списки, из которых человек выбирает. На сервере они лежат таблицами и
   правятся админом без программиста — здесь только запасной набор на случай
   работы без сервера.

   Слово владельца 02.09.2026: «пока делаем что попало, лишь бы было для вида,
   потом добавим настоящий».
--------------------------------------------------------------------------- */

export const MAX_TEMATIK = 3

export type Spravochniki = {
  tematiki: string[]
  goroda: Record<string, string[]>
  /** те же города, разложенные по областям: список из 76 городов иначе не выбрать */
  oblasti?: { oblast: string; goroda: string[] }[]
  yazyki: string[]
}

const ZAPASNOY: Spravochniki = {
  tematiki: [
    'Мода',
    'Красота',
    'Еда и рестораны',
    'Путешествия',
    'Спорт и фитнес',
    'Семья и дети',
    'IT и технологии',
    'Бизнес и финансы',
    'Авто',
    'Дом и интерьер',
    'Юмор',
    'Музыка',
    'Образование',
    'Здоровье',
    'Игры',
    'Животные',
  ],
  goroda: {
    Алматы: [
      'Алатауский',
      'Алмалинский',
      'Ауэзовский',
      'Бостандыкский',
      'Жетысуский',
      'Медеуский',
      'Наурызбайский',
      'Турксибский',
    ],
    Астана: ['Алматинский', 'Байконурский', 'Есильский', 'Нура', 'Сарыаркинский'],
    Шымкент: ['Абайский', 'Аль-Фарабийский', 'Енбекшинский', 'Каратауский', 'Туран'],
    Актобе: [],
    Атырау: [],
    Караганда: [],
    Костанай: [],
    Кызылорда: [],
    Павлодар: [],
    Петропавловск: [],
    Семей: [],
    Тараз: [],
    Туркестан: [],
    'Усть-Каменогорск': [],
    Уральск: [],
    Актау: [],
    Кокшетау: [],
    Талдыкорган: [],
  },
  yazyki: ['Казахский', 'Русский', 'Оба'],
}

/** Текущие списки. Подменяются на серверные, как только те доедут. */
let seychas: Spravochniki = ZAPASNOY

export function spravochniki(): Spravochniki {
  return seychas
}

/** Есть ли у города районы — от этого зависит, обязателен ли район. */
export function nuzhenRayon(gorod: string): boolean {
  return (seychas.goroda[gorod] ?? []).length > 0
}

let zagruzka: Promise<void> | null = null

function zagruzit(): Promise<void> {
  if (zagruzka) return zagruzka
  zagruzka = fetch('/api/spravochniki')
    .then((r) => r.json())
    .then((d: Spravochniki) => {
      if (d?.tematiki?.length) seychas = d
    })
    .catch(() => {
      /* сервер не ответил — работаем на запасном наборе */
    })
  return zagruzka
}

/** Списки для экрана. Без сервера отдаёт запасной набор сразу. */
export function useSpravochniki(): Spravochniki {
  const [nabor, setNabor] = useState<Spravochniki>(seychas)
  useEffect(() => {
    if (USE_FAKE) return
    void zagruzit().then(() => setNabor(seychas))
  }, [])
  return nabor
}
