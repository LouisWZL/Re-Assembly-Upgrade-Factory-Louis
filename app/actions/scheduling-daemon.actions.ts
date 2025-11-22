'use server'

import { prisma } from '@/lib/prisma'
import type { SchedulingStage, Prisma } from '@prisma/client'
import { ensureDatabaseInitialized } from '@/lib/db-config'
import { Pools } from '@/lib/scheduling/pools'
import type {
  FactoryEnv,
  PoolRecord,
  SchedulingConfig,
} from '@/lib/scheduling/types'
import {
  runPAPForecastAndBatch,
  runPIPIntegrated,
  runPIPoFineTermMOAHS,
} from '@/lib/scheduling/operators'
import { setMultipleQueueHolds, type QueueType } from './queue.actions'

type QueueEntryWithOrder = {
  id: string
  orderId: string
  possibleSequence?: unknown
  processTimes?: unknown
  queuedAtSimMinute: number
  releaseAfterMinutes: number
  order: {
    id: string
    factoryId: string
    createdAt: Date
    updatedAt: Date
    phase: string
    terminierung: unknown
    processSequences?: unknown
    liefertermine: Array<{
      id: string
      createdAt: Date
      updatedAt: Date
      auftragId: string
      typ: string
      datum: Date
      istAktuell: boolean
      bemerkung: string | null
    }>
    produktvariante: any
  } & Record<string, any>
} & Record<string, any>

const DEFAULT_CONFIG: SchedulingConfig = {
  mode: 'INTEGRATED',
  schedIntervalMinutes: 30,
  batchPolicy: {
    qMin: 3,
    qMax: 7,
    horizonMinutes: 240,
  },
  tardinessWeight: 1,
  varianceWeight: 0.1,
  cvarAlpha: 0.9,
  meta: {
    poissonLambda: 4,
  },
}

function extractDueDate(order: QueueEntryWithOrder['order']): number | undefined {
  const terminierung = Array.isArray(order.terminierung) ? order.terminierung : []
  if (terminierung.length > 0) {
    const last = terminierung[terminierung.length - 1]
    if (last && typeof last === 'object' && 'datum' in last) {
      const datum = (last as any).datum
      if (typeof datum === 'string') {
        return new Date(datum).getTime()
      }
      if (datum?.von) {
        return new Date(datum.von).getTime()
      }
    }
  }
  const liefertermine = order.liefertermine ?? []
  const active = liefertermine.find((entry) => entry.istAktuell && entry.datum)
  if (active?.datum) {
    return active.datum.getTime()
  }
  return undefined
}

function buildOperations(processTimes: any, prefix: 'dem' | 'mon'): PoolRecord['demOps'] {
  if (!processTimes || typeof processTimes !== 'object') {
    return []
  }
  const value =
    processTimes[prefix === 'dem' ? 'demontage' : 'montage'] ??
    processTimes[prefix === 'dem' ? 'dem' : 'mon']
  if (!value) {
    return []
  }
  const duration = Number(value) || 60
  return [
    {
      id: `${prefix}-op`,
      stationId: prefix === 'dem' ? 'demontage' : 'reassembly',
      expectedDuration: duration,
    },
  ]
}

function normalizeProcessSequences(value: unknown): unknown {
  if (!value) return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (typeof value === 'object') {
    return value as any
  }
  return undefined
}

interface PapBatchInsight {
  id: string
  size: number
  releaseAt: number | null
  orderSequences: Array<{ orderId: string; sequence: string[] }>
  jaccardMatrix: number[][]
  jaccardLabels: string[]
  jaccardJustifications: Array<{ orderId: string; sequence: string[] }>
  jaccardSimilarity: number
}

