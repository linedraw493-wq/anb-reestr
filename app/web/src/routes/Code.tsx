import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readFlow } from '../lib/flow'
import type { Flow } from '../lib/types'
import { Kod } from '../ui/Kod'
import { Shell } from '../ui/Shell'

/**
 * Отдельный адрес для ввода кода.
 *
 * На входе по номеру код спрашивается прямо там же, без перехода (слово
 * владельца 07.09.2026 — «сделай авторизацию проще»). Этот адрес остаётся
 * для двух случаев: пришли по ссылке-приглашению и обновили страницу.
 */
export default function Code() {
  const navigate = useNavigate()
  const [flow] = useState<Flow | null>(() => readFlow())

  // Обновили страницу в приватном окне — номера уже нет, просим войти заново.
  useEffect(() => {
    if (!flow) navigate('/vhod', { replace: true })
  }, [flow, navigate])

  if (!flow) return null

  return (
    <Shell>
      <h1>Введите код</h1>
      <Kod
        flow={flow}
        gotovo={(next) =>
          navigate(flow.kuda ?? (next === 'katalog' ? '/' : '/gotovo'), { replace: true })
        }
        smenitNomer={flow.kind === 'login' ? () => navigate('/vhod', { replace: true }) : undefined}
      />
    </Shell>
  )
}
