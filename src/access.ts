import type { Role } from './db/schema'

/** Who may open each screen. Sellers (the parents) only sell; managers run stock, prices, returns; the owner everything. */
export const NEED: Record<string, Role> = {
  '': 'seller', menu: 'seller', today: 'seller', sales: 'seller', return: 'seller', scanner: 'seller',
  stock: 'manager', count: 'manager', products: 'manager', labels: 'manager', tagging: 'manager', reports: 'manager', ct: 'manager',
  cloud: 'owner', import: 'owner', units: 'owner', backup: 'owner', settings: 'owner', users: 'owner', audit: 'owner',
}