function buildPapBatchInsights(
  batches: any[] | undefined,
  entries: Array<{ orderId: string; order: { processSequences?: unknown } }>
): PapBatchInsight[] {
  if (!Array.isArray(batches) || batches.length === 0) {
    return []
  }

  const entryMap = new Map(entries.map((entry) => [entry.orderId, entry]))
  const seqSetMap = new Map<string, Set<string>>()
  entries.forEach((entry) => {
    seqSetMap.set(entry.orderId, extractSequenceSet(entry.order.processSequences))
  })

  return batches.map((batch) => {
    const orderIds: string[] = Array.isArray(batch?.orderIds) ? batch.orderIds : []
    const orderSequences = orderIds.map((orderId) => ({
      orderId,
      sequence: Array.from(seqSetMap.get(orderId) ?? []),
    }))
    const sets = orderIds.map((orderId) => seqSetMap.get(orderId) ?? new Set<string>())
    const matrix = sets.map((rowSet) => sets.map((colSet) => computeJaccard(rowSet, colSet)))

    let similaritySum = 0
    let pairCount = 0
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        similaritySum += matrix[i][j]
        pairCount += 1
      }
    }
    const avgSimilarity = pairCount > 0 ? similaritySum / pairCount : 0

    return {
      id: String(batch?.id ?? ''),
      size: orderIds.length,
      releaseAt:
        typeof batch?.releaseAt === 'number'
          ? Number(batch.releaseAt)
          : batch?.windowStart?.earliest ?? null,
      jaccardLabels: orderIds,
      jaccardJustifications: orderSequences.map((seqSeq) => ({
        orderId: seqSeq.orderId,
        sequence: seqSeq.sequence,
      })),
      orderSequences,
      jaccardMatrix: matrix,
      jaccardSimilarity: avgSimilarity,
    }
  })
}

function toPoolRecord(entry: QueueEntryWithOrder | any): PoolRecord {
  const processTimes = entry.processTimes ?? {}
  return {
    oid: entry.orderId,
    demOps: buildOperations(processTimes, 'dem'),
    monOps: buildOperations(processTimes, 'mon'),
    processSequences: normalizeProcessSequences(entry.order.processSequences),
    meta: {
      createdAt: entry.order.createdAt.getTime(),
      dueDate: extractDueDate(entry.order),
      queuedAt: entry.queuedAtSimMinute,
      productGroup: entry.order.produktvariante?.produkt?.gruppe,
      productVariant: entry.order.produktvariante?.produktId,
    },
  }
}

async function buildConfig(factoryId: string, mode: SchedulingConfig['mode'], overrides?: Partial<SchedulingConfig>) {
  const [factory, queueConfig] = await Promise.all([
    prisma.reassemblyFactory.findUnique({ where: { id: factoryId } }),
    prisma.queueConfig.findUnique({
      where: { factoryId },
      include: { algorithmBundle: true }
    }),
  ])

  if (!factory) {
    throw new Error(`Factory ${factoryId} not found`)
  }

  const mergedMeta = {
    ...DEFAULT_CONFIG.meta,
    ...(overrides?.meta ?? {}),
    papScriptPath: queueConfig?.algorithmBundle?.papScriptPath ?? queueConfig?.preAcceptancePythonScript ?? overrides?.meta?.papScriptPath,
    pipScriptPath: queueConfig?.algorithmBundle?.pipScriptPath ?? queueConfig?.preInspectionPythonScript ?? overrides?.meta?.pipScriptPath,
    pipoScriptPath: queueConfig?.algorithmBundle?.pipoScriptPath ?? queueConfig?.postInspectionPythonScript ?? overrides?.meta?.pipoScriptPath,
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...overrides,
    mode,
    meta: mergedMeta,
  } satisfies SchedulingConfig

  return { config, factory }
}

async function logStage(factoryId: string, stage: 'PAP' | 'PIP' | 'PIPO', mode: string, details: unknown) {
  try {
    await prisma.schedulingLog.create({
      data: {
        factoryId,
        stage,
        mode,
        details: details as any,
      },
    })
  } catch (error) {
    console.warn(`[SchedulingLog] Failed to persist ${stage} entry:`, error)
  }
}

function orderEntriesByList<T extends { orderId: string }>(entries: T[], desiredOrder: string[]): T[] {
  if (!desiredOrder || desiredOrder.length === 0) {
    return entries
  }
  const orderIndex = new Map(desiredOrder.map((id, idx) => [id, idx]))
  return [...entries].sort((a, b) => {
    const idxA = orderIndex.has(a.orderId) ? orderIndex.get(a.orderId)! : Number.MAX_SAFE_INTEGER
    const idxB = orderIndex.has(b.orderId) ? orderIndex.get(b.orderId)! : Number.MAX_SAFE_INTEGER
    return idxA - idxB
  })
}

