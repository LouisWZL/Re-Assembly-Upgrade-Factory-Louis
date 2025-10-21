'use server'

import { prisma } from '@/lib/prisma'
import type { SchedulingStage } from '@prisma/client'
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
    liefertermine?: Array<{ datum: Date | null; istAktuell: boolean }>
    produktvariante?: {
      produktId: string
      produkt?: { name?: string; gruppe?: string }
    }
  }
}

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

function toPoolRecord(entry: QueueEntryWithOrder): PoolRecord {
  const processTimes = entry.processTimes ?? {}
  return {
    oid: entry.orderId,
    demOps: buildOperations(processTimes, 'dem'),
    monOps: buildOperations(processTimes, 'mon'),
    processSequences:
      entry.order.processSequences && Array.isArray(entry.order.processSequences)
        ? (entry.order.processSequences as any)
        : undefined,
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

  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    mode,
    meta: mergedMeta,
  } satisfies SchedulingConfig
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

function orderEntriesByList<T extends QueueEntryWithOrder>(entries: T[], desiredOrder: string[]): T[] {
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
  orderedEntries: QueueEntryWithOrder[]
) {
  if (!orderedEntries.length) return
  const client =
    table === 'preInspection' ? prisma.preInspectionQueue : prisma.postInspectionQueue

  await prisma.$transaction(
    orderedEntries.map((entry, idx) =>
      client.update({
        where: { orderId: entry.orderId },
        data: { processingOrder: idx + 1 },
      })
    )
  )
}

export async function runPapStage(factoryId: string) {
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

  const config = await buildConfig(factoryId, 'INTEGRATED')
  const nowMinutes = Date.now() / 60_000
  const pools = new Pools(config)
  entries.forEach((entry) => pools.upsertPAP(toPoolRecord(entry as QueueEntryWithOrder)))

  const result = await runPAPForecastAndBatch(pools, nowMinutes, config)
  await logStage(factoryId, 'PAP', config.mode, {
    ...result,
    queueSize: entries.length,
  })

  let ordered = entries
  const flattened = result?.batches?.flatMap((batch) => batch.orderIds) ?? []
  if (flattened.length) {
    ordered = orderEntriesByList(entries as QueueEntryWithOrder[], flattened)
  }

  const orderUpdates = new Map<string, Record<string, any>>()
  ;(ordered as QueueEntryWithOrder[]).forEach((entry, index) => {
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

  const config = await buildConfig(factoryId, 'INTEGRATED')
  const nowMinutes = Date.now() / 60_000
  const pools = new Pools(config)
  entries.forEach((entry) => pools.moveToPIP(entry.orderId, toPoolRecord(entry as QueueEntryWithOrder)))

  const factoryEnv: FactoryEnv = {
    factoryId,
    simTime: nowMinutes,
    config,
    pools,
  }

  const result = await runPIPIntegrated(pools, factoryEnv, config)
  await logStage(factoryId, 'PIP', config.mode, {
    ...result,
    queueSize: entries.length,
  })

  let ordered = entries
  if (result?.releaseList?.length) {
    ordered = orderEntriesByList(entries as QueueEntryWithOrder[], result.releaseList)
    await updateProcessingOrder('preInspection', ordered as QueueEntryWithOrder[])
  }

  const dispatcherSequence =
    result?.releaseList?.length
      ? result.releaseList
      : (ordered as QueueEntryWithOrder[]).map((entry) => entry.orderId)
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

  const config = await buildConfig(factoryId, 'INTEGRATED')
  const nowMinutes = Date.now() / 60_000
  const pools = new Pools(config)
  entries.forEach((entry) => pools.moveToPIPo(entry.orderId, toPoolRecord(entry as QueueEntryWithOrder)))

  const factoryEnv: FactoryEnv = {
    factoryId,
    simTime: nowMinutes,
    config,
    pools,
  }

  const result = await runPIPoFineTermMOAHS(pools, factoryEnv, config)
  await logStage(factoryId, 'PIPO', config.mode, {
    ...result,
    queueSize: entries.length,
  })

  if (result?.releasedOps?.length) {
    await updateProcessingOrder('postInspection', entries as QueueEntryWithOrder[])
  }

  const orderUpdates = new Map<string, Record<string, any>>()
  ;(entries as QueueEntryWithOrder[]).forEach((entry, index) => {
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
