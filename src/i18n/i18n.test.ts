import { expect, it } from 'vitest'
import my from './my.json'
import en from './en.json'

it('Burmese and English have the same keys', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(my).sort())
})
