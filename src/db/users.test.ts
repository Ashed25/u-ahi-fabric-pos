import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPiece } from '../core/cart'
import { saveProduct } from './products'
import { createReturn, voidSale } from './returns'
import { completeSale } from './sales'
import { db } from './schema'
import { receiveRoll } from './stock'
import { checkOwnerPassword, createUser, findByPin, setCurrentUser, setupOwner, updateMe, updateUser } from './users'

beforeEach(async () => {
  setCurrentUser(undefined)
  await db.delete()
  await db.open()
})

async function team() {
  const owner = await setupOwner('ဦးအဟိ', '1234', 'secret99')
  setCurrentUser(owner)
  const managerId = await createUser('မန်နေဂျာ', 'manager', '5555')
  const sellerId = await createUser('အမေ', 'seller', '1111')
  return { owner, managerId, sellerId, seller: (await db.users.get(sellerId))! }
}

const shirt = { kind: 'piece' as const, nameMy: 'ရှပ်', nameEn: '', active: true, priceKs: 15000, updatedAt: 0 }

describe('users & PINs', () => {
  it('first start creates the owner; PINs are hashed, unique and 4 digits', async () => {
    const { owner } = await team()
    expect(owner.pinHash).not.toContain('1234')
    expect((await findByPin('1111'))?.name).toBe('အမေ')
    expect(await findByPin('9999')).toBeUndefined()
    await expect(createUser('x', 'seller', '1111')).rejects.toThrow(/already used/)
    await expect(createUser('x', 'seller', '12a4')).rejects.toThrow(/4 digits/)
    await expect(setupOwner('again', '4321', 'secret99')).rejects.toThrow(/Already/)
    expect(await checkOwnerPassword('secret99')).toBe(true)
    expect(await checkOwnerPassword('wrong')).toBe(false)
  })

  it('only the owner manages users; the last owner stays', async () => {
    const { owner, seller } = await team()
    setCurrentUser(seller)
    await expect(createUser('x', 'seller', '2222')).rejects.toThrow(/Not allowed/)
    setCurrentUser(owner)
    await expect(updateUser(owner.id!, { role: 'manager' })).rejects.toThrow(/owner/)
    await updateUser(seller.id!, { active: false })
    expect(await findByPin('1111')).toBeUndefined() // deactivated users can't log in
  })

  it('anyone changes their own name and PIN after confirming the current PIN', async () => {
    const { seller } = await team()
    setCurrentUser(seller)
    await expect(updateMe('9999', { pin: '2222' })).rejects.toThrow(/Wrong current PIN/)
    await expect(updateMe('1111', { pin: '1234' })).rejects.toThrow(/already used/) // the owner's PIN
    const me = await updateMe('1111', { name: ' မေမေ ', pin: '2222' })
    expect(me.name).toBe('မေမေ')
    expect((await findByPin('2222'))?.id).toBe(seller.id)
    expect(await findByPin('1111')).toBeUndefined()
    expect((await db.users.get(seller.id!))!.role).toBe('seller')
  })
})

describe('what a seller may do', () => {
  it('sells (recorded under their name) but cannot change products, stock or discount', async () => {
    const { seller, managerId } = await team()
    const pid = await saveProduct(shirt, [{ productId: 0, qty: 3 }]) // owner
    const [v] = await db.variants.toArray()
    setCurrentUser(seller)
    await expect(saveProduct({ ...(await db.products.get(pid))!, priceKs: 1 }, [v])).rejects.toThrow(/Not allowed/)
    await expect(receiveRoll(pid, 360)).rejects.toThrow(/Not allowed/)

    const lines = addPiece([], { productId: pid, variantId: v.id!, nameMy: 'ရှပ်', sub: '', unitPriceKs: 15000 })
    await expect(completeSale(lines, [{ method: 'cash', amountKs: 14000 }], { discountKs: 1000 })).rejects.toThrow(/Not allowed/)
    const { sale } = await completeSale(lines, [{ method: 'cash', amountKs: 14000 }], { discountKs: 1000, discountBy: managerId })
    expect(sale).toMatchObject({ userId: seller.id, discountKs: 1000, totalKs: 14000 })
    expect((await db.stockMoves.where('reason').equals('sale').first())!.userId).toBe(seller.id)
  })

  it('returns and voids need a manager PIN (recorded as approver)', async () => {
    const { seller, managerId } = await team()
    const pid = await saveProduct(shirt, [{ productId: 0, qty: 3 }])
    const [v] = await db.variants.toArray()
    setCurrentUser(seller)
    const lines = addPiece([], { productId: pid, variantId: v.id!, nameMy: 'ရှပ်', sub: '', unitPriceKs: 15000 })
    const a = await completeSale(lines, [{ method: 'cash', amountKs: 15000 }])
    const [line] = await db.saleLines.toArray()
    const ret = { saleId: a.sale.id, items: [{ saleLineId: line.id!, qty: 1 }], type: 'refund' as const, reason: 'r', refundMethod: 'cash' }
    await expect(createReturn(ret)).rejects.toThrow(/Not allowed/)
    await expect(createReturn({ ...ret, approvedBy: seller.id })).rejects.toThrow(/Not allowed/)
    const cn = await createReturn({ ...ret, approvedBy: managerId })
    expect(cn).toMatchObject({ userId: seller.id, approvedBy: managerId })

    const b = await completeSale(lines, [{ method: 'cash', amountKs: 15000 }])
    await expect(voidSale(b.sale.id, 'x')).rejects.toThrow(/Not allowed/)
    await voidSale(b.sale.id, 'mistake', managerId)
    expect((await db.sales.get(b.sale.id))!.voidBy).toBe(managerId)
    expect((await db.audit.where('action').equals('sale.void').first())!.userId).toBe(seller.id)
  })
})
