import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { type EnteredLength, formatEntered, formatInches } from '../core/length'
import { DEFAULT_QUICK_CUTS, removeBarcode, saveProduct } from '../db/products'
import { type Barcode, type Product, type Variant, db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { BarcodeSvg } from '../ui/BarcodeSvg'
import { LengthBuilder } from '../ui/LengthBuilder'
import { ScanAssign } from '../ui/ScanAssign'
import { Btn, Field, Modal, Screen, inputCls, toInt } from '../ui/kit'
import { Photo, resizePhoto } from '../ui/photo'
import { go } from '../ui/router'

const WIDTH_PRESETS = [360, 450, 584] // 36", 45", 58.4"
const YARD = 360

const blank = (kind: Product['kind']): Product => ({
  kind,
  nameMy: '',
  nameEn: '',
  active: true,
  updatedAt: 0,
  ...(kind === 'length' ? { pricingUnit: 'gaik', quickCuts: DEFAULT_QUICK_CUTS, widthTenths: 450 } : {}),
})

const numStr = (n?: number) => (n == null ? '' : String(n))

export function ProductEdit({ id }: { id?: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const barcodes = useLiveQuery(() => (id ? db.barcodes.where('productId').equals(id).toArray() : []), [id])

  const [p, setP] = useState<Product>()
  const [variants, setVariants] = useState<Variant[]>([])
  // Prices typed as text so "" and "12,500" work; parsed on save.
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [low, setLow] = useState('')
  const [vPrices, setVPrices] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState<string>()
  const [cutDraft, setCutDraft] = useState<EnteredLength>()
  const [assignFor, setAssignFor] = useState<{ variantId?: number }>()
  const fileRef = useRef<HTMLInputElement>(null)

  // Load once per id (not live), so background changes never wipe what the owner is typing.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const prod = id ? await db.products.get(id) : blank('piece')
      const vs = id ? await db.variants.where('productId').equals(id).toArray() : [{ productId: 0, qty: 0 }]
      if (cancelled || !prod) return
      setP(prod)
      setVariants(vs)
      setPrice(numStr(prod.kind === 'piece' ? prod.priceKs : prod.unitPriceKs))
      setCost(numStr(prod.costKs))
      setLow(numStr(prod.lowStock == null ? undefined : prod.kind === 'length' ? prod.lowStock / YARD : prod.lowStock))
      setVPrices(vs.map((v) => numStr(v.priceKs)))
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (!p || !settings || !categories) return null
  const set = (patch: Partial<Product>) => setP({ ...p, ...patch })
  const isNew = !id

  async function save() {
    if (!p) return
    const priceKs = toInt(price)
    if (!p.nameMy.trim()) return setError(t('product.errName'))
    if (!priceKs) return setError(t('product.errPrice'))
    if (cost && toInt(cost) === undefined) return setError(t('product.errCost'))
    if (low && toInt(low) === undefined) return setError(t('product.errLow'))
    const vp = vPrices.map((s) => (s ? toInt(s) : undefined))
    if (vPrices.some((s, i) => s && vp[i] === undefined)) return setError(t('product.errPrice'))
    const lowN = toInt(low)
    const out: Product = {
      ...p,
      nameMy: p.nameMy.trim(),
      nameEn: p.nameEn.trim(),
      costKs: toInt(cost),
      lowStock: lowN == null ? undefined : p.kind === 'length' ? lowN * YARD : lowN,
      ...(p.kind === 'piece' ? { priceKs } : { unitPriceKs: priceKs }),
    }
    setSaving(true)
    try {
      const vs = variants.map((v, i) => ({ ...v, size: v.size?.trim() || undefined, colour: v.colour?.trim() || undefined, priceKs: vp[i] }))
      const newId = await saveProduct(out, vs)
      if (isNew) go(`#/products/${newId}`)
      else go('#/products')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function addCategory() {
    const name = newCat?.trim()
    if (!name) return setNewCat(undefined)
    const cid = (await db.categories.add({ nameMy: name, nameEn: '', sort: categories!.length })) as number
    set({ categoryId: cid })
    setNewCat(undefined)
  }

  async function onPhoto(file?: File) {
    if (file) set({ photo: await resizePhoto(file) })
  }

  const barcodeList = (variantId?: number) => (
    <BarcodeList
      codes={(barcodes ?? []).filter((b) => (variantId == null ? b.variantId == null : b.variantId === variantId))}
      onAssign={() => setAssignFor({ variantId })}
    />
  )

  return (
    <Screen title={isNew ? t('product.new') : p.nameMy} back="#/products">
      <div className="mx-auto max-w-3xl space-y-5">
        {isNew && (
          <div className="grid grid-cols-2 gap-3">
            {(['piece', 'length'] as const).map((k) => (
              <Btn
                key={k}
                variant={p.kind === k ? 'primary' : 'plain'}
                className="py-4"
                onClick={() => {
                  setP({ ...blank(k), nameMy: p.nameMy, nameEn: p.nameEn, categoryId: p.categoryId, photo: p.photo })
                  setVariants(k === 'piece' ? [{ productId: 0, qty: 0 }] : [])
                  setVPrices(k === 'piece' ? [''] : [])
                }}
              >
                {t(k === 'piece' ? 'product.soldByPiece' : 'product.soldByLength')}
              </Btn>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4">
          <Photo blob={p.photo} className="h-32 w-32 rounded-2xl" />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          <Btn variant="plain" onClick={() => fileRef.current?.click()}>
            📷 {t('product.takePhoto')}
          </Btn>
          {p.photo && (
            <Btn variant="plain" onClick={() => set({ photo: undefined })}>
              {t('common.remove')}
            </Btn>
          )}
        </div>

        <Field label={t('product.nameMy')}>
          <input className={inputCls} value={p.nameMy} onChange={(e) => set({ nameMy: e.target.value })} />
        </Field>
        <Field label={t('product.nameEn')}>
          <input className={inputCls} value={p.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
        </Field>

        <Field label={t('product.category')}>
          {newCat === undefined ? (
            <div className="flex gap-2">
              <select
                className={inputCls}
                value={p.categoryId ?? ''}
                onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameMy}
                  </option>
                ))}
              </select>
              <Btn variant="plain" className="whitespace-nowrap" onClick={() => setNewCat('')}>
                + {t('common.new')}
              </Btn>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus className={inputCls} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <Btn onClick={addCategory}>{t('common.ok')}</Btn>
            </div>
          )}
        </Field>

        {p.kind === 'length' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('product.pricingUnit')}>
                <select className={inputCls} value={p.pricingUnit} onChange={(e) => set({ pricingUnit: e.target.value })}>
                  {settings.units
                    .filter((u) => u.pricing)
                    .map((u) => (
                      <option key={u.code} value={u.code}>
                        {lang === 'en' ? u.nameEn : u.nameMy}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t('product.pricePerUnit')}>
                <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
            </div>
            <Field label={t('product.width')}>
              <div className="flex flex-wrap gap-2">
                {WIDTH_PRESETS.map((w) => (
                  <Btn key={w} variant={p.widthTenths === w ? 'primary' : 'plain'} onClick={() => set({ widthTenths: w })}>
                    {formatInches(w)}"
                  </Btn>
                ))}
                <input
                  className={`${inputCls} max-w-40`}
                  inputMode="decimal"
                  placeholder={t('product.customWidth')}
                  defaultValue={p.widthTenths && !WIDTH_PRESETS.includes(p.widthTenths) ? formatInches(p.widthTenths) : ''}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    if (/^\d+(\.\d)?$/.test(v)) set({ widthTenths: Math.round(Number(v) * 10) })
                  }}
                />
              </div>
            </Field>
            <Field label={t('product.quickCuts')}>
              <div className="flex flex-wrap gap-2">
                {(p.quickCuts ?? []).map((c, i) => (
                  <span key={i} className="flex items-center gap-2 rounded-xl bg-slate-100 py-1 pl-4 pr-1 text-xl">
                    {formatEntered(c, settings.units, lang)}
                    <button
                      aria-label={t('common.remove')}
                      className="min-h-12 w-12 rounded-lg text-red-700"
                      onClick={() => set({ quickCuts: p.quickCuts!.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <Btn variant="plain" onClick={() => setCutDraft([])}>
                  + {t('common.add')}
                </Btn>
              </div>
            </Field>
            <Field label={t('product.lowStockYards')}>
              <input className={inputCls} inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value)} />
            </Field>
            {!isNew && <Section title={t('barcode.title')}>{barcodeList()}</Section>}
          </>
        )}

        {p.kind === 'piece' && (
          <>
            <Field label={t('product.price')}>
              <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Section title={t('product.variants')}>
              {variants.map((v, i) => (
                <div key={v.id ?? `new${i}`} className="mb-4 rounded-2xl border-2 border-slate-200 p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Field label={t('product.size')}>
                      <input className={inputCls} value={v.size ?? ''} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} />
                    </Field>
                    <Field label={t('product.colour')}>
                      <input className={inputCls} value={v.colour ?? ''} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, colour: e.target.value } : x)))} />
                    </Field>
                    <Field label={t('product.variantPrice')}>
                      <input
                        className={inputCls}
                        inputMode="numeric"
                        placeholder={price}
                        value={vPrices[i] ?? ''}
                        onChange={(e) => setVPrices(vPrices.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    </Field>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-600">{t('product.inStock', { count: v.qty })}</span>
                    {variants.length > 1 && (
                      <Btn
                        variant="plain"
                        onClick={() => {
                          setVariants(variants.filter((_, j) => j !== i))
                          setVPrices(vPrices.filter((_, j) => j !== i))
                        }}
                      >
                        {t('common.remove')}
                      </Btn>
                    )}
                  </div>
                  {v.id != null && barcodeList(v.id)}
                </div>
              ))}
              <Btn
                variant="plain"
                onClick={() => {
                  setVariants([...variants, { productId: p.id ?? 0, qty: 0 }])
                  setVPrices([...vPrices, ''])
                }}
              >
                + {t('product.addVariant')}
              </Btn>
            </Section>
            <Field label={t('product.lowStockPieces')}>
              <input className={inputCls} inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value)} />
            </Field>
          </>
        )}

        <Field label={t('product.cost')} hint={t('product.costHint')}>
          <input className={inputCls} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>

        <label className="flex items-center gap-3 text-xl">
          <input type="checkbox" className="h-8 w-8" checked={p.active} onChange={(e) => set({ active: e.target.checked })} />
          {t('product.active')}
        </label>

        {isNew && <p className="text-slate-600">{t('product.barcodeAfterSave')}</p>}
        {error && <p className="rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
        <Btn variant="ok" className="w-full py-4 text-2xl" disabled={saving} onClick={save}>
          {t('common.save')}
        </Btn>
      </div>

      {cutDraft && (
        <Modal onClose={() => setCutDraft(undefined)}>
          <LengthBuilder value={cutDraft} onChange={setCutDraft} units={settings.units} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setCutDraft(undefined)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="ok"
              disabled={!cutDraft.length}
              onClick={() => {
                set({ quickCuts: [...(p.quickCuts ?? []), cutDraft] })
                setCutDraft(undefined)
              }}
            >
              {t('common.ok')}
            </Btn>
          </div>
        </Modal>
      )}
      {assignFor && p.id != null && <ScanAssign productId={p.id} variantId={assignFor.variantId} onClose={() => setAssignFor(undefined)} />}
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function BarcodeList({ codes, onAssign }: { codes: Barcode[]; onAssign: () => void }) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState<string>()
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {codes.map((b) => (
        <div key={b.code} className="flex items-center gap-2 rounded-xl border-2 border-slate-200 p-2">
          <BarcodeSvg value={b.code} className="h-14 w-40" />
          <span className="text-base text-slate-600">{t(b.source === 'generated' ? 'barcode.generated' : 'barcode.assignedShort')}</span>
          <button aria-label={t('common.remove')} className="min-h-12 w-12 rounded-lg text-red-700" onClick={() => setConfirm(b.code)}>
            ✕
          </button>
        </div>
      ))}
      <Btn variant="plain" onClick={onAssign}>
        {t('barcode.scanToAssign')}
      </Btn>
      {confirm && (
        <Modal onClose={() => setConfirm(undefined)}>
          <p className="mb-4 text-xl">{t('barcode.confirmRemove', { code: confirm })}</p>
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setConfirm(undefined)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="danger"
              onClick={async () => {
                await removeBarcode(confirm)
                setConfirm(undefined)
              }}
            >
              {t('common.remove')}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
