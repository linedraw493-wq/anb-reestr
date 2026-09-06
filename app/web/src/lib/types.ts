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
  /** заготовка из таблицы заказчика без номера — человек вписывает свой */
  | { ok: false; reason: 'need-phone' }
  /** номер уже привязан к другой записи — склеивать нельзя, надо просто войти */
  | { ok: false; reason: 'phone-taken' }
  | { ok: false; reason: 'too-often'; retryAfter: number }
  /** номер верный, а SMS не ушла: у оператора не приняли или кончились деньги */
  | { ok: false; reason: 'no-delivery' }
  | { ok: false; reason: 'dead-invite' }

/** «Проверь код». Ключ — тот же, с каким начинали: ссылка или номер. */
export type CheckInput = { code: string; token?: string; phone?: string }

/**
 * `next` — куда вести после входа. Тот, кто уже подал карточку, попадает в
 * каталог: гнать его каждый раз «создайте карточку» неверно (слово владельца
 * 02.09.2026). Новичок идёт заполнять.
 */
export type CheckResult =
  | { ok: true; next: 'card' | 'katalog' }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'locked' }
  | { ok: false; reason: 'too-often'; retryAfter: number }

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
