'use server'

import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type QueueType = 'preAcceptance' | 'preInspection' | 'postInspection'

// Helper to get batch start field name
function getBatchStartField(queue: QueueType): 'preAcceptanceBatchStartSimMinute' | 'preInspectionBatchStartSimMinute' | 'postInspectionBatchStartSimMinute' {
  if (queue === 'preAcceptance') return 'preAcceptanceBatchStartSimMinute'
  if (queue === 'preInspection') return 'preInspectionBatchStartSimMinute'
  return 'postInspectionBatchStartSimMinute'
}

// Helper to get Python script field name
function getPythonScriptField(queue: QueueType): 'preAcceptancePythonScript' | 'preInspectionPythonScript' | 'postInspectionPythonScript' {
  if (queue === 'preAcceptance') return 'preAcceptancePythonScript'
  if (queue === 'preInspection') return 'preInspectionPythonScript'
  return 'postInspectionPythonScript'
}

/**
 * Enqueue an order into a specific queue
 * @param currentSimMinute - Current simulation minute (from simulation state)
 */
export async function enqueueOrder(
  queue: QueueType,
  orderId: string,
  currentSimMinute: number,
  sequence?: any,
  processTimes?: any
) {
  try {
    await ensureDatabaseInitialized()

    // Get factory config to determine releaseAfterMinutes
    const order = await prisma.auftrag.findUnique({
      where: { id: orderId },
      include: {
        factory: {
          include: {
            queueConfig: true
          }
        }
      }
    })

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      }
    }

    // Get or create queue config for this factory
    let queueConfig = order.factory.queueConfig
    if (!queueConfig) {
      queueConfig = await prisma.queueConfig.create({
        data: {
          factoryId: order.factoryId,
          preAcceptanceReleaseMinutes: 0,
          preInspectionReleaseMinutes: 0,
          postInspectionReleaseMinutes: 0
        }
      })
    }

    // Determine release time based on queue type
    const releaseAfterMinutes = queue === 'preAcceptance'
      ? queueConfig.preAcceptanceReleaseMinutes
      : queue === 'preInspection'
      ? queueConfig.preInspectionReleaseMinutes
      : queueConfig.postInspectionReleaseMinutes

    // Only use batch mechanism if releaseAfterMinutes > 0
    // For immediate release (0 minutes), skip batch logic
    if (releaseAfterMinutes > 0) {
      // Check if this is the FIRST order in the queue (starts the batch window)
      const batchStartField = getBatchStartField(queue)
      const currentBatchStart = queueConfig[batchStartField]

      // If no batch is running, start a new batch window
      if (currentBatchStart === null || currentBatchStart === undefined) {
        await prisma.queueConfig.update({
          where: { id: queueConfig.id },
          data: { [batchStartField]: currentSimMinute }
        })
        console.log(`🕐 Started new batch window for ${queue} at sim t=${currentSimMinute}`)
      }
    }

    // Get max processing order for this queue
    let maxOrder = 0
    if (queue === 'preAcceptance') {
      const max = await prisma.preAcceptanceQueue.findFirst({
        orderBy: { processingOrder: 'desc' }
      })
      maxOrder = max?.processingOrder ?? 0
    } else if (queue === 'preInspection') {
      const max = await prisma.preInspectionQueue.findFirst({
        orderBy: { processingOrder: 'desc' }
      })
      maxOrder = max?.processingOrder ?? 0
    } else {
      const max = await prisma.postInspectionQueue.findFirst({
        orderBy: { processingOrder: 'desc' }
      })
      maxOrder = max?.processingOrder ?? 0
    }

    // Create queue entry
    const data = {
      orderId,
      possibleSequence: sequence,
      processTimes,
      processingOrder: maxOrder + 1,
      releaseAfterMinutes,
      queuedAtSimMinute: currentSimMinute
    }

    let result
    try {
      if (queue === 'preAcceptance') {
        result = await prisma.preAcceptanceQueue.create({ data })
      } else if (queue === 'preInspection') {
        result = await prisma.preInspectionQueue.create({ data })
      } else {
        result = await prisma.postInspectionQueue.create({ data })
      }
    } catch (error: any) {
      // Check if error is duplicate orderId
      if (error.code === 'P2002') {
        console.warn(`⚠️ Order ${orderId} already in ${queue} queue, skipping...`)
        return {
          success: false,
          error: 'Order already in queue'
        }
      }
      throw error
    }

    revalidatePath('/simulation')

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Error enqueueing order:', error)
    return {
      success: false,
      error: 'Failed to enqueue order'
    }
  }
}

