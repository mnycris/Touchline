import { gunzip, gunzipSync, gzip, gzipSync, strFromU8, strToU8 } from 'fflate'
import type { World } from '../domain/types'

export interface SaveMeta {
  id: string
  name: string
  managerName: string
  clubId: number
  clubName: string
  date: string
  season: number
  updated: number
  playTimeMin: number
  leagueName: string
  position?: number
  editMode?: boolean
  size: number
  auto?: boolean
  /** save schema and app version it was written with */
  schema?: number
  appVersion?: string
}

/** A named snapshot of a career the manager can go back to (separate from the rolling autosave). */
export interface CheckpointMeta {
  id: string
  careerId: string
  name: string
  /** game date and season it was taken on */
  date: string
  season: number
  clubName: string
  position?: number
  leagueName?: string
  created: number
  size: number
  schema?: number
  /** taken automatically (before a save update, before restoring another checkpoint) */
  auto?: 'update' | 'restore'
}

/** Checkpoints per career; the oldest automatic one goes first when a new one needs room. */
export const MAX_CHECKPOINTS = 10

const DB = 'opus-ball'
const VERSION = 1

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data')
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const r = fn(s)
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined)
    t.onerror = () => reject(t.error)
  }))
}

export function serialize(w: World): Uint8Array {
  return gzipSync(strToU8(JSON.stringify(w)), { level: 5 })
}
export function deserialize(b: Uint8Array): World {
  return JSON.parse(strFromU8(gunzipSync(b)))
}

/** Compression runs off the main thread (fflate spawns a worker), so autosave doesn't stall the UI. */
function serializeAsync(w: World): Promise<Uint8Array> {
  const bytes = strToU8(JSON.stringify(w))
  return new Promise((resolve, reject) => {
    try {
      gzip(bytes, { level: 4 }, (err, out) => (err ? reject(err) : resolve(out)))
    } catch {
      resolve(gzipSync(bytes, { level: 4 }))
    }
  })
}
function deserializeAsync(b: Uint8Array): Promise<World> {
  return new Promise((resolve, reject) => {
    try {
      gunzip(b, (err, out) => (err ? reject(err) : resolve(JSON.parse(strFromU8(out)))))
    } catch {
      resolve(deserialize(b))
    }
  })
}

export async function saveCareer(w: World, meta: Omit<SaveMeta, 'size' | 'updated'>): Promise<SaveMeta> {
  const bytes = await serializeAsync(w)
  const m: SaveMeta = { ...meta, size: bytes.byteLength, updated: Date.now() }
  await tx('data', 'readwrite', (s) => s.put(bytes, meta.id))
  await tx('meta', 'readwrite', (s) => s.put(m))
  await setKV('lastSave', meta.id)
  return m
}

export async function loadCareer(id: string): Promise<World | undefined> {
  const bytes = await tx<Uint8Array>('data', 'readonly', (s) => s.get(id))
  if (!bytes) return undefined
  return deserializeAsync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer))
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await tx<SaveMeta[]>('meta', 'readonly', (s) => s.getAll())) || []
  return all.sort((a, b) => b.updated - a.updated)
}

export async function deleteSave(id: string) {
  await tx('data', 'readwrite', (s) => s.delete(id))
  await tx('meta', 'readwrite', (s) => s.delete(id))
  for (const c of await listCheckpoints(id)) await tx('data', 'readwrite', (s) => s.delete(cpKey(c.id)))
  await setKV(`cp:${id}`, [])
}

/** The stored (compressed) bytes of a save, e.g. to back it up before it is updated. */
export async function saveBytes(id: string): Promise<Uint8Array | undefined> {
  const bytes = await tx<Uint8Array>('data', 'readonly', (s) => s.get(id))
  return bytes ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)) : undefined
}

// ---------------------------------------------------------------- checkpoints
const cpKey = (cpId: string) => `cp::${cpId}`

export async function listCheckpoints(careerId: string): Promise<CheckpointMeta[]> {
  const list = (await getKV<CheckpointMeta[]>(`cp:${careerId}`)) || []
  return [...list].sort((a, b) => b.created - a.created)
}

