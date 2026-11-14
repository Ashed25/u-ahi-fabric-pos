import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Role, User } from './db/schema'
import { useSettings } from './db/useSettings'
import { atLeast, checkOwnerPassword, findByPin, setCurrentUser, setupOwner } from './db/users'
import { Btn, Field, Modal, inputCls } from './ui/kit'
import { beepError } from './ui/sound'
import { useScanner } from './ui/useScanner'

interface SessionApi {
  user?: User
  ownerOk: boolean // owner password entered since the last unlock
  login: (u: User) => void
  lock: () => void
  unlockOwner: () => void
  /** Resolves with the current user if allowed, otherwise asks a manager/owner for their PIN. undefined = cancelled. */
  approve: (min: Role) => Promise<User | undefined>
}

const Ctx = createContext<SessionApi>(null!)
export const useSession = () => useContext(Ctx)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>()
  const [ownerOk, setOwnerOk] = useState(false)
  const [asking, setAsking] = useState<{ min: Role; resolve: (u?: User) => void }>()

  const api: SessionApi = {
    user,
    ownerOk,
    login: (u) => {
      setCurrentUser(u)
      setUser(u)
      setOwnerOk(false)
    },
    lock: () => {
      setCurrentUser(undefined)
      setUser(undefined)
      setOwnerOk(false)
    },
    unlockOwner: () => setOwnerOk(true),
    approve: (min) => (atLeast(user, min) ? Promise.resolve(user) : new Promise((resolve) => setAsking({ min, resolve }))),
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {asking && (
        <ApprovePin
          min={asking.min}
          onDone={(u) => {
            asking.resolve(u)
            setAsking(undefined)
          }}
        />
      )}
    </Ctx.Provider>
  )
}

/** Big PIN pad for elderly users: 4 dots, large digits, submits by itself at 4 digits. */
export function PinPad({ onPin, error }: { onPin: (pin: string) => void; error?: string }) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  useScanner(null) // a barcode scan must not type into the PIN
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) {
      onPin(next)
      setPin('')
    }
  }
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-4 flex justify-center gap-4" aria-label={t('lock.pin')}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-6 w-6 rounded-full border-4 border-blue-900 ${i < pin.length ? 'bg-blue-900' : ''}`} />
        ))}
      </div>
      {error && <p className="mb-3 rounded-xl bg-red-100 p-2 text-center text-xl font-bold text-red-900">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Btn key={d} variant="plain" className="min-h-20 text-4xl" onClick={() => press(d)}>
            {d}
          </Btn>
        ))}
        <Btn variant="plain" className="min-h-20 text-3xl" aria-label={t('lock.delete')} onClick={() => setPin(pin.slice(0, -1))}>
          ⌫
        </Btn>
        <Btn variant="plain" className="min-h-20 text-4xl" onClick={() => press('0')}>
          0
        </Btn>
        <span />
      </div>
    </div>
  )
}

/** Wrong PINs: after 5 tries, wait 30 s. */
function usePinGuard() {
  const fails = useRef(0)
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [until])
  const waitS = Math.max(0, Math.ceil((until - now) / 1000))
  return {
    waitS,
    fail() {
      beepError()
      fails.current += 1
      if (fails.current >= 5) {
        fails.current = 0
        setUntil(Date.now() + 30_000)
        setNow(Date.now())
      }
    },
    ok() {
      fails.current = 0
    },
  }
}

export function LockScreen() {
  const { t } = useTranslation()
  const settings = useSettings()
  const { login } = useSession()
  const [error, setError] = useState('')
  const guard = usePinGuard()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 p-4">
      <h1 className="text-4xl font-bold text-blue-900">{settings?.shopName}</h1>
      <p className="text-2xl">{t('lock.enterPin')}</p>
      {guard.waitS > 0 ? (
        <p className="rounded-xl bg-red-100 p-4 text-2xl font-bold text-red-900">{t('lock.wait', { s: guard.waitS })}</p>
      ) : (
        <PinPad
          error={error}
          onPin={async (pin) => {
            const u = await findByPin(pin)
            if (!u) {
              guard.fail()
              return setError(t('lock.wrong'))
            }
            guard.ok()
            login(u)
          }}
        />
      )}
    </div>
  )
}

