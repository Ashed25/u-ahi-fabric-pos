import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { type Role, type User, db } from '../db/schema'
import { createUser, setOwnerPassword, updateUser } from '../db/users'
import { useSession } from '../session'
import { Btn, Field, Modal, Screen, inputCls } from '../ui/kit'

const ROLES: Role[] = ['seller', 'manager', 'owner']

/** Owner: add people, set roles and PINs, switch people off (never deleted: their sales keep their name). */
export function Users() {
  const { t } = useTranslation()
  const { user: me } = useSession()
  const users = useLiveQuery(() => db.users.toArray(), [])
  const [edit, setEdit] = useState<Partial<User> & { pin?: string; pw?: string }>()
  const [error, setError] = useState('')
  if (!users) return null

  async function save() {
    if (!edit) return
    try {
      if (edit.pin && !/^\d{4}$/.test(edit.pin)) return setError(t('users.errPin'))
      if (edit.id == null) {
        if (!edit.pin) return setError(t('users.errPin'))
        await createUser(edit.name ?? '', edit.role ?? 'seller', edit.pin)
      } else {
        await updateUser(edit.id, { name: edit.name, role: edit.role, active: edit.active, pin: edit.pin || undefined })
        if (edit.pw) await setOwnerPassword(edit.id, edit.pw)
      }
      setEdit(undefined)
      setError('')
    } catch (e) {
      const m = String(e)
      setError(/already used/.test(m) ? t('users.errPinUsed') : /owner/.test(m) ? t('users.errLastOwner') : /6 characters/.test(m) ? t('users.errPassword') : m)
    }
  }

  return (
    <Screen
      title={t('users.title')}
      actions={
        <Btn variant="ok" onClick={() => (setEdit({ role: 'seller', active: true }), setError(''))}>
          + {t('users.add')}
        </Btn>
      }
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="text-lg text-slate-700">{t('users.hint')}</p>
        {users.map((u) => (
          <button
            key={u.id}
            className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left ${u.active ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}
            onClick={() => (setEdit({ ...u, pin: '' }), setError(''))}
          >
            <span className="text-3xl">{u.role === 'owner' ? '👑' : u.role === 'manager' ? '🗝' : '🙂'}</span>
            <span className="flex-1 text-2xl font-bold">
              {u.name} {u.id === me?.id && <span className="text-base font-normal text-slate-600">({t('users.you')})</span>}
            </span>
            <span className="text-xl">{t(`role.${u.role}`)}</span>
            {!u.active && <span className="text-lg">{t('users.off')}</span>}
          </button>
        ))}
      </div>
      {edit && (
        <Modal onClose={() => setEdit(undefined)}>
          <h2 className="mb-4 text-2xl font-bold">{edit.id == null ? t('users.add') : edit.name}</h2>
          <div className="space-y-4">
            <Field label={t('users.name')}>
              <input className={inputCls} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <Btn key={r} variant={edit.role === r ? 'primary' : 'plain'} onClick={() => setEdit({ ...edit, role: r })}>
                  {t(`role.${r}`)}
                </Btn>
              ))}
            </div>
            <p className="text-base text-slate-600">{t(`role.${edit.role ?? 'seller'}Hint`)}</p>
            <Field label={t(edit.id == null ? 'users.pin' : 'users.newPin')}>
              <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={edit.pin ?? ''} onChange={(e) => setEdit({ ...edit, pin: e.target.value })} />
            </Field>
            {edit.id != null && edit.role === 'owner' && (
              <Field label={t('users.newPassword')}>
                <input className={inputCls} type="password" value={edit.pw ?? ''} onChange={(e) => setEdit({ ...edit, pw: e.target.value })} />
              </Field>
            )}
            {edit.id != null && (
              <label className="flex items-center gap-3 text-xl">
                <input type="checkbox" className="h-8 w-8" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
                {t('users.active')}
              </label>
            )}
            {error && <p className="rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="plain" onClick={() => setEdit(undefined)}>
                {t('common.cancel')}
              </Btn>
              <Btn variant="ok" onClick={save}>
                {t('common.save')}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </Screen>
  )
}
