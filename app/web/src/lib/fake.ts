import type {
  AuthApi,
  CheckInput,
  CheckResult,
  InviteState,
  StartInput,
  StartResult,
} from './types'

/* ---------------------------------------------------------------------------
   ЗАГЛУШКА. Живёт вместо сервера, пока сервера нет (шаг 1).
   Код всегда 000000 — и он же показан на экране серой плашкой.
   На шаге 2 те же ответы придут по сети от FastAPI; экраны не меняются.
--------------------------------------------------------------------------- */

import { otp, otpPodskazka } from './otp'

const TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5
const RESEND_SEC = 60
const DAY = 24 * 60 * 60 * 1000

type Invite = {
  nick: string
  phone: string
  invitedAt: string
  used: boolean
  expiresAt: number
}

/** Вымышленные приглашения. Настоящих телефонов здесь нет и не будет. */
const invites: Record<string, Invite> = {
  demo: {
    nick: '@aigerim.style',
    phone: '+77051234534',
    invitedAt: '28 августа',
    used: false,
    expiresAt: Date.now() + 30 * DAY,
  },
  used: {
    nick: '@already.in',
    phone: '+77017654321',
    invitedAt: '12 августа',
    used: true,
    expiresAt: Date.now() + 30 * DAY,
  },
  old: {
    nick: '@late.one',
    phone: '+77029876543',
    invitedAt: '1 июля',
    used: false,
    expiresAt: Date.now() - DAY,
  },
}

/** Кто уже в реестре — для повторного входа без ссылки. */
const registered = new Set<string>(['+77017654321'])

/** Билет выдаёт сервер (или заглушка) — сам код у нас не хранится. */
type Session = { ticket: string; expiresAt: number; attempts: number; startedAt: number }
const sessions = new Map<string, Session>()

const wait = (ms = 380) => new Promise((r) => setTimeout(r, ms))

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length < 11) return phone
  return `+${d[0]} ${d.slice(1, 4)} ••• •• ${d.slice(9, 11)}`
}

function liveInvite(token: string | undefined): Invite | null {
  if (!token) return null
  const inv = invites[token]
  if (!inv || inv.used || inv.expiresAt < Date.now()) return null
  return inv
}

export const fakeApi: AuthApi = {
  async invite(token): Promise<InviteState> {
    await wait()
    const inv = liveInvite(token)
    if (!inv) return { status: 'dead' }
    return {
      status: 'ok',
      nick: inv.nick,
      phoneMasked: maskPhone(inv.phone),
      invitedAt: inv.invitedAt,
    }
  },

  async start({ token, phone }: StartInput): Promise<StartResult> {
    await wait()

    let target: string
    if (token !== undefined) {
      const inv = liveInvite(token)
      if (!inv) return { ok: false, reason: 'dead-invite' }
      // номер поправили — с этого момента приглашение указывает на новый
      if (phone) inv.phone = phone
      target = inv.phone
    } else {
      if (!phone) return { ok: false, reason: 'bad-phone' }
      // Слово владельца: номера нет в базе — так и пишем.
      if (!registered.has(phone)) return { ok: false, reason: 'unknown-phone' }
      target = phone
    }

    const live = sessions.get(target)
    if (live && Date.now() - live.startedAt < RESEND_SEC * 1000) {
      const retryAfter = Math.ceil((RESEND_SEC * 1000 - (Date.now() - live.startedAt)) / 1000)
      return { ok: false, reason: 'too-often', retryAfter }
    }

    const vydacha = await otp.start(maskPhone(target))
    if (!vydacha.ok) return { ok: false, reason: 'bad-phone' }

    sessions.set(target, {
      ticket: vydacha.ticket,
      expiresAt: Date.now() + TTL_MS,
      attempts: 0,
      startedAt: Date.now(),
    })
    return { ok: true, resendAfter: vydacha.resendAfter, phoneMasked: maskPhone(target) }
  },

  async check({ code, token, phone }: CheckInput): Promise<CheckResult> {
    await wait()

    const inv = liveInvite(token)
    const target = token !== undefined ? inv?.phone : phone
    if (!target) return { ok: false, reason: 'expired' }

    const s = sessions.get(target)
    if (!s || s.expiresAt < Date.now()) {
      sessions.delete(target)
      return { ok: false, reason: 'expired' }
    }
    if (s.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' }

    if (!(await otp.check(s.ticket, code))) {
      s.attempts += 1
      const attemptsLeft = MAX_ATTEMPTS - s.attempts
      if (attemptsLeft <= 0) return { ok: false, reason: 'locked' }
      return { ok: false, reason: 'wrong', attemptsLeft }
    }

    sessions.delete(target)
    registered.add(target)
    if (inv) inv.used = true // ссылка одноразовая: после входа гаснет
    // Настоящий сервер здесь поставит cookie. Она недоступна скриптам,
    // поэтому экранам о ней знать нечего — их код не изменится.
    return { ok: true, next: 'card' }
  },
}

/** Строка внизу экрана: что сейчас поддельное, а что настоящее. */
export const fakeHint = otpPodskazka
