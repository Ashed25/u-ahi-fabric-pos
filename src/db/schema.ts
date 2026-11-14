import Dexie, { type EntityTable } from 'dexie'
import type { EnteredLength } from '../core/length'

// All money is integer Ks; all lengths are integer tenths of an inch.

export type Role = 'owner' | 'manager' | 'seller'

export interface Setting {
  key: string
  value: unknown
}

export interface User {
  id?: number
  name: string
  role: Role
  pinHash: string
  salt: string
  active: boolean
}

export interface Category {
  id?: number
  nameMy: string
  nameEn: string
  sort: number
  demo?: boolean
}

export interface Product {
  id?: number
  kind: 'piece' | 'length'
  nameMy: string
  nameEn: string
  categoryId?: number
  photo?: Blob
  costKs?: number
  active: boolean
  lowStock?: number // pieces, or tenths for fabric
  priceKs?: number // piece
  pricingUnit?: string // length: unit code
  unitPriceKs?: number // length
  widthTenths?: number // length: display only
  quickCuts?: EnteredLength[] // length
  tagged?: boolean // tagging day: label is on the item
  demo?: boolean // demo data, removable in one tap
  updatedAt: number
}

export interface Variant {
  id?: number
  productId: number
  size?: string
  colour?: string
  priceKs?: number // overrides product price
  qty: number
}

export interface Barcode {
  code: string // primary key -> unique across all products
  productId: number
  variantId?: number
  source: 'generated' | 'assigned'
  createdAt: number
}

export interface Roll {
  id?: number
  productId: number
  startTenths: number
  remainingTenths: number
  status: 'active' | 'remnant' | 'finished'
  remnantPriceKs?: number
  remnantPct?: number
  receivedAt: number
}

export type MoveReason = 'sale' | 'return' | 'receive' | 'adjust' | 'count' | 'waste'

export interface StockMove {
  id?: number
  at: number
  userId: number
  reason: MoveReason
  note?: string
  refId?: string
  productId: number
  variantId?: number
  rollId?: number
  deltaQty?: number
  deltaTenths?: number
}

export interface Sale {
  id: string // e.g. "A-000123": device prefix + gap-free sequence
  deviceId: string
  seq: number
  at: number
  userId: number
  status: 'completed' | 'void'
  voidReason?: string
  voidBy?: number
  subtotalKs: number
  discountKs: number
  ctKs: number
  totalKs: number
}

export interface SaleLine {
  id?: number
  saleId: string
  productId: number
  variantId?: number
  rollId?: number
  kind: 'piece' | 'length'
  qty?: number
  entered?: EnteredLength // exactly as the seller built it
  lengthTenths?: number
  // snapshots at time of sale
  nameMy: string
  sub?: string // size · colour, or width
  unitPriceKs: number
  pricingUnit?: string
  unitTenths?: number
  ctRateBp: number
  lineTotalKs: number
}

export interface Payment {
  id?: number
  saleId: string
  method: string
  amountKs: number
  ref?: string
  tenderedKs?: number
  changeKs?: number
}

export interface Parked {
  id?: number
  at: number
  userId: number
  cart: unknown
}

export interface CreditNote {
  id: string
  saleId: string
  at: number
  userId: number
  approvedBy: number
  reason: string
  type: 'refund' | 'exchange'
  totalKs: number
}

export interface CreditLine {
  id?: number
  creditId: string
  saleLineId: number
  qty?: number
  lengthTenths?: number
  toRoll: boolean // fabric: back to roll, or written off
  amountKs: number
}

export interface AuditEntry {
  id?: number
  at: number
  userId?: number
  action: string
  entity: string
  before?: unknown
  after?: unknown
}

export interface OutboxItem {
  id?: number
  table: string
  key: string
  at: number
}

export class PosDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>
  users!: EntityTable<User, 'id'>
  categories!: EntityTable<Category, 'id'>
  products!: EntityTable<Product, 'id'>
  variants!: EntityTable<Variant, 'id'>
  barcodes!: EntityTable<Barcode, 'code'>
  rolls!: EntityTable<Roll, 'id'>
  stockMoves!: EntityTable<StockMove, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleLines!: EntityTable<SaleLine, 'id'>
  payments!: EntityTable<Payment, 'id'>
  parked!: EntityTable<Parked, 'id'>
  creditNotes!: EntityTable<CreditNote, 'id'>
  creditLines!: EntityTable<CreditLine, 'id'>
  audit!: EntityTable<AuditEntry, 'id'>
  outbox!: EntityTable<OutboxItem, 'id'>

  constructor(name = 'u-ahi-pos') {
    super(name)
    this.version(1).stores({
      settings: 'key',
      users: '++id, role',
      categories: '++id, sort',
      products: '++id, kind, categoryId, active',
      variants: '++id, productId',
      barcodes: 'code, productId, variantId',
      rolls: '++id, productId, status',
      stockMoves: '++id, at, productId, rollId, variantId, reason',
      sales: 'id, at, seq, userId, status',
      saleLines: '++id, saleId, productId',
      payments: '++id, saleId, method',
      parked: '++id, at',
      creditNotes: 'id, saleId, at',
      creditLines: '++id, creditId, saleLineId',
      audit: '++id, at, action, entity',
      outbox: '++id, at',
    })
  }
}

export const db = new PosDB()
