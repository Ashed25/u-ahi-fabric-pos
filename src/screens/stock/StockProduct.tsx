import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, timeText } from '../../core/fy'
import { formatInches, formatLargestFirst } from '../../core/length'
import { formatKs } from '../../core/money'
import { fabricLeft, isLow } from '../../core/stock'
import { type MoveReason, type Roll, type Variant, db } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { markRemnant, receivePieces, receiveRoll, setPieces, setRollLength } from '../../db/stock'
import { useSettings } from '../../db/useSettings'
import { subText } from '../../ui/format'
import { Btn, Field, Modal, Screen, inputCls, toInt } from '../../ui/kit'
import { Photo } from '../../ui/photo'
import { go, useRoute } from '../../ui/router'
import { YardsInches } from '../../ui/YardsInches'
import { useScanToProduct } from './StockList'

type Dialog =
  | { kind: 'receivePieces'; v: Variant }
  | { kind: 'setPieces'; v: Variant }
  | { kind: 'receiveRoll' }
  | { kind: 'setRoll'; r: Roll }
  | { kind: 'remnant'; r: Roll }

export function StockProduct({ id }: { id: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const { query } = useRoute()
  const counting = query.count === '1'
  const settings = useSettings()
  const [dialog, setDialog] = useState<Dialog>()
  const [showFinished, setShowFinished] = useState(false)
  useScanToProduct(counting ? '?count=1' : '')

  const data = useLiveQuery(async () => {
    const p = await db.products.get(id)
    if (!p) return null
    const [variants, rolls, moves] = await Promise.all([
      db.variants.where('productId').equals(id).toArray(),
      db.rolls.where('productId').equals(id).toArray(),
      db.stockMoves.where('productId').equals(id).reverse().sortBy('at'),
    ])
    return { p, variants, rolls, moves: moves.slice(0, 40) }
  }, [id])
  if (!settings || data === undefined) return null
  if (data === null) return <Screen title="?">—</Screen>
  const { p, variants, rolls, moves } = data
  const fmt = (tenths: number) => formatLargestFirst(tenths, settings.units, lang)
  const left = p.kind === 'piece' ? variants.reduce((s, v) => s + v.qty, 0) : fabricLeft(rolls)
  const open = rolls.filter((r) => r.status !== 'finished').sort((a, b) => a.receivedAt - b.receivedAt)
  const finished = rolls.filter((r) => r.status === 'finished')

  return (
    <Screen title={p.nameMy} back={counting ? '#/count' : '#/stock'}>
      <div className="mx-auto max-w-3xl space-y-4">
        {counting && <p className="rounded-xl bg-blue-100 p-3 text-xl">📋 {t('count.onProduct')}</p>}
        <div className="flex items-center gap-4">
          <Photo blob={p.photo} className="h-24 w-24 rounded-2xl" />
          <div>
            <div className={`text-3xl font-bold ${isLow(left, p.lowStock) ? 'text-red-700' : ''}`}>
              {p.kind === 'piece' ? t('stock.pieces', { count: left }) : fmt(left)}
            </div>
            {p.kind === 'length' && <div className="text-lg text-slate-600">({formatInches(left)}")</div>}
            {isLow(left, p.lowStock) && <div className="text-xl font-bold text-red-700">⚠ {t('stock.low')}</div>}
          </div>
        </div>

        {p.kind === 'piece' &&
          variants.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 p-3">
              <span className="flex-1 text-xl">{subText(t, p, v) || p.nameMy}</span>
              <span className="w-28 text-right text-3xl font-bold">{v.qty}</span>
              <Btn variant="ok" onClick={() => setDialog({ kind: 'receivePieces', v })}>
                + {t('stock.receive')}
              </Btn>
              <Btn variant={counting ? 'primary' : 'plain'} onClick={() => setDialog({ kind: 'setPieces', v })}>
                {t(counting ? 'count.enter' : 'stock.adjust')}
              </Btn>
            </div>
          ))}

        {p.kind === 'length' && (
          <>
            <Btn variant="ok" className="w-full" onClick={() => setDialog({ kind: 'receiveRoll' })}>
              + {t('stock.newRoll')}
            </Btn>
            {open.map((r) => (
              <RollCard key={r.id} r={r} settings={settings} counting={counting} onSet={() => setDialog({ kind: 'setRoll', r })} onRemnant={() => setDialog({ kind: 'remnant', r })} />
            ))}
            {finished.length > 0 && (
              <Btn variant="plain" onClick={() => setShowFinished(!showFinished)}>
                {t('stock.finishedRolls', { count: finished.length })}
              </Btn>
            )}
            {showFinished && finished.map((r) => <RollCard key={r.id} r={r} settings={settings} counting={false} onSet={() => setDialog({ kind: 'setRoll', r })} />)}
          </>
        )}

        <section>
          <h2 className="mb-2 text-xl font-bold">{t('stock.history')}</h2>
          <ul className="divide-y divide-slate-200 text-lg">
            {moves.map((m) => (
              <li key={m.id} className="flex gap-3 py-1">
                <span className="w-40 text-slate-600">
                  {dateKey(m.at)} {timeText(m.at)}
                </span>
                <span className="w-28">{t(`reason.${m.reason}`)}</span>
                <span className={`w-40 font-bold ${(m.deltaQty ?? m.deltaTenths ?? 0) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {m.deltaTenths != null ? `${m.deltaTenths < 0 ? '−' : '+'}${fmt(Math.abs(m.deltaTenths))}` : `${(m.deltaQty ?? 0) > 0 ? '+' : ''}${m.deltaQty}`}
                </span>
                <span className="flex-1 truncate text-slate-600">{m.refId ?? m.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {dialog && <StockDialog dialog={dialog} productId={p.id!} settings={settings} counting={counting} onClose={() => setDialog(undefined)} />}
    </Screen>
  )
}

function RollCard({ r, settings, counting, onSet, onRemnant }: { r: Roll; settings: Settings; counting: boolean; onSet: () => void; onRemnant?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const fmt = (tenths: number) => formatLargestFirst(tenths, settings.units, lang)
  const short = r.status === 'active' && r.remainingTenths < settings.remnantBelowTenths
  return (
    <div className={`rounded-2xl border-2 p-3 ${r.status === 'remnant' ? 'border-amber-400 bg-amber-50' : r.status === 'finished' ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xl font-bold">
          {r.status === 'remnant' ? `✂ ${t('stock.remnant')}` : t('stock.roll')} #{r.id}
        </span>
        <span className="text-base text-slate-600">
          {t('stock.received')} {dateKey(r.receivedAt)} · {fmt(r.startTenths)}
        </span>
      </div>
      <div className="text-3xl font-bold">
        {fmt(r.remainingTenths)} <span className="text-lg font-normal text-slate-600">({formatInches(r.remainingTenths)}")</span>
      </div>
      {r.status === 'remnant' && (
        <div className="text-xl text-amber-800">{r.remnantPct ? t('stock.remnantPct', { pct: r.remnantPct }) : t('stock.remnantWhole', { price: formatKs(r.remnantPriceKs ?? 0) })}</div>
      )}
      {short && <div className="text-xl font-bold text-amber-800">✂ {t('stock.offerRemnant')}</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn variant={counting ? 'primary' : 'plain'} onClick={onSet}>
          {t(counting ? 'count.measure' : 'stock.adjust')}
        </Btn>
        {onRemnant && (
          <Btn variant={short ? 'primary' : 'plain'} onClick={onRemnant}>
            ✂ {t('stock.remnant')}
          </Btn>
        )}
        <Btn variant="plain" onClick={() => go(`#/labels?roll=${r.id}`)}>
          🏷 {t('stock.rollLabel')}
        </Btn>
      </div>
    </div>
  )
}

function StockDialog({ dialog, productId, settings, counting, onClose }: { dialog: Dialog; productId: number; settings: Settings; counting: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const isSet = dialog.kind === 'setPieces' || dialog.kind === 'setRoll'
  const [qty, setQty] = useState(dialog.kind === 'setPieces' && !counting ? String(dialog.v.qty) : '')
  const [tenths, setTenths] = useState<number | undefined>(dialog.kind === 'setRoll' && !counting ? dialog.r.remainingTenths : undefined)
  const [reason, setReason] = useState<Extract<MoveReason, 'count' | 'adjust' | 'waste'>>(counting ? 'count' : 'adjust')
  const [note, setNote] = useState('')
  const [remnant, setRemnant] = useState<'pct' | 'whole'>(dialog.kind === 'remnant' && dialog.r.remnantPriceKs ? 'whole' : 'pct')
  const [amount, setAmount] = useState(dialog.kind === 'remnant' ? String(dialog.r.remnantPct ?? dialog.r.remnantPriceKs ?? '') : '')
  const [error, setError] = useState('')

  async function save() {
    try {
      if (dialog.kind === 'receivePieces' || dialog.kind === 'setPieces') {
        const n = toInt(qty)
        if (n === undefined) return setError(t('stock.errNumber'))
        if (dialog.kind === 'receivePieces') await receivePieces(dialog.v.id!, n, undefined, note.trim() || undefined)
        else await setPieces(dialog.v.id!, n, reason, note)
      } else if (dialog.kind === 'receiveRoll' || dialog.kind === 'setRoll') {
        if (tenths === undefined) return setError(t('stock.errNumber'))
        if (dialog.kind === 'receiveRoll') await receiveRoll(productId, tenths, undefined, note.trim() || undefined)
        else await setRollLength(dialog.r.id!, tenths, reason, note)
      } else {
        const n = toInt(amount)
        if (n === undefined) return setError(t('stock.errNumber'))
        await markRemnant(dialog.r.id!, remnant === 'pct' ? { pct: n } : { wholeKs: n })
      }
      onClose()
    } catch (e) {
      setError(/reason/i.test(String(e)) ? t('stock.errReason') : String(e))
    }
  }

  const title = {
    receivePieces: t('stock.receive'),
    setPieces: t(counting ? 'count.enter' : 'stock.adjust'),
    receiveRoll: t('stock.newRoll'),
    setRoll: t(counting ? 'count.measure' : 'stock.adjust'),
    remnant: t('stock.remnant'),
  }[dialog.kind]

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>
      <div className="space-y-4">
        {(dialog.kind === 'receivePieces' || dialog.kind === 'setPieces') && (
          <Field label={t(dialog.kind === 'receivePieces' ? 'stock.howManyIn' : 'stock.howManyNow')}>
            <input autoFocus className={`${inputCls} text-4xl`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        )}
        {(dialog.kind === 'receiveRoll' || dialog.kind === 'setRoll') && (
          <Field label={t(dialog.kind === 'receiveRoll' ? 'stock.rollLength' : 'stock.measuredNow')}>
            <YardsInches units={settings.units} initialTenths={tenths} onChange={setTenths} />
          </Field>
        )}
        {dialog.kind === 'remnant' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant={remnant === 'pct' ? 'primary' : 'plain'} onClick={() => setRemnant('pct')}>
                {t('stock.remnantByPct')}
              </Btn>
              <Btn variant={remnant === 'whole' ? 'primary' : 'plain'} onClick={() => setRemnant('whole')}>
                {t('stock.remnantByWhole')}
              </Btn>
            </div>
            <Field label={t(remnant === 'pct' ? 'stock.pctOff' : 'stock.wholePrice')}>
              <input className={`${inputCls} text-3xl`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {dialog.r.status === 'remnant' && (
              <Btn variant="plain" onClick={async () => (await markRemnant(dialog.r.id!, null), onClose())}>
                {t('stock.unmarkRemnant')}
              </Btn>
            )}
          </>
        )}
        {isSet && (
          <div className="grid grid-cols-3 gap-2">
            {(['count', 'adjust', 'waste'] as const).map((r) => (
              <Btn key={r} variant={reason === r ? 'primary' : 'plain'} onClick={() => setReason(r)}>
                {t(`reason.${r}`)}
              </Btn>
            ))}
          </div>
        )}
        {dialog.kind !== 'remnant' && (
          <Field label={t(isSet && reason !== 'count' ? 'stock.noteRequired' : 'stock.note')}>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {error && <p className="rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="plain" onClick={onClose}>
            {t('common.cancel')}
          </Btn>
          <Btn variant="ok" onClick={save}>
            {t('common.save')}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
