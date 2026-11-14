import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { looksLikeMisread } from '../../core/barcode'
import { addPiece, type CartLine, cartTotals, type LengthLine, lineTotal, removeLast, setQty } from '../../core/cart'
import { timeText } from '../../core/fy'
import { formatEntered, formatInches } from '../../core/length'
import { formatKs } from '../../core/money'
import { assignBarcode, findByBarcode } from '../../db/products'
import { completeSale, parkSale, resumeParked } from '../../db/sales'
import { type Product, type Variant, db } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { useSettings } from '../../db/useSettings'
import { Btn, Modal, inputCls, toInt } from '../../ui/kit'
import { roundFraction } from '../../core/pricing'
import { atLeast } from '../../db/users'
import { useSession } from '../../session'
import { SyncBadge } from '../../sync/runner'
import { Photo } from '../../ui/photo'
import { ReceiptModal } from '../../ui/ReceiptModal'
import { go } from '../../ui/router'
import { beepError, beepOk } from '../../ui/sound'
import { useScanner } from '../../ui/useScanner'
import { LengthEntry } from './LengthEntry'
import { Payment } from './Payment'
import { PhotoGrid, VariantPick } from './PhotoGrid'
import { getPendingCredit, lengthLine, pieceItem, setPendingCredit, useStoredCart } from './lines'
import { creditLeft, payOutCredit } from '../../db/returns'

type Flash = { ok: boolean; text: string }
type Done = { saleId: string; practice: boolean; totalKs: number; changeKs: number }
/** Why the photo grid is open: to sell an item, or to link an unknown barcode to a product. */
type GridMode = { kind: 'sell' } | { kind: 'assign'; code: string }

export function Sell() {
  const settings = useSettings()
  return settings ? <SellScreen settings={settings} /> : null
}

