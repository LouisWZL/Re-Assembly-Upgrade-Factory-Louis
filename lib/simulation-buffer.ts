/**
 * Simulation State Buffer
 *
 * Buffers simulation state changes in memory and batches database writes
 * to reduce DB load and prevent connection pool exhaustion.
 */

interface BufferedUpdate {
  type: 'phase' | 'progress' | 'station' | 'completed'
  orderId: string
  data: any
  timestamp: number
  priority: 'low' | 'medium' | 'high' // high = write immediately
}

interface BufferStats {
  bufferedUpdates: number
  lastFlush: number
  totalFlushed: number
  errors: number
}

class SimulationBuffer {
  private buffer: Map<string, BufferedUpdate> = new Map()
  private flushInterval: NodeJS.Timeout | null = null
  private stats: BufferStats = {
    bufferedUpdates: 0,
    lastFlush: Date.now(),
    totalFlushed: 0,
    errors: 0
  }

  // Configuration
  private readonly FLUSH_INTERVAL_MS = 5000 // Flush every 5 seconds
  private readonly MAX_BUFFER_SIZE = 100 // Force flush if buffer exceeds this
  private readonly BATCH_SIZE = 20 // Write max 20 items per batch

  constructor() {
    console.log('[SimBuffer] Initialized with config:', {
      flushInterval: this.FLUSH_INTERVAL_MS,
      maxBufferSize: this.MAX_BUFFER_SIZE,
      batchSize: this.BATCH_SIZE
    })
  }

  /**
   * Start automatic flushing
   */
  start() {
    if (this.flushInterval) {
      console.warn('[SimBuffer] Already started')
      return
    }

    console.log('[SimBuffer] Starting automatic flush')
    this.flushInterval = setInterval(() => {
      this.flush()
    }, this.FLUSH_INTERVAL_MS)
  }