/**
 * Release the next order from a queue if it's ready (wait time has passed)
 * @param currentSimMinute - Current simulation minute (from simulation state)
 */
export async function releaseNext(queue: QueueType, currentSimMinute: number) {
  try {
    await ensureDatabaseInitialized()

    // Find the next ready order (ordered by processingOrder, queuedAtSimMinute)
    let nextEntry: any

    if (queue === 'preAcceptance') {
      nextEntry = await prisma.preAcceptanceQueue.findFirst({
        where: {
          releasedAtSimMinute: null
        },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: {
          order: true
        }
      })
    } else if (queue === 'preInspection') {
      nextEntry = await prisma.preInspectionQueue.findFirst({
        where: {
          releasedAtSimMinute: null
        },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: {
          order: true
        }
      })
    } else {
      nextEntry = await prisma.postInspectionQueue.findFirst({
        where: {
          releasedAtSimMinute: null
        },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: {
          order: true
        }
      })
    }

    if (!nextEntry) {
      return {
        success: true,
        released: false,
        message: 'Queue is empty'
      }
    }

    // Check if release time has been reached (simulation minutes)
    const releaseAtSimMinute = nextEntry.queuedAtSimMinute + nextEntry.releaseAfterMinutes

    if (currentSimMinute < releaseAtSimMinute) {
      const waitMinutes = releaseAtSimMinute - currentSimMinute
      return {
        success: true,
        released: false,
        waiting: true,
        waitMinutes,
        message: `Order ${nextEntry.orderId} waiting ${waitMinutes} more simulation minute(s)`
      }
    }

    // Release the order by setting releasedAtSimMinute
    if (queue === 'preAcceptance') {
      await prisma.preAcceptanceQueue.update({
        where: { id: nextEntry.id },
        data: { releasedAtSimMinute: currentSimMinute }
      })
    } else if (queue === 'preInspection') {
      await prisma.preInspectionQueue.update({
        where: { id: nextEntry.id },
        data: { releasedAtSimMinute: currentSimMinute }
      })
    } else {
      await prisma.postInspectionQueue.update({
        where: { id: nextEntry.id },
        data: { releasedAtSimMinute: currentSimMinute }
      })
    }

    revalidatePath('/simulation')

    return {
      success: true,
      released: true,
      data: {
        orderId: nextEntry.orderId,
        order: nextEntry.order,
        possibleSequence: nextEntry.possibleSequence,
        processTimes: nextEntry.processTimes
      }
    }
  } catch (error) {
    console.error('Error releasing next order:', error)
    return {
      success: false,
      error: 'Failed to release order'
    }
  }
}

/**
 * Get current status of a queue
 * @param currentSimMinute - Current simulation minute (from simulation state). If not provided, uses 0.
 */