async function updateProcessingOrder(
  table: 'preInspection' | 'postInspection',
  orderedEntries: Array<{ orderId: string }>
) {
  if (!orderedEntries.length) return
  if (table === 'preInspection') {
    await prisma.$transaction(
      orderedEntries.map((entry, idx) =>
        prisma.preInspectionQueue.update({
          where: { orderId: entry.orderId },
          data: { processingOrder: idx + 1 },
        })
      )
    )
  } else {
    await prisma.$transaction(
      orderedEntries.map((entry, idx) =>
        prisma.postInspectionQueue.update({
          where: { orderId: entry.orderId },
          data: { processingOrder: idx + 1 },
        })
      )
    )
  }
}

export async function runPapStage(factoryId: string, simMinute?: number) {
  await ensureDatabaseInitialized()

  const entries = await prisma.preAcceptanceQueue.findMany({
    where: { releasedAtSimMinute: null },
    include: {
      order: {
        include: {
          liefertermine: true,
          produktvariante: {
            include: { produkt: true },
          },
        },
      },
    },
  })

  if (entries.length === 0) {
    return { result: null, orderedEntries: entries }
  }

  const { config, factory } = await buildConfig(factoryId, 'INTEGRATED')
  const nowMinutes =
    typeof simMinute === 'number' && Number.isFinite(simMinute)
      ? simMinute
      : Date.now() / 60_000
  const pools = new Pools(config)
  entries.forEach((entry) => pools.upsertPAP(toPoolRecord(entry)))

  const result = await runPAPForecastAndBatch(pools, nowMinutes, config, factory)

  const batchInsights = buildPapBatchInsights(
    result?.batches,
    entries.map((entry) => ({
      orderId: entry.orderId,
      order: { processSequences: entry.order.processSequences },
    }))
  )
  if (result) {
    ;(result as any).batchSizes = Array.isArray(result.batches)
      ? result.batches.map((batch: any) => (Array.isArray(batch?.orderIds) ? batch.orderIds.length : 0))
      : []
    ;(result as any).topBatches = batchInsights.slice(0, 5)
  }
  await logStage(factoryId, 'PAP', config.mode, {
    ...result,
    queueSize: entries.length,
  })

  let ordered = entries
  const flattened = result?.batches?.flatMap((batch) => batch.orderIds) ?? []
  if (flattened.length) {
    ordered = orderEntriesByList(entries, flattened)
  }

  const orderUpdates = new Map<string, Record<string, any>>()
  ordered.forEach((entry, index) => {
    orderUpdates.set(entry.orderId, {
      ...(orderUpdates.get(entry.orderId) ?? {}),
      dispatcherOrderPreAcceptance: index + 1,
      finalCompletionSimMinute: null,
    })
  })
  result?.etaList?.forEach((eta) => {
    if (!eta?.orderId || typeof eta.eta !== 'number') return
    orderUpdates.set(eta.orderId, {
      ...(orderUpdates.get(eta.orderId) ?? {}),
      plannedDeliverySimMinute: eta.eta,
    })
  })
  if (orderUpdates.size > 0) {
    let dispatcherCount = 0
    let etaCount = 0
    orderUpdates.forEach((payload) => {
      if (Object.prototype.hasOwnProperty.call(payload, 'dispatcherOrderPreAcceptance')) {
        dispatcherCount += 1
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'plannedDeliverySimMinute')) {
        etaCount += 1
      }
    })
    await prisma.$transaction(
      Array.from(orderUpdates.entries()).map(([orderId, data]) =>
        prisma.auftrag.update({
          where: { id: orderId },
          data,
        })
      )
    )
    if (result) {
      const debugEntry = {
        stage: 'PAP_DB_UPDATE',
        updatedOrders: orderUpdates.size,
        dispatcherOrderAssignments: dispatcherCount,
        etaAssignments: etaCount,
        orderIds: Array.from(orderUpdates.keys()),
      }
      if (Array.isArray(result.debug)) {
        result.debug.push(debugEntry)
      } else {
        result.debug = [debugEntry]
      }
    }
  }

  return { result, orderedEntries: ordered }
}

