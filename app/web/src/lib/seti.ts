/* Соцсети определяются по вставленной ссылке — человек не вводит имя
   в готовый шаблон, а просто вставляет то, что скопировал.
   Слово владельца 02.09.2026. */

export type Set = {
  key: string
  name: string
  short: string
  /** что показать человеку вместо длинной ссылки */
  handle: string
  url: string
}

const ZNAKOMYE: { key: string; name: string; short: string; hosts: string[] }[] = [
  { key: 'instagram', name: 'Instagram', short: 'IG', hosts: ['instagram.com'] },
  { key: 'tiktok', name: 'TikTok', short: 'TT', hosts: ['tiktok.com'] },
  { key: 'youtube', name: 'YouTube', short: 'YT', hosts: ['youtube.com', 'youtu.be'] },
  { key: 'telegram', name: 'Telegram', short: 'TG', hosts: ['t.me', 'telegram.me'] },
  { key: 'whatsapp', name: 'WhatsApp', short: 'WA', hosts: ['wa.me', 'api.whatsapp.com'] },
  { key: 'threads', name: 'Threads', short: 'TH', hosts: ['threads.net', 'threads.com'] },
  { key: 'facebook', name: 'Facebook', short: 'FB', hosts: ['facebook.com', 'fb.com'] },
  { key: 'vk', name: 'ВКонтакте', short: 'VK', hosts: ['vk.com'] },
]

/** Разбирает вставленную ссылку. null — если это вообще не ссылка. */
export function razobrat(raw: string): Set | null {
  const text = raw.trim()
  if (text === '') return null

  let u: URL
  try {
    u = new URL(text.startsWith('http') ? text : `https://${text}`)
  } catch {
    return null
  }

  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (!host.includes('.')) return null

  const znakomaya = ZNAKOMYE.find((z) => z.hosts.includes(host))
  const put = u.pathname.replace(/\/+$/, '').replace(/^\/+/, '')
  const handle = put === '' ? host : `@${put.split('/')[0].replace(/^@/, '')}`

  if (!znakomaya) {
    // Незнакомый сайт всё равно принимаем — имя берём от домена, а «кто» из пути.
    return {
      key: host,
      name: host,
      short: host.slice(0, 2).toUpperCase(),
      handle: put === '' ? host : handle,
      url: u.href,
    }
  }
  return { key: znakomaya.key, name: znakomaya.name, short: znakomaya.short, handle, url: u.href }
}

export function razobratVse(ssylki: string[]): Set[] {
  return ssylki.map(razobrat).filter((s): s is Set => s !== null)
}
