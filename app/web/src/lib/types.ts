/** Что сервер отвечает на «покажи приглашение по ссылке». */
export type InviteState =
  | { status: 'ok'; nick: string; phoneMasked: string; invitedAt: string }
  /** ссылка битая, просроченная или уже использованная — человеку разницы нет */
  | { status: 'dead' }

/**
 * «Отправь код».
 * По приглашению телефон можно не передавать — сервер возьмёт его из ссылки.
 * Передан `phone` — человек поправил номер, работаем с новым.
 */
export type StartInput = { token?: string; phone?: string }

export type StartResult =
  | { ok: true; resendAfter: number; phoneMasked: string }
  /** номера нет в базе — говорим честно (слово владельца 02.09.2026) */
  | { ok: false; reason: 'unknown-phone' }
  | { ok: false; reason: 'bad-phone' }
  | { ok: false; reason: 'too-often'; retryAfter: number }
  | { ok: false; reason: 'dead-invite' }

/** «Проверь код». Ключ — тот же, с каким начинали: ссылка или номер. */
export type CheckInput = { code: string; token?: string; phone?: string }

export type CheckResult =
  | { ok: true; next: 'card' }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'locked' }

/** Как человек попал на экран кода — по приглашению или обычным входом. */
export type Flow = {
  kind: 'invite' | 'login'
  phoneMasked: string
  token?: string
  phone?: string
}

export interface AuthApi {
  invite(token: string): Promise<InviteState>
  start(input: StartInput): Promise<StartResult>
  check(input: CheckInput): Promise<CheckResult>
}
