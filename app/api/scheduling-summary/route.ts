import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type SchedulingStageKey = 'pap' | 'pip' | 'pipo'

const stageEnumToKey: Record<'PAP' | 'PIP' | 'PIPO', SchedulingStageKey> = {
  PAP: 'pap',
  PIP: 'pip',
  PIPO: 'pipo',
}

type StageStats = {
  runs: number
  lastRun: number | null
  lastReleased: number
  totalReleased: number
  lastReorder: number
  totalReorder: number
  lastQueueSize: number
  lastBatches: number
  lastPythonDiff: number
  totalPythonDiff: number
}

const createInitialStats = (): Record<SchedulingStageKey, StageStats> => ({
  pap: {
    runs: 0,
    lastRun: null,
    lastReleased: 0,
    totalReleased: 0,
    lastReorder: 0,
    totalReorder: 0,
    lastQueueSize: 0,
    lastBatches: 0,
    lastPythonDiff: 0,
    totalPythonDiff: 0,
  },
  pip: {
    runs: 0,
    lastRun: null,
    lastReleased: 0,
    totalReleased: 0,
    lastReorder: 0,
    totalReorder: 0,
    lastQueueSize: 0,
    lastBatches: 0,
    lastPythonDiff: 0,
    totalPythonDiff: 0,
  },
  pipo: {
    runs: 0,
    lastRun: null,
    lastReleased: 0,
    totalReleased: 0,
    lastReorder: 0,
    totalReorder: 0,
    lastQueueSize: 0,
    lastBatches: 0,
    lastPythonDiff: 0,
    totalPythonDiff: 0,
  },
})

type StageBatchHistoryEntry = {
  createdAt: string
  simMinute: number | null
  batchSizes: number[]
  etaWindow?: { min: number | null; max: number | null } | null
  topBatches?: Array<Record<string, any>>
}

const BATCH_HISTORY_LIMIT = 40

const createEmptyBatchHistory = (): Record<SchedulingStageKey, StageBatchHistoryEntry[]> => ({
  pap: [],
  pip: [],
  pipo: [],
})

