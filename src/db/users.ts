import { audit } from './audit'
import { type Role, type User, db } from './schema'

export const RANK: Record<Role, number> = { seller: 1, manager: 2, owner: 3 }
export const atLeast = (u: User | undefined, min: Role) => !!u && u.active && RANK[u.role] >= RANK[min]

// Who is using the app right now (set by the lock screen). Used for userId on records and the audit log.
let current: User | undefined
export const setCurrentUser = (u?: User) => {
  current = u
}
export const currentUser = () => current
export const currentUserId = () => current?.id ?? 0

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer)

/** PBKDF2-SHA256. A 4-digit PIN is still guessable offline; the hash keeps PINs from being read off a backup. */
async function hash(secret: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return hex(bits)
}

export const anyUsers = async () => (await db.users.count()) > 0

/**
 * Data-layer permission check. `approverId` = a manager/owner who entered their PIN to approve.
 * Before the first user is set up there is nobody to check against, so everything is allowed.
 */
export async function requireRole(min: Role, approverId?: number) {
  if (!(await anyUsers())) return
  const u = approverId != null ? await db.users.get(approverId) : current
  if (!atLeast(u, min)) throw new Error(`Not allowed: needs ${min}`)
}

export async function findByPin(pin: string): Promise<User | undefined> {
  for (const u of await db.users.filter((x) => x.active).toArray()) if ((await hash(pin, u.salt)) === u.pinHash) return u
}

async function checkNewPin(pin: string, exceptId?: number) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits')
  const same = await findByPin(pin)
  if (same && same.id !== exceptId) throw new Error('PIN already used by someone else')
}

/** First start only: create the owner. */
export async function setupOwner(name: string, pin: string, password: string): Promise<User> {
  if (await anyUsers()) throw new Error('Already set up')
  if (!name.trim()) throw new Error('Name required')
  if (password.length < 6) throw new Error('Password must be at least 6 characters')
  await checkNewPin(pin)
  const salt = newSalt()
  const pwSalt = newSalt()
  const u: User = { name: name.trim(), role: 'owner', pinHash: await hash(pin, salt), salt, active: true, pwHash: await hash(password, pwSalt), pwSalt }
  u.id = (await db.users.add(u)) as number
  await audit('user.setup', `user:${u.id}`, undefined, { name: u.name, role: u.role }, u.id)
  return u
}

export async function createUser(name: string, role: Role, pin: string): Promise<number> {
  await requireRole('owner')
  if (!name.trim()) throw new Error('Name required')
  await checkNewPin(pin)
  const salt = newSalt()
  const id = (await db.users.add({ name: name.trim(), role, pinHash: await hash(pin, salt), salt, active: true })) as number
  await audit('user.create', `user:${id}`, undefined, { name, role })
  return id
}

/** Change name / role / active / PIN. The last active owner can't be removed or demoted. */
export async function updateUser(id: number, patch: { name?: string; role?: Role; active?: boolean; pin?: string }) {
  await requireRole('owner')
  const u = await db.users.get(id)
  if (!u) throw new Error('User not found')
  const losingOwner = u.role === 'owner' && ((patch.role && patch.role !== 'owner') || patch.active === false)
  if (losingOwner && (await db.users.filter((x) => x.active && x.role === 'owner').count()) <= 1) throw new Error('Keep at least one owner')
  const next: Partial<User> = { name: patch.name?.trim() || u.name, role: patch.role ?? u.role, active: patch.active ?? u.active }
  if (patch.pin) {
    await checkNewPin(patch.pin, id)
    next.salt = newSalt()
    next.pinHash = await hash(patch.pin, next.salt)
  }
  await db.users.update(id, next)
  await audit('user.update', `user:${id}`, { name: u.name, role: u.role, active: u.active }, { name: next.name, role: next.role, active: next.active, pinChanged: !!patch.pin })
}

export async function checkOwnerPassword(password: string): Promise<boolean> {
  for (const u of await db.users.filter((x) => x.active && x.role === 'owner' && !!x.pwHash).toArray()) if ((await hash(password, u.pwSalt!)) === u.pwHash) return true
  return false
}

export async function setOwnerPassword(id: number, password: string) {
  await requireRole('owner')
  if (password.length < 6) throw new Error('Password must be at least 6 characters')
  const pwSalt = newSalt()
  await db.users.update(id, { pwHash: await hash(password, pwSalt), pwSalt })
  await audit('user.password', `user:${id}`)
}