export async function runPipStage(factoryId: string) {
  await ensureDatabaseInitialized()

  const entries = await prisma.preInspectionQueue.findMany({
    where: { releasedAtSimMinute: null },
    include: {
      order: {
        include: {
          liefertermine: true,
          produktvariante: {
            include: { produkt: true },
          },
        },
      },
    },
  })

  if (entries.length === 0) {
    return { result: null, orderedEntries: entries }
  }

  const { config, factory } = await buildConfig(factoryId, 'INTEGRATED')
  const nowMinutes = Date.now() / 60_000
  const pools = new Pools(config)
  entries.forEach((entry) => pools.moveToPIP(entry.orderId, toPoolRecord(entry)))

  const factoryEnv: FactoryEnv = {
    factoryId,
    simTime: nowMinutes,
    config,
    pools,
  }

  const result = await runPIPIntegrated(pools, factoryEnv, config, factory)
  await logStage(factoryId, 'PIP', config.mode, {
    ...result,
    queueSize: entries.length,
  })

  let ordered = entries
  if (result?.releaseList?.length) {
    ordered = orderEntriesByList(entries, result.releaseList)
    await updateProcessingOrder('preInspection', ordered)
  }

  const dispatcherSequence =
    result?.releaseList?.length
      ? result.releaseList
      : ordered.map((entry) => entry.orderId)
  if (dispatcherSequence.length) {
    const updates = new Map<string, number>()
    dispatcherSequence.forEach((orderId, index) => {
      updates.set(orderId, index + 1)
    })
    if (updates.size > 0) {
      await prisma.$transaction(
        Array.from(updates.entries()).map(([orderId, sequence]) =>
          prisma.auftrag.update({
            where: { id: orderId },
            data: { dispatcherOrderPreInspection: sequence },
          })
        )
      )
      if (result) {
        const debugEntry = {
          stage: 'PIP_DB_UPDATE',
          updatedOrders: updates.size,
          dispatcherOrderAssignments: updates.size,
          orderIds: Array.from(updates.keys()),
        }
        if (Array.isArray(result.debug)) {
          result.debug.push(debugEntry)
        } else {
          result.debug = [debugEntry]
        }
      }
    }
  }

  return { result, orderedEntries: ordered }
}

export async function runPipoStage(factoryId: string) {
  await ensureDatabaseInitialized()

  const entries = await prisma.postInspectionQueue.findMany({
    where: { releasedAtSimMinute: null },
    include: {
      order: {
        include: {
          liefertermine: true,
          produktvariante: {
            include: { produkt: true },
          },
        },
      },
    },
  })

  if (entries.length === 0) {
    return { result: null, orderedEntries: entries }
  }

  const { config, factory } = await buildConfig(factoryId, 'INTEGRATED')
  const nowMinutes = Date.now() / 60_000
  const pools = new Pools(config)
  entries.forEach((entry) => pools.moveToPIPo(entry.orderId, toPoolRecord(entry)))

  const factoryEnv: FactoryEnv = {
    factoryId,
    simTime: nowMinutes,
    config,
    pools,
  }

  const result = await runPIPoFineTermMOAHS(pools, factoryEnv, config, factory)
  await logStage(factoryId, 'PIPO', config.mode, {
    ...result,
    queueSize: entries.length,
  })

  if (result?.releasedOps?.length) {
    await updateProcessingOrder('postInspection', entries)
  }

  const orderUpdates = new Map<string, Record<string, any>>()
  entries.forEach((entry, index) => {
    orderUpdates.set(entry.orderId, {
      ...(orderUpdates.get(entry.orderId) ?? {}),
      dispatcherOrderPostInspection: index + 1,
    })
  })
  if (result?.selectedPlanId && Array.isArray(result?.paretoSet)) {
    const selectedPlan = result.paretoSet.find((plan) => plan.id === result.selectedPlanId)
    selectedPlan?.operations?.forEach((op) => {
      if (!op?.orderId) return
      // Note: finalCompletionSimMinute should only be set when order completes quality-shipping
      // (in RealDataFactorySimulation.tsx), not during PIPO scheduling
    })
  }
  if (orderUpdates.size > 0) {
    let dispatcherCount = 0
    let completionCount = 0
    orderUpdates.forEach((payload) => {
      if (Object.prototype.hasOwnProperty.call(payload, 'dispatcherOrderPostInspection')) {
        dispatcherCount += 1
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'finalCompletionSimMinute')) {
        completionCount += 1
      }
    })
    await prisma.$transaction(
      Array.from(orderUpdates.entries()).map(([orderId, data]) =>
        prisma.auftrag.update({
          where: { id: orderId },
          data,
        })
      )
    )
    if (result) {
      const debugEntry = {
        stage: 'PIPO_DB_UPDATE',
        updatedOrders: orderUpdates.size,
        dispatcherOrderAssignments: dispatcherCount,
        finalCompletionAssignments: completionCount,
        orderIds: Array.from(orderUpdates.keys()),
      }
      if (Array.isArray(result.debug)) {
        result.debug.push(debugEntry)
      } else {
        result.debug = [debugEntry]
      }
    }
  }

  return { result, orderedEntries: entries }
}

