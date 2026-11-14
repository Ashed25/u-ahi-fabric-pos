import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { go } from './router'

const variants = {
  primary: 'bg-blue-800 text-white active:bg-blue-950 disabled:bg-slate-400',
  ok: 'bg-green-700 text-white active:bg-green-900 disabled:bg-slate-400',
  danger: 'bg-red-700 text-white active:bg-red-900 disabled:bg-slate-400',
  plain: 'bg-slate-100 text-slate-900 border-2 border-slate-300 active:bg-slate-300 disabled:text-slate-400',
}

export function Btn({
  variant = 'primary',
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button {...p} className={`rounded-2xl px-5 text-xl font-bold ${variants[variant]} ${className}`} />
}

export function Screen({
  title,
  back = '#/',
  actions,
  children,
}: {
  title: string
  back?: string | null
  actions?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-10 flex items-center gap-3 bg-blue-900 px-4 py-2 text-white">
        {back !== null && (
          <button className="rounded-xl px-3 text-xl" onClick={() => go(back)}>
            ← {t('common.back')}
          </button>
        )}
        <h1 className="flex-1 truncate text-2xl font-bold">{title}</h1>
        {actions}
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-base text-slate-600">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-xl focus:border-blue-700 outline-none'

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** "12,500" / "၁၂,၅၀၀" / "" -> integer or undefined */
export function toInt(s: string): number | undefined {
  const ascii = s.replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040)).replace(/[,\s]/g, '')
  return /^\d+$/.test(ascii) ? Number(ascii) : undefined
}
