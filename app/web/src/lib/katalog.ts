import type { Karta } from './card'

/* ---------------------------------------------------------------------------
   Каталог. Вход не нужен — каталог видим всем (решение владельца 02.09.2026).

   Фильтры живут в адресной строке, а не только в памяти страницы: настроил
   выборку — скинул ссылку клиенту. Так работают с рекламодателями.
--------------------------------------------------------------------------- */

export type Tochka = { gorod: string; shirota: number; dolgota: number; skolko: number }

export type Vydacha = {
  vsego: number
  stranica: number
  stranic: number
  karty: Karta[]
  tochki: Tochka[]
}

export type Poryadok = 'ohvat' | 'podpischiki' | 'deshevle' | 'novye'

export const PORYADKI: { key: Poryadok; label: string }[] = [
  { key: 'ohvat', label: 'по охвату' },
  { key: 'podpischiki', label: 'по подписчикам' },
  { key: 'deshevle', label: 'сначала дешевле' },
  { key: 'novye', label: 'сначала новые' },
]

/** Что человек накрутил фильтрами. Пустое поле — фильтр не задан. */
export type Filtry = {
  tematika: string
  gorod: string
  rayon: string
  yazyk: string
  ot: string
  do: string
  ohvat_ot: string
  stavka_do: string
  poisk: string
  poryadok: Poryadok
  stranica: number
}

export const PUSTYE: Filtry = {
  tematika: '',
  gorod: '',
  rayon: '',
  yazyk: '',
  ot: '',
  do: '',
  ohvat_ot: '',
  stavka_do: '',
  poisk: '',
  poryadok: 'ohvat',
  stranica: 1,
}

export function skolkoZadano(f: Filtry): number {
  return [
    f.tematika,
    f.gorod,
    f.rayon,
    f.yazyk,
    f.ot,
    f.do,
    f.ohvat_ot,
    f.stavka_do,
    f.poisk,
  ].filter(
    Boolean,
  ).length
}

/** Фильтры → адресная строка. Пустые не пишем, чтобы ссылка была читаемой. */
export function vAdres(f: Filtry): string {
  const p = new URLSearchParams()
  if (f.tematika) p.set('tematika', f.tematika)
  if (f.gorod) p.set('gorod', f.gorod)
  if (f.rayon) p.set('rayon', f.rayon)
  if (f.yazyk) p.set('yazyk', f.yazyk)
  if (f.ot) p.set('ot', f.ot)
  if (f.do) p.set('do', f.do)
  if (f.ohvat_ot) p.set('ohvat_ot', f.ohvat_ot)
  if (f.stavka_do) p.set('stavka_do', f.stavka_do)
  if (f.poisk) p.set('poisk', f.poisk)
  if (f.poryadok !== 'ohvat') p.set('poryadok', f.poryadok)
  if (f.stranica > 1) p.set('stranica', String(f.stranica))
  return p.toString()
}

export function izAdresa(stroka: string): Filtry {
  const p = new URLSearchParams(stroka)
  const poryadok = (p.get('poryadok') ?? 'ohvat') as Poryadok
  return {
    tematika: p.get('tematika') ?? '',
    gorod: p.get('gorod') ?? '',
    rayon: p.get('rayon') ?? '',
    yazyk: p.get('yazyk') ?? '',
    ot: p.get('ot') ?? '',
    do: p.get('do') ?? '',
    ohvat_ot: p.get('ohvat_ot') ?? '',
    stavka_do: p.get('stavka_do') ?? '',
    poisk: p.get('poisk') ?? '',
    poryadok: PORYADKI.some((x) => x.key === poryadok) ? poryadok : 'ohvat',
    stranica: Math.max(1, Number(p.get('stranica') ?? 1) || 1),
  }
}

export async function vzyatKatalog(f: Filtry): Promise<Vydacha> {
  const res = await fetch(`/api/katalog?${vAdres(f)}`)
  if (!res.ok) throw new Error('катал ог не ответил')
  return (await res.json()) as Vydacha
}

export async function vzyatOdnogo(
  id: string,
): Promise<{ ok: boolean; karta?: Karta; prosmotry?: number }> {
  const res = await fetch(`/api/katalog/${encodeURIComponent(id)}`)
  if (!res.ok) return { ok: false }
  return (await res.json()) as { ok: boolean; karta: Karta; prosmotry: number }
}
