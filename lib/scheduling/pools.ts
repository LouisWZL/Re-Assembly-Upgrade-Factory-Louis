import type { PoolName, PoolRecord, PoolsSnapshot, SchedulingConfig } from './types'

type StorageAdapter = {
  load: () => PoolsSnapshot | null
  save: (snapshot: PoolsSnapshot) => void
}

function createStorageAdapter(storageKey?: string): StorageAdapter | null {
  if (typeof window === 'undefined' || !storageKey) {
    return null
  }

  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return null
        return JSON.parse(raw) as PoolsSnapshot
      } catch (error) {
        console.warn('[scheduling][pools] Failed to load snapshot from storage:', error)
        return null
      }
    },
    save: (snapshot: PoolsSnapshot) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
      } catch (error) {
        console.warn('[scheduling][pools] Failed to persist snapshot:', error)
      }
    },
  }
}

export class Pools {
  private stores: Record<PoolName, Map<string, PoolRecord>>
  private version = 0
  private readonly storageAdapter: StorageAdapter | null
  private readonly config: SchedulingConfig

  constructor(config: SchedulingConfig) {
    this.config = config
    this.stores = {
      pap: new Map(),
      pip: new Map(),
      pipo: new Map(),
    }

    this.storageAdapter = createStorageAdapter(config.storageKey)
    this.restore()
  }

  private restore() {
    if (!this.storageAdapter) return
    const snapshot = this.storageAdapter.load()
    if (!snapshot) return

    this.version = snapshot.version
    for (const pool of ['pap', 'pip', 'pipo'] as PoolName[]) {
      const entries = snapshot[pool]
      this.stores[pool] = new Map(entries.map((record) => [record.oid, record]))
    }
    console.info('[scheduling][pools] Restored pools snapshot', { version: snapshot.version })
  }

  private persist() {
    if (!this.storageAdapter) return
    this.storageAdapter.save(this.captureSnapshot())
  }

  private captureSnapshot(): PoolsSnapshot {
    return {
      pap: Array.from(this.stores.pap.values()),
      pip: Array.from(this.stores.pip.values()),
      pipo: Array.from(this.stores.pipo.values()),
      generatedAt: Date.now(),
      version: this.version,
    }
  }

  private touch(orderId: string) {
    this.version += 1
    if (this.config.storageKey) {
      this.persist()
    }
    console.debug('[scheduling][pools] Updated pools version', { orderId, version: this.version })
  }

  upsertPAP(record: PoolRecord) {
    this.stores.pap.set(record.oid, {
      ...this.stores.pap.get(record.oid),
      ...record,
    })
    this.touch(record.oid)
  }

  moveToPIP(orderId: string, updates: Partial<PoolRecord> = {}) {
    const existing = this.stores.pap.get(orderId) ?? {
      oid: orderId,
      batchId: null,
    }
    const merged: PoolRecord = {
      ...existing,
      ...updates,
    }
    this.stores.pap.delete(orderId)
    this.stores.pip.set(orderId, merged)
    this.touch(orderId)
  }

  moveToPIPo(orderId: string, updates: Partial<PoolRecord> = {}) {
    const existing =
      this.stores.pip.get(orderId) ??
      this.stores.pap.get(orderId) ?? {
        oid: orderId,
        batchId: null,
      }
    const merged: PoolRecord = {
      ...existing,
      ...updates,
    }
    this.stores.pip.delete(orderId)
    this.stores.pipo.set(orderId, merged)
    this.touch(orderId)
  }

  remove(orderId: string) {
    let removed = false
    ;(['pap', 'pip', 'pipo'] as PoolName[]).forEach((pool) => {
      if (this.stores[pool].delete(orderId)) {
        removed = true
      }
    })
    if (removed) {
      this.touch(orderId)
    }
  }

  generateBatchId(prefix: string) {
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    return `${prefix}-${uuid}`
  }

  getSnapshot(pool: PoolName) {
    return Array.from(this.stores[pool].values())
  }

  getAllSnapshots(): PoolsSnapshot {
    return this.captureSnapshot()
  }

  clear() {
    this.stores = {
      pap: new Map(),
      pip: new Map(),
      pipo: new Map(),
    }
    this.touch('CLEAR')
  }
}