function ApprovePin({ min, onDone }: { min: Role; onDone: (u?: User) => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const guard = usePinGuard()
  return (
    <Modal onClose={() => onDone(undefined)}>
      <h2 className="mb-2 text-center text-2xl font-bold">{t(min === 'owner' ? 'lock.ownerApprove' : 'lock.managerApprove')}</h2>
      {guard.waitS > 0 ? (
        <p className="rounded-xl bg-red-100 p-4 text-center text-2xl font-bold text-red-900">{t('lock.wait', { s: guard.waitS })}</p>
      ) : (
        <PinPad
          error={error}
          onPin={async (pin) => {
            const u = await findByPin(pin)
            if (!atLeast(u, min)) {
              guard.fail()
              return setError(t(u ? 'lock.notAllowed' : 'lock.wrong'))
            }
            onDone(u)
          }}
        />
      )}
      <Btn variant="plain" className="mt-4 w-full" onClick={() => onDone(undefined)}>
        {t('common.cancel')}
      </Btn>
    </Modal>
  )
}

/** Owner-only screens: ask for the owner password once per unlock. */
export function OwnerGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { ownerOk, unlockOwner } = useSession()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  if (ownerOk) return children
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <form
        className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await checkOwnerPassword(pw)) unlockOwner()
          else {
            beepError()
            setError(t('lock.wrongPassword'))
          }
        }}
      >
        <h1 className="text-2xl font-bold">🔑 {t('lock.ownerArea')}</h1>
        <Field label={t('lock.password')}>
          <input autoFocus type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-red-100 p-2 text-xl font-bold text-red-900">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Btn type="button" variant="plain" onClick={() => history.back()}>
            {t('common.back')}
          </Btn>
          <Btn type="submit" variant="ok">
            {t('common.ok')}
          </Btn>
        </div>
      </form>
    </div>
  )
}

/** First start: create the owner (name, 4-digit PIN, password for the owner area). */
export function Setup() {
  const { t } = useTranslation()
  const { login, unlockOwner } = useSession()
  const [f, setF] = useState({ name: '', pin: '', pin2: '', pw: '', pw2: '' })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <form
        className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow"
        onSubmit={async (e) => {
          e.preventDefault()
          if (f.pin !== f.pin2) return setError(t('setup.pinMismatch'))
          if (f.pw !== f.pw2) return setError(t('setup.pwMismatch'))
          try {
            login(await setupOwner(f.name, f.pin, f.pw))
            unlockOwner()
          } catch (err) {
            setError(String(err))
          }
        }}
      >
        <h1 className="text-3xl font-bold">{t('setup.title')}</h1>
        <p className="text-lg text-slate-700">{t('setup.hint')}</p>
        <Field label={t('setup.name')}>
          <input className={inputCls} value={f.name} onChange={set('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('setup.pin')}>
            <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={set('pin')} />
          </Field>
          <Field label={t('setup.pinAgain')}>
            <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={f.pin2} onChange={set('pin2')} />
          </Field>
          <Field label={t('setup.password')}>
            <input className={inputCls} type="password" value={f.pw} onChange={set('pw')} />
          </Field>
          <Field label={t('setup.passwordAgain')}>
            <input className={inputCls} type="password" value={f.pw2} onChange={set('pw2')} />
          </Field>
        </div>
        {error && <p className="rounded-xl bg-red-100 p-2 text-xl font-bold text-red-900">{error}</p>}
        <Btn type="submit" variant="ok" className="w-full py-4 text-2xl">
          {t('setup.create')}
        </Btn>
      </form>
    </div>
  )
}

/** Lock after N minutes without a touch, key or scan (setting; 0 = never). */
export function useAutoLock() {
  const { user, lock } = useSession()
  const settings = useSettings()
  const minutes = settings?.autoLockMinutes ?? 5
  const lockRef = useRef(lock)
  lockRef.current = lock
  useEffect(() => {
    if (!user || !minutes) return
    let last = Date.now()
    const touch = () => {
      last = Date.now()
    }
    const events = ['pointerdown', 'keydown'] as const
    events.forEach((e) => document.addEventListener(e, touch, true))
    const id = setInterval(() => {
      if (Date.now() - last > minutes * 60_000) lockRef.current()
    }, 10_000)
    return () => {
      clearInterval(id)
      events.forEach((e) => document.removeEventListener(e, touch, true))
    }
  }, [user, minutes])
}
