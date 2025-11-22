'use server'

/**
 * Queue Management System with Algorithm Bundle Support
 *
 * This module manages three scheduling queues (PAP, PIP, PIPO) and integrates
 * with the configurable Algorithm Bundle system for scheduling optimization.
 *
 * ## Architecture Overview:
 *
 * ### Algorithm Bundles
 * Algorithm bundles are configurable sets of scheduling algorithms that can be
 * assigned to factories. Each bundle defines:
 * - **PAP Script**: Pre-Acceptance Processing (Grobterminierung) - Initial scheduling
 * - **PIP Script**: Pre-Inspection Processing (Durchlaufterminierung) - Mid-term optimization
 * - **PIPO Script**: Post-Inspection Processing Optimization (Feinterminierung) - Final scheduling
 *
 * ### How It Works:
 * 1. Each factory has a QueueConfig that references an active AlgorithmBundle
 * 2. When orders are enqueued, the system loads the active bundle's configuration
 * 3. The bundle's script paths (papScriptPath, pipScriptPath, pipoScriptPath) define
 *    which scheduling algorithms to use
 * 4. The scheduling-daemon.actions.ts executes these scripts to optimize order sequences
 *
 * ### Queues:
 * - **preAcceptance (PAP)**: Orders waiting for initial acceptance and scheduling
 * - **preInspection (PIP)**: Orders waiting for inspection slot assignment
 * - **postInspection (PIPO)**: Orders waiting for final production scheduling
 *
 * ### Usage:
 * - Configure bundles at /simulation/algorithms
 * - Assign bundles to factories in QueueConfig
 * - Set one bundle as active per factory
 * - The system automatically uses the active bundle's algorithms
 *
 * @see AlgorithmBundle model in prisma/schema.prisma
 * @see /app/simulation/algorithms for bundle management UI
 * @see scheduling-daemon.actions.ts for algorithm execution
 */

import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { runPapStage, runPipStage, runPipoStage, logSchedulingSummaryEntry } from './scheduling-daemon.actions'

export type QueueType = 'preAcceptance' | 'preInspection' | 'postInspection'

