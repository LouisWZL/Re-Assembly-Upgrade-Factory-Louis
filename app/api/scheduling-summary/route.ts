import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

const summarizePapResult = (details: any) => {
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
  return {
    batchCount: batches.length,
    averageBatchSize: Number.isFinite(avgBatchSize) ? Number(avgBatchSize.toFixed(2)) : 0,
    etaCount: etaList.length,
    averageEtaMinutes: Number.isFinite(avgEta) ? Number(avgEta.toFixed(1)) : 0,
    topBatches: batches.slice(0, 5).map((batch: any) => ({
      id: String(batch.id ?? ''),
      size: Array.isArray(batch.orderIds) ? batch.orderIds.length : 0,
      sampleOrders: Array.isArray(batch.orderIds)
        ? batch.orderIds.slice(0, 5).map((id: any) => String(id))
        : [],
    })),
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

const summarizePipResult = (details: any) => {
  const priorities = Array.isArray(details?.priorities) ? details.priorities : []
  const batches = Array.isArray(details?.batches) ? details.batches : []
  const releaseList = Array.isArray(details?.releaseList) ? details.releaseList : []
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
    topBatches: batches.slice(0, 5).map((batch: any) => ({
      id: String(batch.id ?? ''),
      releaseAt: batch.releaseAt ?? null,
      size: Array.isArray(batch.orderIds) ? batch.orderIds.length : 0,
      score: batch.score ?? null,
      sampleOrders: Array.isArray(batch.orderIds)
        ? batch.orderIds.slice(0, 5).map((id: any) => String(id))
        : [],
    })),
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
      take: 150,
    })

    const stats = createInitialStats()
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
          simMinute: number | null
        }
      }
    >> = {}

    for (const log of logs) {
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
          },
        }
        continue
      }

      const existingInsight = insights[stageKey] ?? {}
      let summaryDetails: Record<string, any> | null = null
      if (stageKey === 'pap') {
        summaryDetails = summarizePapResult(details)
      } else if (stageKey === 'pip') {
        summaryDetails = summarizePipResult(details)
      } else if (stageKey === 'pipo') {
        summaryDetails = summarizePipoResult(details)
      }

      insights[stageKey] = {
        ...existingInsight,
        python: {
          createdAt: log.createdAt.toISOString(),
          details: {
            ...summaryDetails,
            _scriptExecution: details?._scriptExecution ?? null,
          },
          debug: Array.isArray(details?.debug) ? details.debug : undefined,
        },
      }
    }

    recentSummaries.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

    return NextResponse.json({
      stats,
      recentSummaries: recentSummaries.slice(0, 12),
      insights,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[SchedulingSummary] Failed to build summary:', error)
    return NextResponse.json(
      { error: 'Failed to load scheduling summary' },
      { status: 500 }
    )
  }
}