  /**
   * Stop automatic flushing
   */
  stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
      console.log('[SimBuffer] Stopped')
    }

    // Flush remaining data
    if (this.buffer.size > 0) {
      console.log('[SimBuffer] Flushing remaining data on stop')
      this.flush()
    }
  }

  /**
   * Add an update to the buffer
   */
  add(update: BufferedUpdate) {
    // Generate unique key for deduplication
    const key = `${update.type}-${update.orderId}`

    // If high priority, write immediately
    if (update.priority === 'high') {
      console.log(`[SimBuffer] High priority update, writing immediately:`, key)
      this.writeImmediate(update)
      return
    }

    // Store in buffer (overwrites older update for same key)
    this.buffer.set(key, update)
    this.stats.bufferedUpdates = this.buffer.size

    // Force flush if buffer too large
    if (this.buffer.size >= this.MAX_BUFFER_SIZE) {
      console.warn(`[SimBuffer] Buffer size limit reached (${this.buffer.size}), forcing flush`)
      this.flush()
    }
  }

  /**
   * Add a phase change update
   */
  addPhaseUpdate(orderId: string, phase: string, priority: 'low' | 'medium' | 'high' = 'medium') {
    this.add({
      type: 'phase',
      orderId,
      data: { phase },
      timestamp: Date.now(),
      priority
    })
  }

  /**
   * Add a progress update
   */
  addProgressUpdate(orderId: string, progress: number, currentStation: string, priority: 'low' | 'medium' | 'high' = 'low') {
    this.add({
      type: 'progress',
      orderId,
      data: { progress, currentStation },
      timestamp: Date.now(),
      priority
    })
  }

  /**
   * Add an order completion
   */
  addCompletionUpdate(orderId: string, completedAt: Date, priority: 'low' | 'medium' | 'high' = 'high') {
    this.add({
      type: 'completed',
      orderId,
      data: { completedAt },
      timestamp: Date.now(),
      priority
    })
  }

  /**
   * Write a single update immediately (for high priority)
   */
  private async writeImmediate(update: BufferedUpdate) {
    try {
      await this.writeUpdate(update)
    } catch (error) {
      console.error('[SimBuffer] Error writing immediate update:', error)
      this.stats.errors++

      // Fall back to buffering
      const key = `${update.type}-${update.orderId}`
      this.buffer.set(key, { ...update, priority: 'medium' })
    }
  }

  /**
   * Flush buffered updates to database
   */
  async flush() {
    if (this.buffer.size === 0) {
      return
    }

    const updates = Array.from(this.buffer.values())
    const count = updates.length

    console.log(`[SimBuffer] Flushing ${count} updates...`)

    // Sort by priority and timestamp
    updates.sort((a, b) => {
      if (a.priority !== b.priority) {
        const priority = { high: 3, medium: 2, low: 1 }
        return priority[b.priority] - priority[a.priority]
      }
      return a.timestamp - b.timestamp
    })

    // Process in batches
    const batches: BufferedUpdate[][] = []
    for (let i = 0; i < updates.length; i += this.BATCH_SIZE) {
      batches.push(updates.slice(i, i + this.BATCH_SIZE))
    }

    let successCount = 0
    let errorCount = 0

    for (const batch of batches) {
      try {
        await this.writeBatch(batch)
        successCount += batch.length

        // Remove successfully written updates
        batch.forEach(update => {
          const key = `${update.type}-${update.orderId}`
          this.buffer.delete(key)
        })
      } catch (error) {
        console.error('[SimBuffer] Error writing batch:', error)
        errorCount += batch.length
        this.stats.errors++

        // Keep failed updates in buffer for retry
      }
    }

    this.stats.lastFlush = Date.now()
    this.stats.totalFlushed += successCount
    this.stats.bufferedUpdates = this.buffer.size

    console.log(`[SimBuffer] Flush complete: ${successCount} written, ${errorCount} failed, ${this.buffer.size} remaining`)
  }

  /**
   * Write a batch of updates to database
   */
  private async writeBatch(batch: BufferedUpdate[]) {
    // Group by type for efficient batch operations
    const phaseUpdates = batch.filter(u => u.type === 'phase')
    const progressUpdates = batch.filter(u => u.type === 'progress')
    const completionUpdates = batch.filter(u => u.type === 'completed')

    const promises: Promise<any>[] = []

    // Batch phase updates
    if (phaseUpdates.length > 0) {
      promises.push(
        fetch('/api/auftrag/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'phase',
            updates: phaseUpdates.map(u => ({
              id: u.orderId,
              phase: u.data.phase
            }))
          })
        })
      )
    }

    // Skip progress updates for now - they're not critical
    // We can add them later if needed

    // Batch completion updates
    if (completionUpdates.length > 0) {
      promises.push(
        fetch('/api/auftrag/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'completion',
            updates: completionUpdates.map(u => ({
              id: u.orderId,
              completedAt: u.data.completedAt
            }))
          })
        })
      )
    }

    await Promise.all(promises)
  }

  /**
   * Write a single update (fallback)
   */
  private async writeUpdate(update: BufferedUpdate) {
    // For now, just log - we'll implement actual writes via batch-update endpoint
    console.log(`[SimBuffer] Would write:`, update)
  }

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    return { ...this.stats }
  }

  /**
   * Clear all buffered data (use with caution!)
   */
  clear() {
    console.warn(`[SimBuffer] Clearing ${this.buffer.size} buffered updates`)
    this.buffer.clear()
    this.stats.bufferedUpdates = 0
  }
}

// Singleton instance
let bufferInstance: SimulationBuffer | null = null

export function getSimulationBuffer(): SimulationBuffer {
  if (!bufferInstance) {
    bufferInstance = new SimulationBuffer()
  }
  return bufferInstance
}

export function startSimulationBuffer() {
  const buffer = getSimulationBuffer()
  buffer.start()
  return buffer
}

export function stopSimulationBuffer() {
  if (bufferInstance) {
    bufferInstance.stop()
  }
}
