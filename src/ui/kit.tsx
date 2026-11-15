import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { go } from './router'

const variants = {
  primary: 'bg-blue-800 text-white shadow-sm active:bg-blue-950 disabled:bg-slate-300 disabled:shadow-none',
  ok: 'bg-green-700 text-white shadow-sm active:bg-green-900 disabled:bg-slate-300 disabled:shadow-none',
  danger: 'bg-red-700 text-white shadow-sm active:bg-red-900 disabled:bg-slate-300 disabled:shadow-none',
  plain: 'bg-white text-slate-800 border border-slate-300 shadow-sm active:bg-slate-100 disabled:text-slate-400 disabled:shadow-none',
}

export function Btn({
  variant = 'primary',
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  // Default text-xl only when the caller sets no size: two text-* classes would fight.
  const size = /\btext-(xs|sm|base|lg|xl|\dxl)\b/.test(className) ? '' : 'text-lg'
  return <button {...p} className={`rounded-xl px-4 font-bold transition-colors ${size} ${variants[variant]} ${className}`} />
}

export function Screen({
  title,
  back = '#/menu',
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
      <header className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-blue-900 px-3 py-1.5 text-white shadow">
        {back !== null && (
          <button className="min-h-10 shrink-0 rounded-lg px-2 text-lg active:bg-blue-950" onClick={() => go(back)}>
            ← {t('common.back')}
          </button>
        )}
        <h1 className="min-w-32 flex-1 truncate text-xl font-bold">{title}</h1>
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

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg shadow-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200'

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-5 shadow-xl"
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