export async function getQueueStatus(queue: QueueType, currentSimMinute: number = 0) {
  try {
    await ensureDatabaseInitialized()

    let entries: any[]
    if (queue === 'preAcceptance') {
      entries = await prisma.preAcceptanceQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: {
          order: {
            include: {
              kunde: true,
              produktvariante: {
                include: {
                  produkt: true
                }
              }
            }
          }
        }
      })
    } else if (queue === 'preInspection') {
      entries = await prisma.preInspectionQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: {
          order: {
            include: {
              kunde: true,
              produktvariante: {
                include: {
                  produkt: true
                }
              }
            }
          }
        }
      })
    } else {
      entries = await prisma.postInspectionQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: {
          order: {
            include: {
              kunde: true,
              produktvariante: {
                include: {
                  produkt: true
                }
              }
            }
          }
        }
      })
    }

    // Get batch start time for this queue to calculate accurate release times
    const queueConfig = await prisma.queueConfig.findFirst({
      where: { factoryId: entries[0]?.order?.factoryId }
    })

    const batchStartField = getBatchStartField(queue)
    const batchStartSimMinute = queueConfig?.[batchStartField]

    // Get release wait time from config
    const releaseAfterMinutes = queue === 'preAcceptance'
      ? queueConfig?.preAcceptanceReleaseMinutes || 0
      : queue === 'preInspection'
      ? queueConfig?.preInspectionReleaseMinutes || 0
      : queueConfig?.postInspectionReleaseMinutes || 0

    // Calculate release info for each entry (using simulation minutes)
    const entriesWithStatus = entries.map(entry => {
      // Individual release calculation: each order releases at queuedAtSimMinute + releaseAfterMinutes
      // Note: checkAndReleaseBatch uses batch logic, but display shows individual times
      const releaseAtSimMinute = entry.queuedAtSimMinute + entry.releaseAfterMinutes

      const isReady = currentSimMinute >= releaseAtSimMinute
      const waitMinutes = isReady ? 0 : releaseAtSimMinute - currentSimMinute

      return {
        ...entry,
        isReady,
        waitMinutes,
        releaseAtSimMinute,
        currentSimMinute,
        batchStartSimMinute, // Include for debugging
        configuredReleaseMinutes: releaseAfterMinutes // What's configured vs what's in entry
      }
    })

    return {
      success: true,
      data: {
        queue,
        totalCount: entries.length,
        readyCount: entriesWithStatus.filter(e => e.isReady).length,
        entries: entriesWithStatus
      }
    }
  } catch (error) {
    console.error('Error getting queue status:', error)
    return {
      success: false,
      error: 'Failed to get queue status'
    }
  }
}

/**
 * Update queue configuration for a factory
 */
export async function updateQueueConfig(
  factoryId: string,
  config: {
    preAcceptanceReleaseMinutes?: number
    preInspectionReleaseMinutes?: number
    postInspectionReleaseMinutes?: number
    preAcceptancePythonScript?: string
    preInspectionPythonScript?: string
    postInspectionPythonScript?: string
  }
) {
  try {
    await ensureDatabaseInitialized()

    console.log('🔧 updateQueueConfig called with:', { factoryId, config })

    // Validate factoryId exists
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId }
    })

    if (!factory) {
      console.error('❌ Factory not found:', factoryId)
      return {
        success: false,
        error: `Factory with ID ${factoryId} not found. Please refresh the page.`
      }
    }

    console.log('✅ Factory validated:', factory.name)

    // Clean config: convert empty strings to null for optional fields
    const cleanedConfig: any = { ...config }
    if (cleanedConfig.preAcceptancePythonScript === '') {
      cleanedConfig.preAcceptancePythonScript = null
    }
    if (cleanedConfig.preInspectionPythonScript === '') {
      cleanedConfig.preInspectionPythonScript = null
    }
    if (cleanedConfig.postInspectionPythonScript === '') {
      cleanedConfig.postInspectionPythonScript = null
    }

    const result = await prisma.queueConfig.upsert({
      where: { factoryId },
      create: {
        factoryId,
        preAcceptanceReleaseMinutes: config.preAcceptanceReleaseMinutes ?? 0,
        preInspectionReleaseMinutes: config.preInspectionReleaseMinutes ?? 0,
        postInspectionReleaseMinutes: config.postInspectionReleaseMinutes ?? 0,
        preAcceptancePythonScript: cleanedConfig.preAcceptancePythonScript,
        preInspectionPythonScript: cleanedConfig.preInspectionPythonScript,
        postInspectionPythonScript: cleanedConfig.postInspectionPythonScript
      },
      update: cleanedConfig
    })

    console.log('✅ Queue config saved successfully:', result)

    revalidatePath('/simulation')
    revalidatePath('/simulation/queues')

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('❌ Error updating queue config:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update queue config'
    }
  }
}

