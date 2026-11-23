import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateMe } from '../db/users'
import { useSession } from '../session'
import { Btn, Field, Screen, inputCls } from '../ui/kit'

/** Everyone: change your own name and PIN. */
export function Profile() {
  const { t } = useTranslation()
  const { user, login } = useSession()
  const [f, setF] = useState({ name: user?.name ?? '', current: '', pin: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  async function save() {
    if (f.pin && !/^\d{4}$/.test(f.pin)) return setMsg({ ok: false, text: t('users.errPin') })
    try {
      login(await updateMe(f.current, { name: f.name, pin: f.pin || undefined }))
      setF({ ...f, current: '', pin: '' })
      setMsg({ ok: true, text: t('profile.saved') })
    } catch (e) {
      const m = String(e)
      setMsg({ ok: false, text: /Wrong current/.test(m) ? t('profile.errCurrent') : /already used/.test(m) ? t('users.errPinUsed') : m })
    }
  }

  return (
    <Screen title={t('profile.title')}>
      <div className="mx-auto max-w-xl space-y-4">
        <Field label={t('users.name')}>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('users.newPin')}>
          <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} />
        </Field>
        <Field label={t('profile.currentPin')}>
          <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        {msg && <p className={`rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100' : 'bg-red-100 text-red-900'}`}>{msg.text}</p>}
        <Btn variant="ok" className="w-full" disabled={f.current.length !== 4 || !f.name.trim()} onClick={save}>
          {t('common.save')}
        </Btn>
      </div>
    </Screen>
  )
}
