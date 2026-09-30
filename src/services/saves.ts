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
}

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
}

export async function setKV(k: string, v: unknown) {
  await tx('kv', 'readwrite', (s) => s.put(v, k))
}
export async function getKV<T>(k: string): Promise<T | undefined> {
  return tx<T>('kv', 'readonly', (s) => s.get(k))
}
