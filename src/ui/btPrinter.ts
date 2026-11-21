import { escPosRaster } from '../core/escpos'
import type { Printer } from '../db/settings'
import { receiptCanvas, type Row } from './receipt'

// Minimal Web Bluetooth / Web Serial shapes (not in TypeScript's DOM lib).
type Chr = {
  properties: { write: boolean; writeWithoutResponse: boolean }
  writeValueWithResponse(b: BufferSource): Promise<void>
  writeValueWithoutResponse(b: BufferSource): Promise<void>
}
type Gatt = { connected: boolean; connect(): Promise<Gatt>; getPrimaryServices(): Promise<{ getCharacteristics(): Promise<Chr[]> }[]> }
type BtDevice = { id: string; name?: string; gatt?: Gatt }
type Port = { writable: WritableStream<Uint8Array> | null; open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; getInfo(): { bluetoothServiceClassId?: unknown } }
const nav = navigator as Navigator & {
  bluetooth?: { requestDevice(o: object): Promise<BtDevice>; getDevices?(): Promise<BtDevice[]> }
  serial?: { requestPort(o: object): Promise<Port>; getPorts(): Promise<Port[]> }
}

export const canBle = () => !!nav.bluetooth
export const canSerial = () => !!nav.serial

const DOTS = 384 // 58 mm head at 203 dpi
// calibration: bytes per BLE write. Garbled or cut-off print → lower to 20. Slow print → try 180, then 512.
const BLE_CHUNK = 100
const SPP = '00001101-0000-1000-8000-00805f9b34fb'
// Print services used by common cheap BLE receipt printers; the browser only lets us open services listed here.
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
]
// Chooser shows only devices with a name (any first letter/digit) or a print service, hiding the nameless "Unknown or unsupported device" crowd.
const BLE_OPTS = {
  filters: [...SERVICES.map((u) => ({ services: [u] })), ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].map((c) => ({ namePrefix: c }))],
  optionalServices: SERVICES,
}
const SERIAL_OPTS = { allowedBluetoothServiceClassIds: [SPP], filters: [{ bluetoothServiceClassId: SPP }] }

// Live link for this app session, held open on purpose: these printers take one device at a time, so holding it keeps other phones off.
let dev: BtDevice | undefined
let chr: Chr | undefined
let port: Port | undefined

async function writable(d: BtDevice): Promise<Chr> {
  // Android often fails the first GATT connect after the link was idle; one retry fixes it. Still failing = printer off, away, or held by another device.
  const server = await d.gatt!.connect().catch(() => new Promise((r) => setTimeout(r, 800)).then(() => d.gatt!.connect()))
  for (const s of await server.getPrimaryServices())
    for (const c of await s.getCharacteristics()) if (c.properties.writeWithoutResponse || c.properties.write) return c
  throw new Error('No print service on this device')
}

/** Opens the browser's device chooser (needs a tap) and connects. */
export async function connectPrinter(kind: Printer['kind']): Promise<Printer> {
  if (kind === 'ble') {
    const d = await nav.bluetooth!.requestDevice(BLE_OPTS)
    chr = await writable(d)
    dev = d
    return { kind, id: d.id, name: d.name || 'Bluetooth printer' }
  }
  await port?.close().catch(() => {})
  port = await nav.serial!.requestPort(SERIAL_OPTS)
  await port.open({ baudRate: 9600 }) // RFCOMM ignores the baud rate, but open() requires one
  return { kind, id: '', name: 'Bluetooth (classic)' }
}

async function send(p: Printer, data: Uint8Array<ArrayBuffer>) {
  if (p.kind === 'serial') {
    if (!port?.writable) {
      port = (await nav.serial!.getPorts()).find((x) => x.getInfo().bluetoothServiceClassId) ?? (await nav.serial!.requestPort(SERIAL_OPTS))
      if (!port.writable) await port.open({ baudRate: 9600 })
    }
    const w = port.writable!.getWriter()
    try {
      return await w.write(data)
    } finally {
      w.releaseLock()
    }
  }
  // shortcut: Chrome without getDevices() forgets the picked printer when the app restarts, so the first print after a restart shows the chooser once.
  dev ??= (await nav.bluetooth!.getDevices?.())?.find((d) => d.id === p.id) ?? (await nav.bluetooth!.requestDevice(BLE_OPTS))
  if (!chr || !dev.gatt?.connected) chr = await writable(dev)
  for (let i = 0; i < data.length; i += BLE_CHUNK) {
    const part = data.subarray(i, i + BLE_CHUNK)
    await (chr.properties.writeWithoutResponse ? chr.writeValueWithoutResponse(part) : chr.writeValueWithResponse(part))
  }
}

/** Draws the rows 384 dots wide and sends them as an ESC/POS raster + 6 blank lines. */
export async function printRows(p: Printer, rows: Row[]) {
  const c = await receiptCanvas(rows, DOTS, 8, 24) // 24-dot top: Burmese marks above the first line were clipped at 8
  const bytes = escPosRaster(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 6)
  try {
    await send(p, bytes)
  } catch (e) {
    // Drop the dead link so the next tap reconnects from scratch.
    chr = undefined
    await port?.close().catch(() => {})
    throw e
  }
}