/**
 * Clear all queues (used at simulation start)
 */
export async function clearAllQueues() {
  try {
    await ensureDatabaseInitialized()

    await Promise.all([
      prisma.preAcceptanceQueue.deleteMany({}),
      prisma.preInspectionQueue.deleteMany({}),
      prisma.postInspectionQueue.deleteMany({})
    ])

    // Reset all batch start times to null
    await prisma.queueConfig.updateMany({
      data: {
        preAcceptanceBatchStartSimMinute: null,
        preInspectionBatchStartSimMinute: null,
        postInspectionBatchStartSimMinute: null
      }
    })

    console.log('🧹 All queues cleared and batch start times reset')

    return {
      success: true
    }
  } catch (error) {
    console.error('Error clearing queues:', error)
    return {
      success: false,
      error: 'Failed to clear queues'
    }
  }
}

/**
 * Get queue configuration for a factory
 */
export async function getQueueConfig(factoryId: string) {
  try {
    await ensureDatabaseInitialized()

    const config = await prisma.queueConfig.findUnique({
      where: { factoryId }
    })

    if (!config) {
      // Create default config
      const newConfig = await prisma.queueConfig.create({
        data: {
          factoryId,
          preAcceptanceReleaseMinutes: 0,
          preInspectionReleaseMinutes: 0,
          postInspectionReleaseMinutes: 0
        }
      })

      return {
        success: true,
        data: newConfig
      }
    }

    return {
      success: true,
      data: config
    }
  } catch (error) {
    console.error('Error getting queue config:', error)
    return {
      success: false,
      error: 'Failed to get queue config'
    }
  }
}

/**
 * Check if batch wait time has elapsed and release all orders in batch
 * This implements the batch queue concept:
 * 1. Orders accumulate in queue during wait time
 * 2. After wait time, optionally call Python script to optimize order sequence
 * 3. Release orders (either optimized or FIFO order)
 * @returns List of released order IDs in the order they should be processed
 */
