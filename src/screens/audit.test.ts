import { expect, it } from 'vitest'
import { changeLines } from './AuditLog'

const label = (k: string) => ({ priceKs: 'Price', active: 'On sale', nameMy: 'Name' })[k]
const value = (k: string, v: unknown) => (v === undefined ? undefined : k === 'priceKs' ? `${v} Ks` : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v))

it('lists only changed fields a person cares about, in words', () => {
  const before = { id: 1, nameMy: 'က', priceKs: 15000, active: true, updatedAt: 1 }
  const after = { id: 1, nameMy: 'က', priceKs: 16000, active: false, updatedAt: 2 }
  expect(changeLines(before, after, label, value)).toEqual(['Price: 15000 Ks → 16000 Ks', 'On sale: Yes → No'])
  expect(changeLines(undefined, { nameMy: 'ခ', id: 3 }, label, value)).toEqual(['Name: ခ'])
  expect(changeLines({ priceKs: 1, active: true }, { active: false }, label, value)).toEqual(['On sale: Yes → No'])
  expect(changeLines({ priceKs: 5 }, undefined, label, value)).toEqual(['Price: 5 Ks'])
})
