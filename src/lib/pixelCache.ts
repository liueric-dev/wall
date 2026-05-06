// IndexedDB-backed warm cache for the pixel store.
//
// Cold-load (no cache) cost is the parallel bootstrap fetch — fast on a good
// network, painful on a flaky one. With the cache, refresh hydrates instantly
// from disk and the live fetch only refines / extends what's already painted.
//
// The cache is best-effort: any IDB failure is swallowed and we fall back to
// a normal cold-load. Never block the user on IDB.

const DB_NAME = 'wall-cache'
const DB_VERSION = 1
const STORE = 'snapshot'
const KEY = 'v2'  // bumped: v1 lacked per-pixel eventId, which re-introduces
                  // older-stomps-newer flicker once the streaming bootstrap runs

interface CachedSnapshot {
  version: 2
  // [pixelKey "x,y", colorHex, eventId]. eventId = 0 means "unknown" and lets
  // any real incoming event win — used for legacy entries / first-time saves.
  pixels: Array<[string, string, number]>
  lastSeenTimestamp: string | null
  savedAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      const req = fn(store)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function loadSnapshot(): Promise<CachedSnapshot | null> {
  try {
    const value = await withStore<CachedSnapshot | undefined>(
      'readonly',
      store => store.get(KEY) as IDBRequest<CachedSnapshot | undefined>,
    )
    if (!value || value.version !== 2) return null
    return value
  } catch {
    return null
  }
}

export async function saveSnapshot(
  pixels: Map<string, string>,
  pixelEventIds: Map<string, number>,
  lastSeenTimestamp: string | null,
): Promise<void> {
  const triples: Array<[string, string, number]> = []
  for (const [k, color] of pixels) {
    triples.push([k, color, pixelEventIds.get(k) ?? 0])
  }
  const snapshot: CachedSnapshot = {
    version: 2,
    pixels: triples,
    lastSeenTimestamp,
    savedAt: new Date().toISOString(),
  }
  try {
    await withStore<IDBValidKey>(
      'readwrite',
      store => store.put(snapshot, KEY),
    )
  } catch {
    // best-effort
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await withStore<undefined>(
      'readwrite',
      store => store.delete(KEY) as IDBRequest<undefined>,
    )
  } catch {
    // best-effort
  }
}
