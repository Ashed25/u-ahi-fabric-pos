import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Node has no localStorage: a tiny in-memory one for the change queue.
const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
}

import { addPiece } from '../core/cart'
import { removeBarcode, saveProduct } from '../db/products'
import { completeSale } from '../db/sales'
import { db } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
import { becomePrimary, type CloudApi, pull, push, queueEverything, restoreFromCloud } from './engine'
import { installSyncHooks, queueSize, setDeviceRole } from './queue'
import type { CloudRow } from './rows'

/** In-memory "Supabase": rows go through JSON like over the network; seq increases on every write. */
function fakeCloud() {
  let seq = 0
  const rows = new Map<string, CloudRow & { seq: number }>()
  const api: CloudApi = {
    async upsert(list) {
      for (const r of JSON.parse(JSON.stringify(list)) as CloudRow[]) rows.set(`${r.tbl}|${r.id}`, { ...r, seq: ++seq })
    },
    async pull(after, limit) {
      return [...rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit)
    },
    async getMeta(id) {
      return rows.get(`_meta|${id}`)?.data as Record<string, unknown> | undefined
    },
    async setMeta(id, data) {
      rows.set(`_meta|${id}`, { tbl: '_meta', id, data, deleted: false, seq: ++seq })
    },
  }
  return { rows, api }
}

beforeAll(() => installSyncHooks())
beforeEach(async () => {
  mem.clear()
  setDeviceRole('')
  await db.delete()
  await db.open()
})

const photo = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' })

async function shopTabletWithASale() {
  const pid = await saveProduct({ kind: 'piece', nameMy: 'ရှပ်', nameEn: '', active: true, priceKs: 15000, photo, updatedAt: 0 }, [{ productId: 0, size: 'M', qty: 5 }])
  const [v] = await db.variants.toArray()
  await setSetting('shopName', 'ဦးအဟိ အထည်ဆိုင်')
  await completeSale(addPiece([], { productId: pid, variantId: v.id!, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 }), [{ method: 'cash', amountKs: 15000 }])
  return pid
}

/** Simulate switching to the other device: wipe the local database (the cloud stays). */
async function otherDevice() {
  mem.clear()
  await db.delete()
  await db.open()
}

describe('cloud sync', () => {
  it('every committed change is queued and pushed; device-only settings stay local', async () => {
    const cloud = fakeCloud()
    await shopTabletWithASale()
    expect(queueSize()).toBeGreaterThan(5)
    await push(cloud.api)
    expect(queueSize()).toBe(0)
    expect(cloud.rows.get('sales|A-000001')?.data).toMatchObject({ totalKs: 15000 })
    expect(cloud.rows.has('settings|shopName')).toBe(true)
    expect(cloud.rows.has('settings|saleSeq')).toBe(false) // per-device counter
    expect(cloud.rows.has('settings|barcodeSeq')).toBe(false)
    expect((cloud.rows.get('products|1')?.data as { photo: unknown }).photo).toMatchObject({ __blob: 'image/jpeg' })
  })

  it('a laptop restores an exact copy (photos included) and cannot change anything', async () => {
    const cloud = fakeCloud()
    await shopTabletWithASale()
    await push(cloud.api)

    await otherDevice()
    await setSetting('saleSeq', 99) // the laptop's own counter must survive
    setDeviceRole('viewer')
    await restoreFromCloud(cloud.api)
    const p = (await db.products.get(1))!
    expect(new Uint8Array(await p.photo!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250]))
    expect((await db.sales.get('A-000001'))?.totalKs).toBe(15000)
    expect(await getSetting('shopName')).toBe('ဦးအဟိ အထည်ဆိုင်')
    expect(await getSetting('saleSeq')).toBe(99)
    await expect(saveProduct({ ...p, priceKs: 1 }, await db.variants.toArray())).rejects.toThrow(/only views/)
    await setSetting('lang', 'en') // local preferences are fine
  })

  it('later changes and deletions reach the viewer with pull', async () => {
    const cloud = fakeCloud()
    await shopTabletWithASale()
    await push(cloud.api)
    const code = (await db.barcodes.toArray())[0].code

    // the viewer side, recreated from the cloud
    await otherDevice()
    setDeviceRole('viewer')
    await restoreFromCloud(cloud.api)
    const pulledUpTo = await getSetting('lastPullSeq')

    // the tablet deletes a barcode: its tombstone arrives in the cloud
    await cloud.api.upsert([{ tbl: 'barcodes', id: code, data: null, deleted: true }])
    expect(await pull(cloud.api)).toBe(1)
    expect(await db.barcodes.get(code)).toBeUndefined()
    expect(await getSetting('lastPullSeq')).toBeGreaterThan(pulledUpTo)
  })

  it('deleting on the tablet sends a tombstone', async () => {
    const cloud = fakeCloud()
    await shopTabletWithASale()
    await push(cloud.api)
    const [b] = await db.barcodes.toArray()
    await removeBarcode(b.code)
    await push(cloud.api)
    expect(cloud.rows.get(`barcodes|${b.code}`)).toMatchObject({ deleted: true, data: null })
  })

  it('a replacement tablet continues the numbers without gaps', async () => {
    const cloud = fakeCloud()
    await shopTabletWithASale()
    await queueEverything()
    await push(cloud.api)

    await otherDevice() // new tablet
    await restoreFromCloud(cloud.api)
    await becomePrimary(cloud.api, { continueFrom: 'A' })
    expect(await getSetting('saleSeq')).toBe(1)
    expect(await getSetting('barcodeSeq')).toBe(1)
    expect((await cloud.api.getMeta('primary'))?.device).toBe(await getSetting('deviceUuid'))
    const [v] = await db.variants.toArray()
    const { sale } = await completeSale(addPiece([], { productId: 1, variantId: v.id!, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 }), [{ method: 'cash', amountKs: 15000 }])
    expect(sale.id).toBe('A-000002')
  })
})