const summarizePapResult = async (details: any) => {
  const batches = Array.isArray(details?.batches) ? details.batches : []
  const etaList = Array.isArray(details?.etaList) ? details.etaList : []
  const avgBatchSize =
    batches.length > 0
      ? batches.reduce((sum: number, batch: any) => sum + (batch.orderIds?.length || 0), 0) /
        batches.length
      : 0
  const avgEta =
    etaList.length > 0
      ? etaList.reduce((sum: number, eta: any) => sum + (Number(eta.eta) || 0), 0) / etaList.length
      : 0

  // Calculate batch time windows and ETA ranges
  const batchSizes = batches.map((b: any) => Array.isArray(b.orderIds) ? b.orderIds.length : 0)
  const etaTimes = etaList.map((e: any) => Number(e.eta ?? 0)).filter((t: number) => t > 0)
  const minEta = etaTimes.length > 0 ? Math.min(...etaTimes) : null
  const maxEta = etaTimes.length > 0 ? Math.max(...etaTimes) : null

  // Load order details with component information for batches
  const topBatchesWithDetails = await Promise.all(
    batches.slice(0, 5).map(async (batch: any) => {
      const orderIds = Array.isArray(batch.orderIds) ? batch.orderIds.map((id: any) => String(id)) : []

      // Load orders with their component instances
      const orders = await prisma.auftrag.findMany({
        where: { id: { in: orderIds } },
        include: {
          baugruppenInstances: {
            include: {
              baugruppe: { select: { bezeichnung: true, variantenTyp: true } },
              austauschBaugruppe: { select: { bezeichnung: true, variantenTyp: true } }
            }
          },
          produktvariante: {
            select: { bezeichnung: true, typ: true }
          }
        },
        take: 20 // Limit to avoid overloading
      })

      return {
        id: String(batch.id ?? ''),
        size: orderIds.length,
        releaseAt: typeof batch.releaseAt === 'number' ? batch.releaseAt : null,
        windowStart: batch.windowStart ?? null,
        windowEnd: batch.windowEnd ?? null,
        jaccardSimilarity: typeof batch.jaccardSimilarity === 'number' ? batch.jaccardSimilarity : null,
        sampleOrders: orderIds.slice(0, 5),
        orderDetails: orders.map(order => ({
          orderId: order.id,
          productVariant: order.produktvariante.bezeichnung,
          productType: order.produktvariante.typ,
          components: order.baugruppenInstances.map(instance => ({
            original: instance.baugruppe.bezeichnung,
            originalType: instance.baugruppe.variantenTyp,
            replacement: instance.austauschBaugruppe?.bezeichnung ?? null,
            replacementType: instance.austauschBaugruppe?.variantenTyp ?? null,
            reassemblyType: instance.reAssemblyTyp,
            condition: instance.zustand
          }))
        }))
      }
    })
  )

  const pythonTopBatches = Array.isArray(details?.topBatches) ? details.topBatches : null
  const fallbackDetailsMap = new Map(
    topBatchesWithDetails.map((batch) => [batch.id, batch])
  )
  const mergedTopBatches = pythonTopBatches && pythonTopBatches.length > 0
    ? pythonTopBatches.map((batch: any) => {
        const fallback = fallbackDetailsMap.get(String(batch.id ?? ''))
        return {
          ...batch,
          orderDetails: batch.orderDetails ?? fallback?.orderDetails,
          sampleOrders: batch.sampleOrders ?? fallback?.sampleOrders ?? fallback?.orderDetails?.map((o: any) => o.orderId).slice(0, 5),
          releaseAt:
            typeof batch.releaseAt === 'number'
              ? batch.releaseAt
              : fallback?.releaseAt ?? null,
          windowStart: batch.windowStart ?? fallback?.windowStart ?? null,
          windowEnd: batch.windowEnd ?? fallback?.windowEnd ?? null,
        }
      })
    : topBatchesWithDetails

  return {
    batchCount: batches.length,
    averageBatchSize: Number.isFinite(avgBatchSize) ? Number(avgBatchSize.toFixed(2)) : 0,
    etaCount: etaList.length,
    averageEtaMinutes: Number.isFinite(avgEta) ? Number(avgEta.toFixed(1)) : 0,
    batchSizes,
    etaWindow: minEta !== null && maxEta !== null ? { min: minEta, max: maxEta } : null,
    topBatches: mergedTopBatches,
    etaPreview: etaList.slice(0, 6).map((eta: any) => ({
      orderId: String(eta.orderId ?? ''),
      eta: Number(eta.eta ?? 0),
      lower: Number(eta.lower ?? 0),
      upper: Number(eta.upper ?? 0),
      confidence: eta.confidence ?? null,
    })),
    _scriptExecution: details?._scriptExecution ?? null,
  }
}

const summarizePipResult = async (details: any) => {
  const priorities = Array.isArray(details?.priorities) ? details.priorities : []
  const batches = Array.isArray(details?.batches) ? details.batches : []
  const releaseList = Array.isArray(details?.releaseList) ? details.releaseList : []

  // Load order details with component information for batches
  const topBatchesWithDetails = await Promise.all(
    batches.slice(0, 5).map(async (batch: any) => {
      const orderIds = Array.isArray(batch.orderIds) ? batch.orderIds.map((id: any) => String(id)) : []

      const orders = await prisma.auftrag.findMany({
        where: { id: { in: orderIds } },
        include: {
          baugruppenInstances: {
            include: {
              baugruppe: { select: { bezeichnung: true, variantenTyp: true } },
              austauschBaugruppe: { select: { bezeichnung: true, variantenTyp: true } }
            }
          },
          produktvariante: {
            select: { bezeichnung: true, typ: true }
          }
        },
        take: 20
      })

      return {
        id: String(batch.id ?? ''),
        releaseAt: batch.releaseAt ?? null,
        size: orderIds.length,
        score: batch.score ?? null,
        sampleOrders: orderIds.slice(0, 5),
        orderDetails: orders.map(order => ({
          orderId: order.id,
          productVariant: order.produktvariante.bezeichnung,
          productType: order.produktvariante.typ,
          components: order.baugruppenInstances.map(instance => ({
            original: instance.baugruppe.bezeichnung,
            originalType: instance.baugruppe.variantenTyp,
            replacement: instance.austauschBaugruppe?.bezeichnung ?? null,
            replacementType: instance.austauschBaugruppe?.variantenTyp ?? null,
            reassemblyType: instance.reAssemblyTyp,
            condition: instance.zustand
          }))
        }))
      }
    })
  )

  return {
    priorityCount: priorities.length,
    batchCount: batches.length,
    releaseListCount: releaseList.length,
    releaseListPreview: releaseList.slice(0, 12).map((id: any) => String(id)),
    topPriorities: priorities.slice(0, 8).map((p: any) => ({
      orderId: String(p.orderId ?? ''),
      priority: Number(p.priority ?? 0),
      dueDate: p.dueDate ?? null,
    })),
    topBatches: topBatchesWithDetails,
    _scriptExecution: details?._scriptExecution ?? null,
  }
}