// Helper to get batch start field name
function getBatchStartField(queue: QueueType): 'preAcceptanceBatchStartSimMinute' | 'preInspectionBatchStartSimMinute' | 'postInspectionBatchStartSimMinute' {
  if (queue === 'preAcceptance') return 'preAcceptanceBatchStartSimMinute'
  if (queue === 'preInspection') return 'preInspectionBatchStartSimMinute'
  return 'postInspectionBatchStartSimMinute'
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

    const findExistingEntry = async () => {
      if (queue === 'preAcceptance') {
        return prisma.preAcceptanceQueue.findUnique({ where: { orderId } })
      }
      if (queue === 'preInspection') {
        return prisma.preInspectionQueue.findUnique({ where: { orderId } })
      }
      return prisma.postInspectionQueue.findUnique({ where: { orderId } })
    }

    const existingEntry = await findExistingEntry()

    if (existingEntry && existingEntry.releasedAtSimMinute === null) {
      console.warn(`⚠️ Order ${orderId} already pending in ${queue} queue, skipping enqueue.`)
      return {
        success: true,
        skipped: true
      }
    }

    if (existingEntry && existingEntry.releasedAtSimMinute !== null) {
      if (queue === 'preAcceptance') {
        await prisma.preAcceptanceQueue.delete({ where: { id: existingEntry.id } })
      } else if (queue === 'preInspection') {
        await prisma.preInspectionQueue.delete({ where: { id: existingEntry.id } })
      } else {
        await prisma.postInspectionQueue.delete({ where: { id: existingEntry.id } })
      }
    }

    // Get factory config to determine releaseAfterMinutes
    // Also fetch the active algorithm bundle for potential Python script execution
    const order = await prisma.auftrag.findUnique({
      where: { id: orderId },
      include: {
        factory: {
          include: {
            queueConfig: {
              include: {
                algorithmBundle: true
              }
            }
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
      await prisma.queueConfig.create({
        data: {
          factoryId: order.factoryId,
          preAcceptanceReleaseMinutes: 0,
          preInspectionReleaseMinutes: 0,
          postInspectionReleaseMinutes: 0
        }
      })
      queueConfig = await prisma.queueConfig.findUnique({
        where: { factoryId: order.factoryId },
        include: { algorithmBundle: true },
      })
    }

    if (!queueConfig) {
      return {
        success: false,
        error: 'Queue configuration unavailable',
      }
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
    const maxOrder = await (async () => {
      if (queue === 'preAcceptance') {
        const max = await prisma.preAcceptanceQueue.findFirst({ orderBy: { processingOrder: 'desc' } })
        return max?.processingOrder ?? 0
      }
      if (queue === 'preInspection') {
        const max = await prisma.preInspectionQueue.findFirst({ orderBy: { processingOrder: 'desc' } })
        return max?.processingOrder ?? 0
      }
      const max = await prisma.postInspectionQueue.findFirst({ orderBy: { processingOrder: 'desc' } })
      return max?.processingOrder ?? 0
    })()

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

    const firstEntry =
      queue === 'preAcceptance'
        ? await prisma.preAcceptanceQueue.findFirst({
            where: { releasedAtSimMinute: null },
            orderBy: [
              { processingOrder: 'asc' },
              { queuedAtSimMinute: 'asc' }
            ],
            include: { order: true }
          })
        : queue === 'preInspection'
        ? await prisma.preInspectionQueue.findFirst({
            where: { releasedAtSimMinute: null },
            orderBy: [
              { processingOrder: 'asc' },
              { queuedAtSimMinute: 'asc' }
            ],
            include: { order: true }
          })
        : await prisma.postInspectionQueue.findFirst({
            where: { releasedAtSimMinute: null },
            orderBy: [
              { processingOrder: 'asc' },
              { queuedAtSimMinute: 'asc' }
            ],
            include: { order: true }
          })

    if (!firstEntry) {
      return {
        success: true,
        released: false,
        message: 'Queue is empty'
      }
    }

    const factoryId = firstEntry.order.factoryId
    let scheduling: any = null
    try {
      if (queue === 'preAcceptance') {
        scheduling = await runPapStage(factoryId, currentSimMinute)
      } else if (queue === 'preInspection') {
        scheduling = await runPipStage(factoryId)
      } else {
        scheduling = await runPipoStage(factoryId)
      }
    } catch (error) {
      console.error(`[Scheduling] Failed to run ${queue} stage:`, error)
      scheduling = null
    }

    const stageEntries = (scheduling?.orderedEntries as any[]) || []
    const nextEntry = stageEntries.length ? stageEntries[0] : firstEntry
    console.log(`[Scheduling] releaseNext(${queue})`, {
      orderId: nextEntry?.orderId,
      scheduled: stageEntries.length,
    })

    const pythonReleaseList = Array.isArray(scheduling?.result?.releaseList)
      ? (scheduling?.result?.releaseList as any[])
          .slice(0, 8)
          .map((orderId: any) => String(orderId))
      : undefined
    const pythonEtaList = Array.isArray(scheduling?.result?.etaList)
      ? (scheduling?.result?.etaList as any[])
          .slice(0, 6)
          .map((eta: any) => ({
            orderId: String(eta.orderId ?? ''),
            eta: Number(eta.eta ?? 0),
          }))
      : undefined
    const pythonPriorities = Array.isArray(scheduling?.result?.priorities)
      ? (scheduling?.result?.priorities as any[])
          .slice(0, 6)
          .map((p: any) => ({
            orderId: String(p.orderId ?? ''),
            priority: Number(p.priority ?? 0),
          }))
      : undefined
    const pythonBatches = Array.isArray(scheduling?.result?.batches)
      ? (scheduling?.result?.batches as any[])
          .slice(0, 5)
          .map((batch: any) => ({
            id: String(batch.id ?? ''),
            size: Array.isArray(batch.orderIds) ? batch.orderIds.length : 0,
          }))
      : undefined
    const debugEntries = Array.isArray(scheduling?.result?.debug)
      ? (scheduling.result.debug as any[])
      : []
    const pythonDebug = debugEntries.slice(0, 10)
    const assignmentsEntry = debugEntries.find(
      (entry: any) => entry?.stage === 'PAP_ASSIGNMENTS' && Array.isArray(entry.sequence)
    )
    const pythonAssignments = assignmentsEntry
      ? (assignmentsEntry.sequence as any[])
          .slice(0, 10)
          .map((item: any) => ({
            orderId: String(item.orderId ?? ''),
            eta: typeof item.eta === 'number' ? Number(item.eta) : null,
            priorityScore:
              typeof item.priorityScore === 'number' ? Number(item.priorityScore) : null,
          }))
      : undefined

    const orderSequence = stageEntries.length
      ? stageEntries.map((entry: any) => String(entry.orderId)).slice(0, 10)
      : [String(firstEntry.orderId)]

    const reorderCount =
      stageEntries.length && stageEntries[0]?.orderId !== firstEntry.orderId ? 1 : 0

    let pythonDiffCount = reorderCount
    if (pythonReleaseList && pythonReleaseList.length > 0 && orderSequence.length > 0) {
      const compareLength = Math.min(orderSequence.length, pythonReleaseList.length)
      pythonDiffCount = 0
      for (let i = 0; i < compareLength; i += 1) {
        if (orderSequence[i] !== pythonReleaseList[i]) {
          pythonDiffCount += 1
        }
      }
      pythonDiffCount += Math.max(orderSequence.length, pythonReleaseList.length) - compareLength
    }

    const summary = {
      stage: queue,
      queueSize: stageEntries.length || 1,
      releasedCount: 1,
      reorderCount,
      batchCount: scheduling?.result?.batches?.length ?? 0,
      releaseListCount: pythonReleaseList?.length ?? 0,
      orderSequence,
      pythonReleaseList,
      pythonEtaList,
      pythonPriorities,
      pythonBatches,
      pythonAssignments,
      pythonDebug,
      pythonDiffCount,
      simMinute: currentSimMinute,
      timestamp: Date.now(),
    }

    try {
      await logSchedulingSummaryEntry(factoryId, queue, summary)
    } catch (error) {
      console.warn(`[SchedulingLog] Failed to log summary for ${queue}:`, error)
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

    // ✅ CRITICAL: Write Python-calculated ETA to Liefertermin table
    if (pythonEtaList && pythonEtaList.length > 0) {
      const etaForThisOrder = pythonEtaList.find((eta: any) => eta.orderId === nextEntry.orderId)
      if (etaForThisOrder && etaForThisOrder.eta > 0) {
        try {
          // Get active bundle info for debugging
          const queueConfig = await prisma.queueConfig.findUnique({
            where: { factoryId },
            include: { algorithmBundle: true }
          })

          const bundleName = queueConfig?.algorithmBundle?.name || 'unknown'
          const scriptPath = queue === 'preAcceptance'
            ? queueConfig?.algorithmBundle?.papScriptPath
            : queue === 'preInspection'
            ? queueConfig?.algorithmBundle?.pipScriptPath
            : queueConfig?.algorithmBundle?.pipoScriptPath

          const scriptName = scriptPath ? scriptPath.split('/').pop() : 'unknown'

          // Convert simulation minute to actual date
          const etaDate = new Date(Date.now() + etaForThisOrder.eta * 60 * 1000)

          // Mark old Liefertermine as not current
          await prisma.liefertermin.updateMany({
            where: {
              auftragId: nextEntry.orderId,
              istAktuell: true
            },
            data: {
              istAktuell: false
            }
          })

          // Create new Liefertermin from Python calculation
          await prisma.liefertermin.create({
            data: {
              auftragId: nextEntry.orderId,
              typ: `${queue}_python_eta`,
              datum: etaDate,
              istAktuell: true,
              bemerkung: `Calculated by Python script: ${scriptName} (Bundle: ${bundleName}) at queue: ${queue}`
            }
          })

          console.log(`[Python→DB] ✅ Liefertermin created for order ${nextEntry.orderId}:`, {
            queue,
            eta: etaForThisOrder.eta,
            etaDate: etaDate.toISOString(),
            scriptName,
            bundleName,
            pythonScriptExecuted: true
          })
        } catch (error) {
          console.error(`[Python→DB] ❌ Failed to create Liefertermin for order ${nextEntry.orderId}:`, error)
        }
      } else {
        console.warn(`[Python→DB] ⚠️  No ETA found for order ${nextEntry.orderId} in pythonEtaList`)
      }
    } else {
      console.warn(`[Python→DB] ⚠️  pythonEtaList is empty or undefined - Python script may have failed`)
    }

    revalidatePath('/simulation')

    return {
      success: true,
      released: true,
      scheduling,
      summary,
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

    // BATCH RELEASE TIME! Get all unreleased orders (including those on hold)
    let allEntries: any[]
    if (queue === 'preAcceptance') {
      allEntries = await prisma.preAcceptanceQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: { order: true }
      })
    } else if (queue === 'preInspection') {
      allEntries = await prisma.preInspectionQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: { order: true }
      })
    } else {
      allEntries = await prisma.postInspectionQueue.findMany({
        where: { releasedAtSimMinute: null },
        orderBy: [
          { processingOrder: 'asc' },
          { queuedAtSimMinute: 'asc' }
        ],
        include: { order: true }
      })
    }

    // Filter out orders that are on hold (hold not expired yet)
    // Also clear holds that have expired
    const entries: any[] = []
    const onHoldEntries: any[] = []
    const expiredHoldEntries: any[] = []

    for (const entry of allEntries) {
      if (entry.holdUntilSimMinute !== null && entry.holdUntilSimMinute !== undefined) {
        if (currentSimMinute < entry.holdUntilSimMinute) {
          // Hold is still active - skip this order
          onHoldEntries.push(entry)
          continue
        } else {
          // Hold has expired - clear it and include order for release
          expiredHoldEntries.push(entry)
          await clearQueueHold(queue, entry.orderId)
        }
      }
      // Order is not on hold (or hold just expired) - can be released
      entries.push(entry)
    }

    if (expiredHoldEntries.length > 0) {
      console.log(`🔓 [Hold] Cleared ${expiredHoldEntries.length} expired holds in ${queue} at t=${currentSimMinute}`)
    }

    if (onHoldEntries.length > 0) {
      const holdPreview = onHoldEntries.slice(0, 3).map(e => ({
        orderId: e.orderId,
        holdUntil: e.holdUntilSimMinute,
        reason: e.holdReason,
        waitMinutes: e.holdUntilSimMinute - currentSimMinute
      }))
      console.log(`🔒 [Hold] ${onHoldEntries.length} orders on hold in ${queue}`, holdPreview)
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

    console.log(`[Scheduling] checkAndReleaseBatch(${queue})`, {
      queue,
      entries: entries.length,
      releaseAfterMinutes,
      batchStartSimMinute,
      currentSimMinute,
    })
    let scheduling: any = null
    let orderedEntries = entries

    try {
      if (queue === 'preAcceptance') {
        scheduling = await runPapStage(factoryId, currentSimMinute)
      } else if (queue === 'preInspection') {
        scheduling = await runPipStage(factoryId)
      } else {
        scheduling = await runPipoStage(factoryId)
      }
    } catch (error) {
      console.error(`[Scheduling] Failed to run ${queue} stage:`, error)
      scheduling = null
    }

    if (scheduling?.orderedEntries?.length) {
      const stageEntries = scheduling.orderedEntries as any[]
      const lookup = new Map(entries.map((entry: any) => [entry.orderId, entry]))
      const mapped = stageEntries
        .map((entry: any) => lookup.get(entry.orderId) ?? entry)
        .filter(Boolean)
      if (mapped.length) {
        orderedEntries = mapped as any
      }
    }

    const ownOrderIds = entries.map((entry: any) => entry.orderId)
    const orderIds = orderedEntries.map((e: any) => e.orderId)
    const reorderCount = orderIds.reduce((acc: number, id: string, idx: number) => {
      return acc + (ownOrderIds[idx] !== id ? 1 : 0)
    }, 0)

    const pythonReleaseList =
      Array.isArray(scheduling?.result?.releaseList) && scheduling.result.releaseList.length
        ? (scheduling.result.releaseList as any[])
            .slice(0, 12)
            .map((orderId: any) => String(orderId))
        : undefined
    const pythonEtaList = Array.isArray(scheduling?.result?.etaList)
      ? (scheduling?.result?.etaList as any[])
          .slice(0, 8)
          .map((eta: any) => ({
            orderId: String(eta.orderId),
            eta: Number(eta.eta ?? 0),
          }))
      : undefined
    const pythonPriorities = Array.isArray(scheduling?.result?.priorities)
      ? (scheduling?.result?.priorities as any[])
          .slice(0, 8)
          .map((p: any) => ({
            orderId: String(p.orderId ?? ''),
            priority: Number(p.priority ?? 0),
          }))
      : undefined
    const pythonBatches = Array.isArray(scheduling?.result?.batches)
      ? (scheduling?.result?.batches as any[])
          .slice(0, 6)
          .map((batch: any) => ({
            id: String(batch.id ?? ''),
            size: Array.isArray(batch.orderIds) ? batch.orderIds.length : 0,
          }))
      : undefined
    const debugEntries = Array.isArray(scheduling?.result?.debug)
      ? (scheduling.result.debug as any[])
      : []
    const pythonDebug = debugEntries.slice(0, 12)
    const assignmentsEntry = debugEntries.find(
      (entry: any) => entry?.stage === 'PAP_ASSIGNMENTS' && Array.isArray(entry.sequence)
    )
    const pythonAssignments = assignmentsEntry
      ? (assignmentsEntry.sequence as any[])
          .slice(0, 12)
          .map((item: any) => ({
            orderId: String(item.orderId ?? ''),
            eta: typeof item.eta === 'number' ? Number(item.eta) : null,
            priorityScore:
              typeof item.priorityScore === 'number' ? Number(item.priorityScore) : null,
          }))
      : undefined

    const orderSequence = orderIds.map((id) => String(id)).slice(0, 20)

    let pythonDiffCount = reorderCount
    if (pythonReleaseList && pythonReleaseList.length > 0 && orderSequence.length > 0) {
      const compareLength = Math.min(orderSequence.length, pythonReleaseList.length)
      pythonDiffCount = 0
      for (let i = 0; i < compareLength; i += 1) {
        if (orderSequence[i] !== pythonReleaseList[i]) {
          pythonDiffCount += 1
        }
      }
      pythonDiffCount += Math.max(orderSequence.length, pythonReleaseList.length) - compareLength
    }

    const summary = {
      stage: queue,
      queueSize: entries.length,
      releasedCount: orderIds.length,
      reorderCount,
      batchCount: scheduling?.result?.batches?.length ?? 0,
      releaseListCount: pythonReleaseList?.length ?? 0,
      orderSequence,
      pythonReleaseList,
      pythonEtaList,
      pythonPriorities,
      pythonBatches,
      pythonAssignments,
      pythonDebug,
      pythonDiffCount,
      simMinute: currentSimMinute,
      timestamp: Date.now(),
    }

    console.log(`[Scheduling] ${queue} stage result:`, {
      stage: queue,
      batches: summary.batchCount,
      releaseList: summary.releaseListCount,
      orderedCount: Array.isArray(scheduling?.orderedEntries) ? scheduling.orderedEntries.length : undefined,
      reorderCount,
      orderIds,
      pythonDebugCount: summary.pythonDebug?.length ?? 0,
      pythonDiffCount,
    })

    try {
      await logSchedulingSummaryEntry(factoryId, queue, summary)
    } catch (error) {
      console.warn(`[SchedulingLog] Failed to log batch summary for ${queue}:`, error)
    }

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

    // ✅ CRITICAL: Write Python-calculated ETAs to Liefertermin table for ALL released orders
    if (pythonEtaList && pythonEtaList.length > 0) {
      try {
        // Get active bundle info for debugging
        const queueConfigWithBundle = await prisma.queueConfig.findUnique({
          where: { factoryId },
          include: { algorithmBundle: true }
        })

        const bundleName = queueConfigWithBundle?.algorithmBundle?.name || 'unknown'
        const scriptPath = queue === 'preAcceptance'
          ? queueConfigWithBundle?.algorithmBundle?.papScriptPath
          : queue === 'preInspection'
          ? queueConfigWithBundle?.algorithmBundle?.pipScriptPath
          : queueConfigWithBundle?.algorithmBundle?.pipoScriptPath

        const scriptName = scriptPath ? scriptPath.split('/').pop() : 'unknown'

        let etasCreated = 0
        let etasSkipped = 0

        // Create Liefertermine for all released orders that have ETAs
        for (const orderId of orderIds) {
          const etaForOrder = pythonEtaList.find((eta: any) => eta.orderId === orderId)
          if (etaForOrder && etaForOrder.eta > 0) {
            const etaDate = new Date(Date.now() + etaForOrder.eta * 60 * 1000)

            // Mark old Liefertermine as not current
            await prisma.liefertermin.updateMany({
              where: {
                auftragId: orderId,
                istAktuell: true
              },
              data: {
                istAktuell: false
              }
            })

            // Create new Liefertermin from Python calculation
            await prisma.liefertermin.create({
              data: {
                auftragId: orderId,
                typ: `${queue}_python_eta_batch`,
                datum: etaDate,
                istAktuell: true,
                bemerkung: `Calculated by Python script: ${scriptName} (Bundle: ${bundleName}) at queue: ${queue} [BATCH RELEASE]`
              }
            })

            etasCreated++
          } else {
            etasSkipped++
          }
        }

        console.log(`[Python→DB] ✅ Batch: Created ${etasCreated} Liefertermine (skipped ${etasSkipped}):`, {
          queue,
          scriptName,
          bundleName,
          totalOrders: orderIds.length,
          pythonScriptExecuted: true
        })
      } catch (error) {
        console.error(`[Python→DB] ❌ Failed to create Liefertermine for batch:`, error)
      }
    } else {
      console.warn(`[Python→DB] ⚠️  pythonEtaList is empty for batch release - Python script may have failed`)
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
      scheduling,
      summary,
      orderIds,
      orders: orderedEntries.map(e => e.order),
      count: orderIds.length,
      optimized: !!scheduling,
      // Hold information
      holdCount: onHoldEntries.length,
      holdPreview: onHoldEntries.slice(0, 5).map(e => ({
        orderId: e.orderId,
        holdUntilSimMinute: e.holdUntilSimMinute,
        holdReason: e.holdReason,
        waitMinutes: e.holdUntilSimMinute - currentSimMinute,
        timesHeld: e.holdCount ?? 0
      })),
      clearedHoldCount: expiredHoldEntries.length,
      maxHoldCount: onHoldEntries.length > 0 ? Math.max(...onHoldEntries.map((e: any) => e.holdCount ?? 0)) : 0,
      avgHoldCount: onHoldEntries.length > 0
        ? (onHoldEntries.reduce((sum: number, e: any) => sum + (e.holdCount ?? 0), 0) / onHoldEntries.length).toFixed(1)
        : 0
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

/**
 * Set a hold on an order in a specific queue
 * Prevents the order from being released until the hold expires
 *
 * @param queue - Queue type
 * @param orderId - Order ID to hold
 * @param holdUntilSimMinute - Simulation minute until which to hold the order
 * @param holdReason - Reason for the hold
 * @param currentSimMinute - Current simulation minute
 */
export async function setQueueHold(
  queue: QueueType,
  orderId: string,
  holdUntilSimMinute: number,
  holdReason: string,
  currentSimMinute: number
) {
  try {
    await ensureDatabaseInitialized()

    const updateData = {
      holdUntilSimMinute,
      holdReason,
      holdSetAtSimMinute: currentSimMinute,
      holdCount: {
        increment: 1
      }
    }

    if (queue === 'preAcceptance') {
      await prisma.preAcceptanceQueue.update({
        where: { orderId },
        data: updateData
      })
    } else if (queue === 'preInspection') {
      await prisma.preInspectionQueue.update({
        where: { orderId },
        data: updateData
      })
    } else {
      await prisma.postInspectionQueue.update({
        where: { orderId },
        data: updateData
      })
    }

    console.log(`🔒 [Hold] Set hold on order ${orderId} in ${queue} until t=${holdUntilSimMinute}: ${holdReason}`)

    return {
      success: true,
      orderId,
      holdUntilSimMinute,
      holdReason
    }
  } catch (error) {
    console.error(`Error setting hold on order ${orderId}:`, error)
    return {
      success: false,
      error: 'Failed to set hold on order'
    }
  }
}

/**
 * Clear a hold on an order in a specific queue
 * Allows the order to be released normally
 *
 * @param queue - Queue type
 * @param orderId - Order ID to clear hold from
 */
export async function clearQueueHold(
  queue: QueueType,
  orderId: string
) {
  try {
    await ensureDatabaseInitialized()

    const updateData = {
      holdUntilSimMinute: null,
      holdReason: null,
      holdSetAtSimMinute: null
    }

    if (queue === 'preAcceptance') {
      await prisma.preAcceptanceQueue.update({
        where: { orderId },
        data: updateData
      })
    } else if (queue === 'preInspection') {
      await prisma.preInspectionQueue.update({
        where: { orderId },
        data: updateData
      })
    } else {
      await prisma.postInspectionQueue.update({
        where: { orderId },
        data: updateData
      })
    }

    console.log(`🔓 [Hold] Cleared hold on order ${orderId} in ${queue}`)

    return {
      success: true,
      orderId
    }
  } catch (error) {
    console.error(`Error clearing hold on order ${orderId}:`, error)
    return {
      success: false,
      error: 'Failed to clear hold on order'
    }
  }
}

/**
 * Set multiple holds at once (bulk operation)
 * Used by Python schedulers to set holds on multiple orders
 *
 * @param queue - Queue type
 * @param holds - Array of hold decisions
 * @param currentSimMinute - Current simulation minute
 */
export async function setMultipleQueueHolds(
  queue: QueueType,
  holds: Array<{
    orderId: string
    holdUntilSimMinute: number
    holdReason: string
  }>,
  currentSimMinute: number
) {
  try {
    await ensureDatabaseInitialized()

    const results = await Promise.all(
      holds.map(hold =>
        setQueueHold(
          queue,
          hold.orderId,
          hold.holdUntilSimMinute,
          hold.holdReason,
          currentSimMinute
        )
      )
    )

    const successCount = results.filter(r => r.success).length

    console.log(`🔒 [Hold] Set ${successCount}/${holds.length} holds in ${queue}`)

    return {
      success: true,
      totalHolds: holds.length,
      successfulHolds: successCount
    }
  } catch (error) {
    console.error(`Error setting multiple holds:`, error)
    return {
      success: false,
      error: 'Failed to set multiple holds'
    }
  }
}