/** Store a checkpoint from a world (or from bytes already compressed). Makes room by dropping the oldest automatic one. */
export async function saveCheckpoint(src: World | Uint8Array, meta: Omit<CheckpointMeta, 'id' | 'created' | 'size'>): Promise<CheckpointMeta> {
  const bytes = src instanceof Uint8Array ? src : await serializeAsync(src)
  const list = await listCheckpoints(meta.careerId)
  while (list.length >= MAX_CHECKPOINTS) {
    const autos = list.filter((c) => c.auto)
    const drop = (autos.length ? autos : list)[(autos.length ? autos : list).length - 1]
    await tx('data', 'readwrite', (s) => s.delete(cpKey(drop.id)))
    list.splice(list.indexOf(drop), 1)
  }
  const cp: CheckpointMeta = { ...meta, id: `${meta.careerId}~${Date.now().toString(36)}`, created: Date.now(), size: bytes.byteLength }
  await tx('data', 'readwrite', (s) => s.put(bytes, cpKey(cp.id)))
  await setKV(`cp:${meta.careerId}`, [cp, ...list])
  return cp
}

export async function loadCheckpoint(cpId: string): Promise<World | undefined> {
  const bytes = await tx<Uint8Array>('data', 'readonly', (s) => s.get(cpKey(cpId)))
  if (!bytes) return undefined
  return deserializeAsync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer))
}

export async function deleteCheckpoint(careerId: string, cpId: string) {
  await tx('data', 'readwrite', (s) => s.delete(cpKey(cpId)))
  await setKV(`cp:${careerId}`, (await listCheckpoints(careerId)).filter((c) => c.id !== cpId))
}

export async function renameCheckpoint(careerId: string, cpId: string, name: string) {
  await setKV(`cp:${careerId}`, (await listCheckpoints(careerId)).map((c) => (c.id === cpId ? { ...c, name } : c)))
}

// ---------------------------------------------------------------- export / import
const FILE_MAGIC = 'touchline-save'

/** A career as a single file (the compressed world plus its details) to move it to another device or address. */
export async function exportCareer(id: string): Promise<{ blob: Blob; filename: string } | undefined> {
  const bytes = await saveBytes(id)
  const meta = (await listSaves()).find((m) => m.id === id)
  if (!bytes || !meta) return undefined
  const head = strToU8(JSON.stringify({ format: FILE_MAGIC, v: 1, meta }) + '\n')
  const blob = new Blob([head as BlobPart, bytes as BlobPart], { type: 'application/octet-stream' })
  const safe = meta.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'career'
  return { blob, filename: `${safe}-${meta.date}.touchline` }
}

/** Read an exported career file back into a world (it is saved as a new career by the caller). */
export async function readCareerFile(file: Blob): Promise<{ world: World; meta?: SaveMeta }> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const nl = buf.indexOf(10)
  if (nl > 0 && nl < 4096) {
    try {
      const head = JSON.parse(strFromU8(buf.subarray(0, nl)))
      if (head?.format === FILE_MAGIC) return { world: await deserializeAsync(buf.subarray(nl + 1)), meta: head.meta }
    } catch { /* not our header: try the plain formats below */ }
  }
  // a bare compressed save, or plain JSON
  try { return { world: await deserializeAsync(buf) } } catch { /* fall through */ }
  return { world: JSON.parse(strFromU8(buf)) }
}

// ---------------------------------------------------------------- storage
/** How much this device lets the app store and how much is used; asks the browser to keep saves (not evict them). */
export async function storageInfo(): Promise<{ used: number; quota: number; persisted: boolean }> {
  const est = await navigator.storage?.estimate?.().catch(() => undefined)
  let persisted = !!(await navigator.storage?.persisted?.().catch(() => false))
  if (!persisted) persisted = !!(await navigator.storage?.persist?.().catch(() => false))
  return { used: est?.usage || 0, quota: est?.quota || 0, persisted }
}

export async function setKV(k: string, v: unknown) {
  await tx('kv', 'readwrite', (s) => s.put(v, k))
}
export async function getKV<T>(k: string): Promise<T | undefined> {
  return tx<T>('kv', 'readonly', (s) => s.get(k))
}