const summarizePipoResult = (details: any) => {
  const paretoSize = Array.isArray(details?.paretoSet) ? details.paretoSet.length : 0
  const releasedOps = Array.isArray(details?.releasedOps) ? details.releasedOps.length : 0
  return {
    paretoSize,
    selectedPlanId: details?.selectedPlanId ?? null,
    releasedOps,
    releasedOpsPreview: Array.isArray(details?.releasedOps)
      ? details.releasedOps.slice(0, 8).map((op: any) => ({
          id: String(op.id ?? ''),
          station: String(op.stationId ?? ''),
          duration: Number(op.expectedDuration ?? 0),
        }))
      : [],
    paretoPreview: Array.isArray(details?.paretoSet)
      ? details.paretoSet.slice(0, 5).map((plan: any) => ({
          id: String(plan.id ?? ''),
          makespan: plan.objectiveValues?.makespan ?? null,
          tardiness: plan.objectiveValues?.tardiness ?? null,
        }))
      : [],
    debug: details?.debug,
    _scriptExecution: details?._scriptExecution ?? null,
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const factoryId = url.searchParams.get('factoryId')
    const sinceParam = url.searchParams.get('since')

    let sinceDate: Date | null = null
    if (sinceParam) {
      const sinceNumeric = Number(sinceParam)
      if (!Number.isNaN(sinceNumeric) && Number.isFinite(sinceNumeric)) {
        const asDate = new Date(sinceNumeric)
        if (!Number.isNaN(asDate.getTime())) {
          sinceDate = asDate
        }
      } else {
        const parsed = new Date(sinceParam)
        if (!Number.isNaN(parsed.getTime())) {
          sinceDate = parsed
        }
      }
    }

    if (!factoryId) {
      return NextResponse.json(
        { error: 'Missing required parameter factoryId' },
        { status: 400 }
      )
    }

    const logs = await prisma.schedulingLog.findMany({
      where: {
        factoryId,
        ...(sinceDate
          ? ({
              createdAt: {
                gte: sinceDate,
              },
            } as const)
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    const orderedLogs = [...logs].reverse()

    const stats = createInitialStats()
    const batchHistory = createEmptyBatchHistory()
    const recentSummaries: Array<{
      id: string
      stage: SchedulingStageKey
      simMinute: number | null
      releasedCount: number
      reorderCount: number
      queueSize: number
      batchCount: number
      createdAt: string
      orderSequence?: string[]
      pythonReleaseList?: string[]
      pythonEtaList?: Array<{ orderId: string; eta: number }>
      pythonPriorities?: Array<{ orderId: string; priority: number }>
      pythonBatches?: Array<{ id: string; size: number }>
      pythonDebug?: Array<Record<string, unknown>>
      pythonDiffCount?: number
      pythonAssignments?: Array<{ orderId: string; eta: number | null; priorityScore: number | null }>
    }> = []

    const insights: Partial<Record<
      SchedulingStageKey,
      {
        python?: {
          createdAt: string
          details: Record<string, any> | null
          debug?: Array<Record<string, unknown>>
        }
        lastSummary?: {
          createdAt: string
          queueSize: number
          releasedCount: number
          reorderCount: number
          orderSequence?: string[]
          pythonReleaseList?: string[]
          pythonEtaList?: Array<{ orderId: string; eta: number }>
          pythonPriorities?: Array<{ orderId: string; priority: number }>
          pythonBatches?: Array<{ id: string; size: number }>
          pythonAssignments?: Array<{ orderId: string; eta: number | null; priorityScore: number | null }>
          pythonDebug?: Array<Record<string, unknown>>
          pythonDiffCount?: number
          batchSizes?: number[]
          etaWindow?: { min: number; max: number } | null
          simMinute: number | null
        }
      }
    >> = {}

    const hasMeaningfulBatchSizes = (value?: any[]): boolean =>
      Array.isArray(value) &&
      value.some((n) => typeof n === 'number' && Number.isFinite(n) && Number(n) >= 2)

    const hasMeaningfulTopBatches = (value?: any[]): boolean =>
      Array.isArray(value) &&
      value.some((batch) => {
        const explicit = Number((batch as any)?.size)
        if (Number.isFinite(explicit) && explicit >= 2) {
          return true
        }
        const ids = (batch as any)?.orderIds
        if (Array.isArray(ids) && ids.length >= 2) {
          return true
        }
        const seqs = (batch as any)?.orderSequences
        if (Array.isArray(seqs) && seqs.length >= 2) {
          return true
        }
        return false
      })

    const deriveBatchSizesFromTopBatches = (value?: any[]): number[] => {
      if (!Array.isArray(value)) return []
      return value.map((batch) => {
        const explicit = Number((batch as any)?.size)
        if (Number.isFinite(explicit) && explicit >= 0) {
          return explicit
        }
        const ids = (batch as any)?.orderIds
        if (Array.isArray(ids)) {
          return ids.length
        }
        const seqs = (batch as any)?.orderSequences
        if (Array.isArray(seqs)) {
          return seqs.length
        }
        return 0
      })
    }

    const condenseTopBatches = (value?: any[]): StageBatchHistoryEntry['topBatches'] => {
      if (!Array.isArray(value) || value.length === 0) return undefined
      return value.map((batch: any) => ({
        id: String(batch?.id ?? ''),
        size:
          Number(batch?.size ?? (Array.isArray(batch?.orderIds) ? batch.orderIds.length : 0)) || 0,
        releaseAt:
          typeof batch?.releaseAt === 'number'
            ? batch.releaseAt
            : typeof batch?.windowStart?.earliest === 'number'
            ? batch.windowStart.earliest
            : null,
        windowStart: batch?.windowStart ?? null,
        windowEnd: batch?.windowEnd ?? null,
        jaccardSimilarity:
          typeof batch?.jaccardSimilarity === 'number' ? batch.jaccardSimilarity : null,
        jaccardMatrix: Array.isArray(batch?.jaccardMatrix) ? batch.jaccardMatrix : undefined,
        jaccardLabels: Array.isArray(batch?.jaccardLabels) ? batch.jaccardLabels : undefined,
        jaccardJustifications: Array.isArray(batch?.jaccardJustifications)
          ? batch.jaccardJustifications
          : undefined,
        orderSequences: Array.isArray(batch?.orderSequences) ? batch.orderSequences : undefined,
        sampleOrders: Array.isArray(batch?.sampleOrders) ? batch.sampleOrders.slice(0, 8) : undefined,
      }))
    }

    const mergeBatchSizes = (
      incoming: any,
      previous?: number[]
    ): number[] | undefined => {
      if (hasMeaningfulBatchSizes(incoming)) {
        return incoming
      }
      return previous
    }

    const mergeEtaWindow = (
      incoming?: { min: number | null; max: number | null } | null,
      previous?: { min: number | null; max: number | null } | null
    ): { min: number | null; max: number | null } | null => {
      if (
        incoming &&
        (typeof incoming.min === 'number' ||
          typeof incoming.max === 'number')
      ) {
        return incoming
      }
      return previous ?? null
    }

    const shouldReplacePythonInsight = (details: Record<string, any> | null | undefined) => {
      if (!details || typeof details !== 'object') return false
      return (
        hasMeaningfulBatchSizes(details.batchSizes) ||
        hasMeaningfulTopBatches(details.topBatches) ||
        (Array.isArray(details.debug) && details.debug.length > 0)
      )
    }

    const appendBatchHistory = (stageKey: SchedulingStageKey, entry: StageBatchHistoryEntry) => {
      const history = batchHistory[stageKey]
      history.push(entry)
      if (history.length > BATCH_HISTORY_LIMIT) {
        history.shift()
      }
    }

    for (const log of orderedLogs) {
      const stageKey = stageEnumToKey[log.stage]
      const details: any = log.details ?? {}

      if (log.mode === 'SUMMARY') {
        const released = Number(details?.releasedCount ?? 0) || 0
        const reorder = Number(details?.reorderCount ?? 0) || 0
        const queueSize = Number(details?.queueSize ?? 0) || 0
        const batches = Number(details?.batchCount ?? 0) || 0
        const simMinute =
          typeof details?.simMinute === 'number'
            ? details.simMinute
            : typeof details?.timestamp === 'number'
            ? Math.round(details.timestamp / 60000)
            : null

        const stageStats = stats[stageKey]
        stageStats.runs += 1
        stageStats.lastRun = simMinute ?? stageStats.lastRun ?? null
        stageStats.lastReleased = released
        stageStats.totalReleased += released
        stageStats.lastReorder = reorder
        stageStats.totalReorder += reorder
        stageStats.lastQueueSize = queueSize
        stageStats.lastBatches = batches

        const orderSequence = Array.isArray(details.orderSequence)
          ? details.orderSequence.map((id: any) => String(id))
          : undefined
        const pythonReleaseList = Array.isArray(details.pythonReleaseList)
          ? details.pythonReleaseList.map((id: any) => String(id))
          : undefined
        const pythonEtaList = Array.isArray(details.pythonEtaList)
          ? details.pythonEtaList.map((eta: any) => ({
              orderId: String(eta.orderId),
              eta: Number(eta.eta ?? 0),
            }))
          : undefined
        const pythonPriorities = Array.isArray(details.pythonPriorities)
          ? details.pythonPriorities.map((p: any) => ({
              orderId: String(p.orderId),
              priority: Number(p.priority ?? 0),
            }))
          : undefined
        const pythonBatches = Array.isArray(details.pythonBatches)
          ? details.pythonBatches.map((batch: any) => ({
              id: String(batch.id ?? ''),
              size: Number(batch.size ?? 0),
            }))
          : undefined
        const pythonAssignments = Array.isArray(details.pythonAssignments)
          ? details.pythonAssignments.map((item: any) => ({
              orderId: String(item.orderId ?? ''),
              eta:
                item.eta === null || item.eta === undefined
                  ? null
                  : Number(item.eta ?? 0),
              priorityScore:
                item.priorityScore === null || item.priorityScore === undefined
                  ? null
                  : Number(item.priorityScore ?? 0),
            }))
          : undefined

        const pythonDebug = Array.isArray(details.pythonDebug)
          ? details.pythonDebug
          : undefined
        const pythonDiff = Number(details.pythonDiffCount ?? reorder) || 0
        stageStats.lastPythonDiff = pythonDiff
        stageStats.totalPythonDiff += pythonDiff

        recentSummaries.push({
          id: log.id,
          stage: stageKey,
          simMinute,
          releasedCount: released,
          reorderCount: reorder,
          queueSize,
          batchCount: batches,
          createdAt: log.createdAt.toISOString(),
          orderSequence,
          pythonReleaseList,
          pythonEtaList,
          pythonPriorities,
          pythonBatches,
          pythonAssignments,
          pythonDebug,
          pythonDiffCount: pythonDiff,
        })
        const existingInsight = insights[stageKey] ?? {}
        const previousSummary = existingInsight.lastSummary
        const summaryHasMeaningfulBatch = hasMeaningfulBatchSizes(details?.batchSizes)
        const mergedBatchSizes = summaryHasMeaningfulBatch
          ? mergeBatchSizes(details?.batchSizes, previousSummary?.batchSizes)
          : previousSummary?.batchSizes
        const mergedEtaWindow = summaryHasMeaningfulBatch
          ? mergeEtaWindow(details?.etaWindow, previousSummary?.etaWindow)
          : previousSummary?.etaWindow ?? null

        insights[stageKey] = {
          ...existingInsight,
          lastSummary: {
            createdAt: log.createdAt.toISOString(),
            queueSize,
            releasedCount: released,
            reorderCount: reorder,
            orderSequence,
            pythonReleaseList,
            pythonEtaList,
            pythonPriorities,
            pythonBatches,
            pythonAssignments,
            pythonDebug,
            pythonDiffCount: pythonDiff,
            simMinute,
            batchSizes: mergedBatchSizes,
            etaWindow: mergedEtaWindow,
          },
        }
        if (summaryHasMeaningfulBatch) {
          const fallbackTop =
            existingInsight.python?.details?.topBatches ??
            existingInsight.lastSummary?.pythonBatches ??
            undefined
          appendBatchHistory(stageKey, {
            createdAt: log.createdAt.toISOString(),
            simMinute,
            batchSizes: mergedBatchSizes ?? deriveBatchSizesFromTopBatches(fallbackTop),
            etaWindow: mergedEtaWindow,
            topBatches: condenseTopBatches(fallbackTop),
          })
        }
        continue
      }

      const existingInsight = insights[stageKey] ?? {}
      let summaryDetails: Record<string, any> | null = null
      if (stageKey === 'pap') {
        summaryDetails = await summarizePapResult(details)
      } else if (stageKey === 'pip') {
        summaryDetails = await summarizePipResult(details)
      } else if (stageKey === 'pipo') {
        summaryDetails = summarizePipoResult(details)
      }

      // Calculate simMinute for INTEGRATED logs (same logic as SUMMARY block)
      const simMinute =
        typeof details?.simMinute === 'number'
          ? details.simMinute
          : typeof details?.timestamp === 'number'
          ? Math.round(details.timestamp / 60000)
          : null

      const useNewPython = shouldReplacePythonInsight(summaryDetails)
      if (useNewPython && summaryDetails) {
        const baseBatchSizes =
          (Array.isArray(summaryDetails.batchSizes) && summaryDetails.batchSizes.length > 0
            ? summaryDetails.batchSizes
            : deriveBatchSizesFromTopBatches(summaryDetails.topBatches)) ?? []
        if (hasMeaningfulBatchSizes(baseBatchSizes)) {
          appendBatchHistory(stageKey, {
            createdAt: log.createdAt.toISOString(),
            simMinute,
            batchSizes: baseBatchSizes,
            etaWindow: summaryDetails.etaWindow ?? null,
            topBatches: condenseTopBatches(summaryDetails.topBatches),
          })
        }

        // Add to recentSummaries for historical access to pythonDebug
        recentSummaries.push({
          id: log.id,
          stage: stageKey,
          simMinute,
          createdAt: log.createdAt.toISOString(),
          pythonDebug: Array.isArray(details?.debug) ? details.debug : undefined,
        })
      }
      insights[stageKey] = {
        ...existingInsight,
        python: useNewPython
          ? {
              createdAt: log.createdAt.toISOString(),
              details: {
                ...summaryDetails,
                _scriptExecution: details?._scriptExecution ?? null,
              },
              debug: Array.isArray(details?.debug) ? details.debug : undefined,
            }
          : existingInsight.python,
      }
    }

    recentSummaries.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

    // Determine simulation start time from earliest log
    const simulationStartTime = orderedLogs.length > 0
      ? orderedLogs.reduce((earliest, log) => {
          const details: any = log.details ?? {}
          const simMinute =
            typeof details?.simMinute === 'number'
              ? details.simMinute
              : typeof details?.timestamp === 'number'
              ? details.timestamp / 60000
              : 0
          const estimatedSimStart = new Date(log.createdAt.getTime() - simMinute * 60000)
          return estimatedSimStart < earliest ? estimatedSimStart : earliest
        }, orderedLogs[0].createdAt)
      : null

    // Create timeline of scheduling events
    const schedulingTimeline = orderedLogs
      .filter(log => log.mode !== 'SUMMARY')
      .map(log => {
        const details: any = log.details ?? {}
        const simMinute = typeof details?.simMinute === 'number'
          ? details.simMinute
          : typeof details?.timestamp === 'number'
          ? Math.round(details.timestamp / 60000)
          : null

        return {
          stage: stageEnumToKey[log.stage],
          createdAt: log.createdAt.toISOString(),
          simMinute,
          realTime: log.createdAt.toISOString()
        }
      })
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
      .slice(-20) // Last 20 scheduling events (most recent)

    const normalizedHistory = Object.fromEntries(
      (Object.entries(batchHistory) as Array<[SchedulingStageKey, StageBatchHistoryEntry[]]>)
        .map(([stageKey, entries]) => [stageKey, [...entries].reverse()])
    )

    return NextResponse.json({
      stats,
      recentSummaries: recentSummaries.slice(0, 12),
      insights,
      lastUpdated: new Date().toISOString(),
      simulationStartTime: simulationStartTime?.toISOString() ?? null,
      schedulingTimeline,
      batchHistory: normalizedHistory,
    })
  } catch (error) {
    console.error('[SchedulingSummary] Failed to build summary:', error)
    return NextResponse.json(
      { error: 'Failed to load scheduling summary' },
      { status: 500 }
    )
  }
}