function SellScreen({ settings }: { settings: Settings }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const [lines, setLines] = useStoredCart()
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState<Done>()
  const [flash, setFlash] = useState<Flash>()
  const [cutFor, setCutFor] = useState<{ product: Product; edit?: LengthLine }>()
  const [grid, setGrid] = useState<GridMode>()
  const [variantFor, setVariantFor] = useState<{ product: Product; assignCode?: string }>()
  const [unknown, setUnknown] = useState<string>()
  const [editKey, setEditKey] = useState<string>()
  const [heldOpen, setHeldOpen] = useState(false)
  const [receipt, setReceipt] = useState<string>()
  const [creditCn, setCreditCn] = useState(getPendingCredit)
  const [cashOut, setCashOut] = useState(false)
  const creditLeftKs = useLiveQuery(async () => (creditCn ? creditLeft(creditCn) : 0), [creditCn])
  const clearCredit = () => {
    setPendingCredit(undefined)
    setCreditCn(undefined)
  }
  // Credit fully used (or paid out): forget it.
  useEffect(() => {
    if (creditCn && creditLeftKs === 0) clearCredit()
  }, [creditCn, creditLeftKs])

  const photos = useLiveQuery(async () => {
    const ps = await db.products.bulkGet([...new Set(lines.map((l) => l.productId))])
    return new Map(ps.filter(Boolean).map((p) => [p!.id!, p!.photo]))
  }, [lines.map((l) => l.productId).join()])
  const held = useLiveQuery(() => db.parked.orderBy('at').toArray(), [])
  const { user, lock, approve } = useSession()
  // Whole-sale discount: managers/owners only; % is rounded like fabric prices.
  const [discount, setDiscount] = useState<{ pct?: number; amountKs?: number; by: number }>()
  const [discountOpen, setDiscountOpen] = useState(false)
  const subtotalKs = cartTotals(lines, settings.ct).subtotalKs
  const discountKs = !discount ? 0 : discount.pct ? roundFraction(subtotalKs * discount.pct, 100, settings.roundStep, 'nearest') : Math.min(discount.amountKs ?? 0, subtotalKs)
  const totals = cartTotals(lines, settings.ct, discountKs)
  useEffect(() => {
    if (!lines.length) setDiscount(undefined)
  }, [lines.length])

  function say(f: Flash) {
    setFlash(f)
    ;(f.ok ? beepOk : beepError)()
  }

  function addVariant(p: Product, v: Variant) {
    setLines((ls) => addPiece(ls, pieceItem(t, p, v)))
    say({ ok: true, text: `${p.nameMy} ${pieceItem(t, p, v).sub}` })
  }

  async function addProduct(p: Product, v?: Variant) {
    if (p.kind === 'length') {
      beepOk()
      return setCutFor({ product: p })
    }
    if (v) return addVariant(p, v)
    const vs = await db.variants.where('productId').equals(p.id!).toArray()
    if (vs.length === 1) addVariant(p, vs[0])
    else setVariantFor({ product: p })
  }

  async function onScan(code: string) {
    if (done) setDone(undefined) // next customer: a scan on the "done" screen starts a new sale
    const found = await findByBarcode(code)
    if (found?.product.active) return addProduct(found.product, found.variant)
    if (looksLikeMisread(code)) return say({ ok: false, text: t('sell.misread') })
    beepError()
    setUnknown(code)
  }
  useScanner(paying ? null : onScan)

  async function linkUnknown(p: Product, v?: Variant) {
    const code = grid?.kind === 'assign' ? grid.code : variantFor?.assignCode
    if (!code) return
    if (p.kind === 'piece' && !v) {
      const vs = await db.variants.where('productId').equals(p.id!).toArray()
      if (vs.length > 1) return setVariantFor({ product: p, assignCode: code })
      v = vs[0]
    }
    setGrid(undefined)
    setVariantFor(undefined)
    const approver = await approve('manager')
    if (!approver) return
    const r = await assignBarcode(code, p.id!, v?.id, approver.id)
    if (!r.ok) return say({ ok: false, text: t('barcode.taken', { code, name: r.productName ?? '?' }) })
    addProduct(p, v)
  }

  async function finish(payments: Parameters<typeof completeSale>[1], creditBackKs: number) {
    const r = await completeSale(lines, payments, {
      creditPayout: creditCn && creditBackKs > 0 ? { cnId: creditCn, method: 'cash', amountKs: creditBackKs } : undefined,
      discountKs,
      discountBy: discount?.by,
    })
    setDiscount(undefined)
    setPaying(false)
    setLines([])
    setFlash(undefined)
    setDone({ saleId: r.sale.id, practice: r.practice, totalKs: r.sale.totalKs, changeKs: payments.reduce((s, p) => s + (p.changeKs ?? 0), 0) + creditBackKs })
  }

  // Back to a fresh sell screen by itself after a sale.
  useEffect(() => {
    if (!done || receipt) return
    const id = setTimeout(() => setDone(undefined), 20_000)
    return () => clearTimeout(id)
  }, [done, receipt])

  const editing = lines.find((l) => l.key === editKey)

  if (done)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-green-50 p-6 text-center">
        <div className="text-5xl font-bold text-green-800">✓ {t(done.practice ? 'sell.donePractice' : 'sell.done')}</div>
        {!done.practice && <div className="text-2xl">{t('sell.saleNo', { id: done.saleId })}</div>}
        <div className="text-3xl">
          {t('pay.total')}: <b>{formatKs(done.totalKs)}</b> {t('common.ks')}
        </div>
        {done.changeKs > 0 && (
          <div className="rounded-3xl bg-white px-10 py-6 shadow">
            <div className="text-3xl">{t('pay.change')}</div>
            <div className="text-8xl font-bold text-green-800">{formatKs(done.changeKs)}</div>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-4">
          {settings.receiptEnabled && !done.practice && (
            <Btn variant="plain" className="min-h-20 px-8 text-2xl" onClick={() => setReceipt(done.saleId)}>
              🧾 {t('receipt.show')}
            </Btn>
          )}
          <Btn variant="ok" className="min-h-20 px-10 text-3xl" onClick={() => setDone(undefined)}>
            {t('sell.next')}
          </Btn>
        </div>
        {receipt && <ReceiptModal saleId={receipt} settings={settings} copy={false} onClose={() => setReceipt(undefined)} />}
      </div>
    )

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 bg-blue-900 px-4 py-2 text-white">
        <h1 className="flex-1 truncate text-2xl font-bold">{settings.shopName}</h1>
        {lines.length > 0 && (
          <Btn variant="plain" onClick={async () => (await parkSale(lines), setLines([]), setFlash({ ok: true, text: t('sell.heldOk') }))}>
            ⏸ {t('sell.hold')}
          </Btn>
        )}
        {(held?.length ?? 0) > 0 && (
          <Btn variant="plain" onClick={() => setHeldOpen(true)}>
            {t('sell.held', { count: held!.length })}
          </Btn>
        )}
        <SyncBadge />
        <span className="hidden text-lg md:inline">👤 {user?.name}</span>
        <Btn variant="plain" onClick={() => go('#/menu')}>
          ☰ {t('sell.menu')}
        </Btn>
        <Btn variant="plain" aria-label={t('lock.lock')} onClick={lock}>
          🔒
        </Btn>
      </header>
      {settings.practiceMode && <div className="bg-orange-500 py-2 text-center text-2xl font-bold text-white">{t('sell.practiceBanner')}</div>}
      {settings.deviceRole === 'viewer' && <div className="bg-sky-200 py-2 text-center text-xl">👁 {t('cloud.viewerBanner')}</div>}
      {creditCn && !!creditLeftKs && (
        <div className="flex items-center gap-3 bg-violet-100 px-4 py-2 text-xl text-violet-900" data-testid="credit-banner">
          <span className="flex-1">↩ {t('sell.creditBanner', { amount: formatKs(creditLeftKs), id: creditCn })}</span>
          <Btn variant="plain" onClick={() => setCashOut(true)}>
            {t('sell.creditCashOut')}
          </Btn>
        </div>
      )}
      {cashOut && creditCn && (
        <Modal onClose={() => setCashOut(false)}>
          <BlockScans />
          <p className="mb-4 text-3xl font-bold">{t('sell.creditCashOutConfirm', { amount: formatKs(creditLeftKs ?? 0) })}</p>
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setCashOut(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="ok"
              onClick={async () => {
                const approver = await approve('manager')
                if (!approver) return
                await payOutCredit(creditCn, 'cash', creditLeftKs ?? 0, approver.id)
                setCashOut(false)
                clearCredit()
              }}
            >
              {t('common.ok')}
            </Btn>
          </div>
        </Modal>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] lg:grid-cols-[1fr_26rem] lg:grid-rows-1">
        <section className="flex min-h-0 flex-col">
          <div
            className={`m-3 rounded-2xl p-3 text-center text-2xl font-bold ${flash ? (flash.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900') : 'bg-slate-100 text-slate-600'}`}
            data-testid="scan-area"
          >
            {flash?.text ?? `▮▯▮ ${t('sell.scanHere')}`}
          </div>
          <ul className="flex-1 divide-y-2 divide-slate-200 overflow-auto px-3" data-testid="cart">
            {lines.map((l) => (
              <li key={l.key}>
                <button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => setEditKey(l.key)}>
                  <Photo blob={photos?.get(l.productId)} className="h-16 w-16 shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2xl font-bold">{l.nameMy}</span>
                    {l.kind === 'piece' ? (
                      <span className="block text-xl text-slate-700">
                        {l.sub} {l.qty > 1 && <b>× {l.qty}</b>}
                      </span>
                    ) : (
                      <span className="block text-xl text-slate-700">
                        <b>{formatEntered(l.entered, settings.units, lang)}</b> <span className="text-base">({formatInches(l.lengthTenths)}")</span>
                        {(l.remnantPct || l.wholeRemnant) && <span className="ml-2 text-amber-700">✂ {l.remnantPct ? `−${l.remnantPct}%` : t('stock.remnant')}</span>}
                      </span>
                    )}
                  </span>
                  <span className="text-3xl font-bold">{formatKs(lineTotal(l))}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-3 border-t-2 border-slate-200 p-3 lg:border-l-2 lg:border-t-0">
          <div className="rounded-2xl bg-slate-900 p-4 text-right text-white">
            <div className="text-xl">{t('pay.total')}</div>
            <div className="text-6xl font-bold" data-testid="total">
              {formatKs(totals.totalKs)}
            </div>
            {discountKs > 0 && (
              <div className="text-lg" data-testid="discount">
                {t('receipt.discount')} −{formatKs(discountKs)}
                {discount?.pct ? ` (${discount.pct}%)` : ''}
              </div>
            )}
            {totals.ctKs > 0 && <div className="text-base">{t('receipt.ct')} {formatKs(totals.ctKs)}</div>}
          </div>
          <Btn variant="ok" className="min-h-24 text-4xl" disabled={!lines.length} onClick={() => setPaying(true)}>
            {t('sell.pay')}
          </Btn>
          <Btn variant="danger" className="min-h-18 text-2xl" disabled={!lines.length} onClick={() => setLines(removeLast(lines))}>
            {t('sell.removeLast')}
          </Btn>
          <Btn variant="plain" className="min-h-18 text-2xl" onClick={() => setGrid({ kind: 'sell' })}>
            📷 {t('sell.byPhoto')}
          </Btn>
          {atLeast(user, 'manager') && lines.length > 0 && (
            <Btn variant="plain" onClick={() => setDiscountOpen(true)}>
              % {t('discount.button')}
            </Btn>
          )}
        </aside>
      </div>

      {discountOpen && user && (
        <DiscountDialog
          subtotalKs={subtotalKs}
          onClose={() => setDiscountOpen(false)}
          onSet={(d) => {
            setDiscount(d && { ...d, by: user.id! })
            setDiscountOpen(false)
          }}
        />
      )}

      {paying && (
        <Payment
          totalKs={totals.totalKs}
          settings={settings}
          credit={creditCn && creditLeftKs ? { cnId: creditCn, leftKs: creditLeftKs } : undefined}
          onBack={() => setPaying(false)}
          onFinish={finish}
        />
      )}

      {grid && (
        <PhotoGrid
          settings={settings}
          title={grid.kind === 'sell' ? t('sell.byPhoto') : t('sell.pickToLink', { code: grid.code })}
          onClose={() => setGrid(undefined)}
          onPick={(p) => (grid.kind === 'assign' ? linkUnknown(p) : (setGrid(undefined), addProduct(p)))}
          onCode={grid.kind === 'sell' ? (code) => (setGrid(undefined), onScan(code)) : undefined}
        />
      )}

      {variantFor && (
        <VariantPick
          product={variantFor.product}
          onClose={() => setVariantFor(undefined)}
          onPick={(v) => (variantFor.assignCode ? linkUnknown(variantFor.product, v) : (setVariantFor(undefined), addVariant(variantFor.product, v)))}
        />
      )}

      {cutFor && (
        <LengthEntry
          product={cutFor.product}
          settings={settings}
          initial={cutFor.edit?.entered}
          initialRollId={cutFor.edit?.rollId}
          onCancel={() => setCutFor(undefined)}
          onOk={(entered, roll, whole) => {
            const line = lengthLine(t, cutFor.product, entered, settings, cutFor.edit?.key, roll, whole)
            setLines((ls) => (cutFor.edit ? ls.map((l) => (l.key === line.key ? line : l)) : [...ls, line]))
            say({ ok: true, text: `${cutFor.product.nameMy} ${formatEntered(entered, settings.units, lang)}` })
            setCutFor(undefined)
          }}
        />
      )}

      {unknown && (
        <Modal onClose={() => setUnknown(undefined)}>
          <BlockScans />
          <p className="mb-2 text-3xl font-bold text-red-800">{t('sell.notFound')}</p>
          <p className="mb-4 font-mono text-xl text-slate-600">{unknown}</p>
          <div className="grid gap-3">
            <Btn className="min-h-20 text-2xl" onClick={() => (setUnknown(undefined), setGrid({ kind: 'sell' }))}>
              📷 {t('sell.byPhoto')}
            </Btn>
            <Btn variant="plain" className="text-xl" onClick={() => (setUnknown(undefined), setGrid({ kind: 'assign', code: unknown }))}>
              🔗 {t('sell.linkCode')}
            </Btn>
            <Btn variant="plain" onClick={() => setUnknown(undefined)}>
              {t('sell.ignore')}
            </Btn>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditKey(undefined)}>
          <BlockScans />
          <h2 className="mb-1 text-3xl font-bold">{editing.nameMy}</h2>
          <p className="mb-4 text-xl text-slate-700">{editing.kind === 'piece' ? editing.sub : formatEntered(editing.entered, settings.units, lang)}</p>
          {editing.kind === 'piece' ? (
            <div className="mb-4 flex items-center justify-center gap-4">
              <Btn variant="plain" className="w-24 text-4xl" onClick={() => setLines(setQty(lines, editing.key, editing.qty - 1))}>
                −
              </Btn>
              <span className="w-20 text-center text-5xl font-bold">{editing.qty}</span>
              <Btn variant="plain" className="w-24 text-4xl" onClick={() => setLines(setQty(lines, editing.key, editing.qty + 1))}>
                +
              </Btn>
            </div>
          ) : (
            <Btn
              variant="plain"
              className="mb-4 w-full text-2xl"
              onClick={async () => {
                const p = await db.products.get(editing.productId)
                setEditKey(undefined)
                if (p) setCutFor({ product: p, edit: editing })
              }}
            >
              📏 {t('sell.changeLength')}
            </Btn>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="danger" onClick={() => (setLines(lines.filter((l) => l.key !== editing.key)), setEditKey(undefined))}>
              {t('sell.removeLine')}
            </Btn>
            <Btn variant="ok" onClick={() => setEditKey(undefined)}>
              {t('common.ok')}
            </Btn>
          </div>
        </Modal>
      )}

      {heldOpen && (
        <Modal onClose={() => setHeldOpen(false)}>
          <BlockScans />
          <h2 className="mb-4 text-3xl font-bold">{t('sell.heldTitle')}</h2>
          {lines.length > 0 && <p className="mb-3 rounded-xl bg-amber-100 p-3 text-xl">{t('sell.finishFirst')}</p>}
          <div className="grid gap-3">
            {held?.map((h) => {
              const cart = h.cart as CartLine[]
              return (
                <Btn
                  key={h.id}
                  variant="plain"
                  className="flex min-h-20 items-center justify-between text-xl"
                  disabled={lines.length > 0}
                  onClick={async () => {
                    setLines(await resumeParked(h.id!))
                    setHeldOpen(false)
                  }}
                >
                  <span>
                    {timeText(h.at)} · {t('sell.items', { count: cart.length })}
                  </span>
                  <span className="text-2xl">{formatKs(cartTotals(cart, settings.ct).totalKs)}</span>
                </Btn>
              )
            })}
          </div>
          <Btn variant="plain" className="mt-4 w-full" onClick={() => setHeldOpen(false)}>
            {t('common.close')}
          </Btn>
        </Modal>
      )}
    </div>
  )
}

function DiscountDialog({ subtotalKs, onSet, onClose }: { subtotalKs: number; onSet: (d?: { pct?: number; amountKs?: number }) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const n = toInt(amount)
  return (
    <Modal onClose={onClose}>
      <BlockScans />
      <h2 className="mb-4 text-2xl font-bold">% {t('discount.button')}</h2>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {[5, 10, 15, 20].map((p) => (
          <Btn key={p} variant="plain" className="text-2xl" onClick={() => onSet({ pct: p })}>
            {p}%
          </Btn>
        ))}
      </div>
      <label className="block text-xl">
        {t('discount.amount')}
        <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Btn variant="plain" onClick={() => onSet(undefined)}>
          {t('discount.none')}
        </Btn>
        <Btn variant="plain" onClick={onClose}>
          {t('common.cancel')}
        </Btn>
        <Btn variant="ok" disabled={!n || n > subtotalKs} onClick={() => onSet({ amountKs: n })}>
          {t('common.ok')}
        </Btn>
      </div>
    </Modal>
  )
}

/** Mounted inside a dialog that doesn't expect scans. */
function BlockScans() {
  useScanner(null)
  return null
}