type QueueStageName = 'preAcceptance' | 'preInspection' | 'postInspection'
const queueStageToEnum: Record<QueueStageName, SchedulingStage> = {
  preAcceptance: 'PAP',
  preInspection: 'PIP',
  postInspection: 'PIPO',
}

export async function logSchedulingSummaryEntry(
  factoryId: string,
  queue: QueueStageName,
  summary: Record<string, any>
) {
  try {
    const stage = queueStageToEnum[queue]
    await prisma.schedulingLog.create({
      data: {
        factoryId,
        stage,
        mode: 'SUMMARY',
        details: summary as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    console.warn(`[SchedulingLog] Failed to persist summary for ${queue}:`, error)
  }
}

/**
 * Process hold decisions from Python scheduling results
 *
 * Python scripts can return a `holdDecisions` array in their output:
 * {
 *   holdDecisions: [
 *     { orderId: "xyz", holdUntilSimMinute: 1500, holdReason: "Capacity conflict" }
 *   ]
 * }
 *
 * This function extracts these decisions and applies them to the queue.
 *
 * @param result - Python script result object
 * @param queue - Queue type
 * @param currentSimMinute - Current simulation minute
 * @returns Number of holds set
 */
export async function processHoldDecisions(
  result: any,
  queue: QueueType,
  currentSimMinute: number
): Promise<number> {
  if (!result || !Array.isArray(result.holdDecisions) || result.holdDecisions.length === 0) {
    return 0
  }

  const holdDecisions = result.holdDecisions as Array<{
    orderId: string
    holdUntilSimMinute: number
    holdReason: string
  }>

  // Validate and filter hold decisions
  const validHolds = holdDecisions.filter(h =>
    h.orderId &&
    typeof h.holdUntilSimMinute === 'number' &&
    h.holdUntilSimMinute > currentSimMinute &&
    h.holdReason
  )

  if (validHolds.length === 0) {
    return 0
  }

  try {
    const holdResult = await setMultipleQueueHolds(queue, validHolds, currentSimMinute)

    if (holdResult.success) {
      console.log(
        `🔒 [Python→Hold] Applied ${holdResult.successfulHolds}/${validHolds.length} hold decisions from Python in ${queue}`
      )
      return holdResult.successfulHolds || 0
    } else {
      console.error(`[Python→Hold] Failed to apply hold decisions:`, holdResult.error)
      return 0
    }
  } catch (error) {
    console.error(`[Python→Hold] Error processing hold decisions:`, error)
    return 0
  }
}
const SEQUENCE_STOP_TOKENS = new Set(['I', '×', 'Q'])

function normalizeSequenceStep(step: unknown): string | null {
  if (typeof step !== 'string') {
    if (step === null || step === undefined) return null
    step = String(step)
  }
  const cleaned = (step as string).replace(/^(BG|BGT)-/i, '').trim()
  if (!cleaned || SEQUENCE_STOP_TOKENS.has(cleaned)) {
    return null
  }
  return cleaned
}

function extractSequenceSet(processSequences: unknown): Set<string> {
  const seqSet = new Set<string>()
  const value = normalizeProcessSequences(processSequences)
  if (!value || typeof value !== 'object') {
    return seqSet
  }

  const tryAddFromBlock = (block: any) => {
    if (!block || typeof block !== 'object') return
    const sequences: Array<{ steps?: unknown[] }> = Array.isArray(block.sequences)
      ? block.sequences
      : []
    sequences.forEach((seq) => {
      const steps: unknown[] = Array.isArray(seq?.steps) ? seq.steps : []
      steps.forEach((step) => {
        const normalized = normalizeSequenceStep(step)
        if (normalized) {
          seqSet.add(normalized)
        }
      })
    })
  }

  tryAddFromBlock((value as any).baugruppen)
  tryAddFromBlock((value as any).baugruppentypen)

  return seqSet
}

function computeJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0
  }
  const intersection = new Set([...a].filter((value) => b.has(value)))
  const unionSize = new Set([...a, ...b]).size
  if (unionSize === 0) {
    return 0
  }
  return intersection.size / unionSize
}