export async function checkAndReleaseBatch(
  queue: QueueType,
  currentSimMinute: number,
  factoryId: string
) {
  try {
    await ensureDatabaseInitialized()

    // Get queue config
    const queueConfig = await prisma.queueConfig.findUnique({
      where: { factoryId }
    })

    if (!queueConfig) {
      return {
        success: false,
        error: 'Queue config not found'
      }
    }

    // Get release wait time
    const releaseAfterMinutes = queue === 'preAcceptance'
      ? queueConfig.preAcceptanceReleaseMinutes
      : queue === 'preInspection'
      ? queueConfig.preInspectionReleaseMinutes
      : queueConfig.postInspectionReleaseMinutes

    const batchStartField = getBatchStartField(queue)
    const batchStartSimMinute = queueConfig[batchStartField]

    // If releaseAfterMinutes is 0, we don't use batch mechanism - release all immediately
    if (releaseAfterMinutes === 0) {
      // No batch logic needed - proceed directly to release all waiting orders
    } else {
      // Normal batch logic for wait times > 0

      // No batch running?
      if (batchStartSimMinute === null || batchStartSimMinute === undefined) {
        return {
          success: true,
          batchReleased: false,
          message: 'No active batch'
        }
      }

      const batchReleaseSimMinute = batchStartSimMinute + releaseAfterMinutes

      // Wait time not elapsed yet?
      if (currentSimMinute < batchReleaseSimMinute) {
        return {
          success: true,
          batchReleased: false,
          waiting: true,
          waitMinutes: batchReleaseSimMinute - currentSimMinute,
          message: `Batch waiting ${batchReleaseSimMinute - currentSimMinute} more sim minutes`
        }
      }
    }

    // BATCH RELEASE TIME! Get all unreleased orders
    let entries: any[]
    if (queue === 'preAcceptance') {
      entries = await prisma.preAcceptanceQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: { order: true }
      })
    } else if (queue === 'preInspection') {
      entries = await prisma.preInspectionQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: { order: true }
      })
    } else {
      entries = await prisma.postInspectionQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: { order: true }
      })
    }

    if (entries.length === 0) {
      // Reset batch window since no orders
      await prisma.queueConfig.update({
        where: { id: queueConfig.id },
        data: { [batchStartField]: null }
      })
      return {
        success: true,
        batchReleased: false,
        message: 'No orders in batch'
      }
    }

    // Check if Python optimization script is configured
    const pythonScriptField = getPythonScriptField(queue)
    const pythonScriptPath = queueConfig[pythonScriptField]

    let orderedEntries = entries

    // TODO: Call Python script for optimization if configured
    if (pythonScriptPath) {
      console.log(`🐍 Python script configured: ${pythonScriptPath}`)
      console.log(`📊 Would optimize ${entries.length} orders, but Python integration not yet implemented`)
      // For now, keep FIFO order
      // Future: Call Python script, pass order data, get optimized sequence back
    }

    // Mark all orders as released
    const orderIds = orderedEntries.map(e => e.orderId)

    if (queue === 'preAcceptance') {
      await prisma.preAcceptanceQueue.updateMany({
        where: { orderId: { in: orderIds } },
        data: { releasedAtSimMinute: currentSimMinute }
      })
    } else if (queue === 'preInspection') {
      await prisma.preInspectionQueue.updateMany({
        where: { orderId: { in: orderIds } },
        data: { releasedAtSimMinute: currentSimMinute }
      })
    } else {
      await prisma.postInspectionQueue.updateMany({
        where: { orderId: { in: orderIds } },
        data: { releasedAtSimMinute: currentSimMinute }
      })
    }

    // Reset batch window for next batch (only if we're using batch mechanism)
    if (releaseAfterMinutes > 0) {
      await prisma.queueConfig.update({
        where: { id: queueConfig.id },
        data: { [batchStartField]: null }
      })
    }

    console.log(`✅ Released ${releaseAfterMinutes === 0 ? 'immediate' : 'batch'} of ${orderIds.length} orders from ${queue} at sim t=${currentSimMinute}`)

    revalidatePath('/simulation')

    return {
      success: true,
      batchReleased: true,
      orderIds,
      orders: orderedEntries.map(e => e.order),
      count: orderIds.length,
      optimized: !!pythonScriptPath
    }
  } catch (error) {
    console.error('Error releasing batch:', error)
    return {
      success: false,
      error: 'Failed to release batch'
    }
  }
}

/**
 * Clear released entries from a queue (cleanup)
 */
export async function clearReleasedEntries(queue: QueueType) {
  try {
    await ensureDatabaseInitialized()

    let result
    if (queue === 'preAcceptance') {
      result = await prisma.preAcceptanceQueue.deleteMany({
        where: {
          releasedAtSimMinute: {
            not: null
          }
        }
      })
    } else if (queue === 'preInspection') {
      result = await prisma.preInspectionQueue.deleteMany({
        where: {
          releasedAtSimMinute: {
            not: null
          }
        }
      })
    } else {
      result = await prisma.postInspectionQueue.deleteMany({
        where: {
          releasedAtSimMinute: {
            not: null
          }
        }
      })
    }

    revalidatePath('/simulation')

    return {
      success: true,
      deletedCount: result.count
    }
  } catch (error) {
    console.error('Error clearing released entries:', error)
    return {
      success: false,
      error: 'Failed to clear released entries'
    }
  }
}
