'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, Trash2, CheckCircle2, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

type SchedulingStageKey = 'pap' | 'pip' | 'pipo'

interface OrderPosition {
  id: string
  queuePosition: number
  optimizedPosition: number | null
  delta: number | null
}

interface StageData {
  hasRun: boolean
  queueSize: number
  orders: OrderPosition[]
}

interface ComponentDetail {
  original: string
  originalType: string
  replacement: string | null
  replacementType: string | null
  reassemblyType: string | null
  condition: number
}

interface OrderDetail {
  orderId: string
  productVariant: string
  productType: string
  components: ComponentDetail[]
}

interface OrderSequence {
  orderId: string
  sequence: string[]
}

interface BatchDetail {
  id: string
  size: number
  releaseAt?: number | null
  jaccardSimilarity?: number | null
  jaccardMatrix?: number[][]
  jaccardLabels?: string[]
  jaccardJustifications?: Array<{ orderId: string; sequence: string[] }>
  orderSequences?: OrderSequence[]
  sampleOrders?: string[]
  orderDetails?: OrderDetail[]
}

interface StageSummaryInsight {
  createdAt: string
  queueSize: number
  releasedCount: number
  reorderCount: number
  orderSequence?: string[]
  pythonReleaseList?: string[]
  pythonEtaList?: Array<{ orderId: string; eta: number }>
  pythonPriorities?: Array<{ orderId: string; priority: number }>
  pythonBatches?: BatchDetail[]
  pythonAssignments?: Array<{ orderId: string; eta: number | null; priorityScore: number | null }>
  pythonDebug?: Array<Record<string, unknown>>
  pythonDiffCount?: number
  simMinute: number | null
  batchSizes?: number[]
  etaWindow?: { min: number; max: number } | null
}

interface StageBatchHistoryEntry {
  createdAt: string
  simMinute: number | null
  batchSizes: number[]
  etaWindow?: { min: number; max: number } | null
  topBatches?: BatchDetail[]
}

interface StagePythonInsight {
  createdAt: string
  details: Record<string, any> | null
  debug?: Array<Record<string, unknown>>
}

interface StageInsight {
  python?: StagePythonInsight
  lastSummary?: StageSummaryInsight
}

interface StageStats {
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

interface SchedulingTimelineEvent {
  stage: SchedulingStageKey
  createdAt: string
  simMinute: number | null
  realTime: string
}

interface QueueMonitorData {
  pap: StageData
  pip: StageData
  pipo: StageData
  lastUpdated: string
  insights?: Record<SchedulingStageKey, StageInsight>
  summaryUpdated?: string
  stats?: Record<SchedulingStageKey, StageStats>
  simulationStartTime?: string | null
  schedulingTimeline?: SchedulingTimelineEvent[]
  batchHistory?: Record<SchedulingStageKey, StageBatchHistoryEntry[]>
  recentSummaries?: Array<{
    stage: SchedulingStageKey
    createdAt: string
    pythonDebug?: Array<Record<string, unknown>>
  }>
}

const stageLabels: Record<SchedulingStageKey, string> = {
  pap: 'Pre-Acceptance (PAP)',
  pip: 'Pre-Inspection (PIP)',
  pipo: 'Post-Inspection (PIPO)',
}

const stageDescriptions: Record<SchedulingStageKey, string> = {
  pap: 'Grobterminierung',
  pip: 'Durchlaufterminierung',
  pipo: 'Feinterminierung',
}

export function SchedulingDashboard({ factoryId }: { factoryId: string }) {
  const [data, setData] = useState<QueueMonitorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedStages, setExpandedStages] = useState<Set<SchedulingStageKey>>(new Set())

  const fetchData = useCallback(async () => {
    if (!factoryId) return

    try {
      setLoading(true)
      setError(null)

      const timestamp = Date.now()
      const [queueRes, summaryRes] = await Promise.all([
        fetch(`/api/queue-monitor?factoryId=${factoryId}&t=${timestamp}`, {
          cache: 'no-store',
        }),
        fetch(`/api/scheduling-summary?factoryId=${factoryId}&t=${timestamp}`, {
          cache: 'no-store',
        }),
      ])

      if (!queueRes.ok) {
        throw new Error(`Status ${queueRes.status}`)
      }

      const queueData = await queueRes.json()
      let insights: Record<SchedulingStageKey, StageInsight> | undefined
      let summaryUpdated: string | undefined

      if (summaryRes.ok) {
        const summary = await summaryRes.json()
        insights = summary?.insights ?? undefined
        summaryUpdated = summary?.lastUpdated ?? undefined
        const stats = summary?.stats ?? undefined
        const simulationStartTime = summary?.simulationStartTime ?? undefined
        const schedulingTimeline = summary?.schedulingTimeline ?? undefined
        const batchHistory = summary?.batchHistory ?? undefined
        const recentSummaries = summary?.recentSummaries ?? undefined

        setData({
          ...queueData,
          insights,
          summaryUpdated,
          stats,
          simulationStartTime,
          schedulingTimeline,
          batchHistory,
          recentSummaries,
        })
      } else {
        console.warn(
          '[SchedulingDashboard] scheduling-summary request failed:',
          summaryRes.status
        )
        setData({
          ...queueData,
        })
      }
    } catch (err) {
      console.error('[SchedulingDashboard] Failed to fetch data:', err)
      setError('Fehler beim Laden der Queue-Daten')
    } finally {
      setLoading(false)
    }
  }, [factoryId])

  const clearLogs = useCallback(async () => {
    if (!factoryId) return
    try {
      setLoading(true)
      const res = await fetch('/api/clear-scheduling-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryId }),
      })
      if (!res.ok) {
        throw new Error(`Status ${res.status}`)
      }
      const result = await res.json()
      console.log(`[SchedulingDashboard] Cleared ${result.deletedCount} logs`)
      setData(null)
      await fetchData()
    } catch (err) {
      console.error('[SchedulingDashboard] Failed to clear logs:', err)
      setError('Failed to clear scheduling logs')
    } finally {
      setLoading(false)
    }
  }, [factoryId, fetchData])

  const toggleStage = (stage: SchedulingStageKey) => {
    setExpandedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) {
        next.delete(stage)
      } else {
        next.add(stage)
      }
      return next
    })
  }

  useEffect(() => {
    if (!factoryId) return
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [factoryId, fetchData])

  if (!factoryId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Simulation Queue Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Keine Factory ausgewählt</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            Simulation Queue Monitor
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Bearbeitungsreihenfolge vor und nach Terminierung
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Aktualisiert: {new Date(data.lastUpdated).toLocaleTimeString()}
            </span>
          )}
          {data?.summaryUpdated && (
            <span className="text-xs text-muted-foreground">
              Terminierung: {new Date(data.summaryUpdated).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={clearLogs}
            disabled={loading}
            title="Scheduling-Logs löschen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            title="Aktualisieren"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">Daten werden geladen...</div>
        ) : (
          <div className="space-y-4">
            {(['pap', 'pip', 'pipo'] as SchedulingStageKey[]).map((stageKey) => {
              const stage = data[stageKey]
              const isExpanded = expandedStages.has(stageKey)

              return (
                <Card key={stageKey} className="border-l-4 border-l-purple-500">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base">
                          {stageLabels[stageKey]}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {stageDescriptions[stageKey]}
                        </Badge>
                        {stage.hasRun ? (
                          <Badge className="bg-green-600 text-white">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Durchgelaufen
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="mr-1 h-3 w-3" />
                            Nicht durchgelaufen
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline">
                        {stage.queueSize} {stage.queueSize === 1 ? 'Auftrag' : 'Aufträge'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stage.queueSize === 0 ? (
                      <p className="text-sm text-muted-foreground">Keine Aufträge in der Queue</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[200px]">Auftrag ID</TableHead>
                                <TableHead className="text-center">Queue-Position (Vorher)</TableHead>
                                <TableHead className="text-center">Optimiert (Nachher)</TableHead>
                                <TableHead className="text-center">Änderung</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stage.orders.map((order) => (
                                <TableRow key={order.id}>
                                  <TableCell className="font-mono text-xs">
                                    {order.id}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {order.queuePosition}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {order.optimizedPosition !== null ? (
                                      <span className="font-semibold">
                                        {order.optimizedPosition}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {order.delta !== null && order.delta !== 0 ? (
                                      <Badge variant="default">Ja</Badge>
                                    ) : order.delta === 0 ? (
                                      <Badge variant="outline">Nein</Badge>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <Collapsible
                          open={isExpanded}
                          onOpenChange={() => toggleStage(stageKey)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full">
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="mr-2 h-4 w-4" />
                                  Details ausblenden
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="mr-2 h-4 w-4" />
                                  Terminierungs-Details anzeigen
                                </>
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-4">
                            <StageDetailsDisplay
                              stageKey={stageKey}
                              insight={data?.insights?.[stageKey]}
                              stats={data?.stats?.[stageKey]}
                              simulationStartTime={data?.simulationStartTime}
                              batchHistory={data?.batchHistory?.[stageKey]}
                              recentSummaries={data?.recentSummaries?.filter(s => s.stage === stageKey)}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {/* Timeline: Terminierungen seit Sim-Start */}
            {data.schedulingTimeline && data.schedulingTimeline.length > 0 && (
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <CardTitle className="text-base">Terminierungs-Zeitstrahl</CardTitle>
                  {data.simulationStartTime && (
                    <p className="text-xs text-muted-foreground">
                      Sim-Start: {new Date(data.simulationStartTime).toLocaleString('de-DE')}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {/* Visueller Zeitstrahl */}
                  <div className="relative mb-6">
                    {/* Zeitleiste (horizontale Linie) */}
                    <div className="absolute left-0 right-0 top-6 h-0.5 bg-gradient-to-r from-gray-300 via-blue-400 to-purple-400" />

                    {/* Events als Punkte auf der Timeline */}
                    <div className="relative flex justify-between" style={{ minHeight: '80px' }}>
                      {data.schedulingTimeline.slice(0, 15).map((event, idx) => {
                        const stageDotColors: Record<SchedulingStageKey, string> = {
                          pap: 'bg-purple-500 border-purple-700',
                          pip: 'bg-blue-500 border-blue-700',
                          pipo: 'bg-green-500 border-green-700',
                        }
                        const realTime = new Date(event.realTime)
                        const simMinuteDisplay = event.simMinute !== null ? `t=${event.simMinute}min` : 'n/a'

                        // Position basierend auf Index (gleichmäßig verteilt)
                        const leftPercent = (idx / Math.max(1, (data.schedulingTimeline?.slice(0, 15).length ?? 1) - 1)) * 100

                        return (
                          <div
                            key={idx}
                            className="absolute flex flex-col items-center"
                            style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
                          >
                            {/* Punkt auf Timeline */}
                            <div
                              className={`h-3 w-3 rounded-full border-2 ${stageDotColors[event.stage]} shadow-md z-10`}
                              style={{ marginTop: '16px' }}
                              title={`${stageLabels[event.stage]} - ${realTime.toLocaleString('de-DE')}`}
                            />
                            {/* Label unterhalb */}
                            <div className="mt-4 flex flex-col items-center text-center">
                              <span className="text-[9px] font-semibold text-foreground whitespace-nowrap">
                                {stageLabels[event.stage].split(' ')[0]}
                              </span>
                              <span className="text-[8px] text-muted-foreground whitespace-nowrap">
                                {realTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-[7px] text-blue-600 font-mono">
                                {simMinuteDisplay}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Legende */}
                  <div className="flex justify-center gap-4 text-[10px] mt-2">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-purple-500 border border-purple-700" />
                      <span>PAP</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-blue-500 border border-blue-700" />
                      <span>PIP</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500 border border-green-700" />
                      <span>PIPO</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StageDetailsDisplay({
  stageKey,
  insight,
  stats,
  simulationStartTime,
  batchHistory,
  recentSummaries,
}: {
  stageKey: SchedulingStageKey
  insight: StageInsight | undefined
  stats: StageStats | undefined
  simulationStartTime?: string | null
  batchHistory?: StageBatchHistoryEntry[]
  recentSummaries?: Array<{
    stage: SchedulingStageKey
    createdAt: string
    pythonDebug?: Array<Record<string, unknown>>
  }>
}) {
  const [historyIndex, setHistoryIndex] = useState(0)
  useEffect(() => {
    setHistoryIndex(0)
  }, [batchHistory?.length])

  // Allow PIPO to show even without batchHistory, since it relies on pythonDebug
  if (!insight?.python && !insight?.lastSummary && (stageKey !== 'pipo' && (!batchHistory || batchHistory.length === 0))) {
    return (
      <div className="rounded-md border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          Keine Terminierungsdetails vorhanden
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Der letzte Lauf hat keine detaillierten Ergebnisse geliefert.
        </p>
      </div>
    )
  }

  const pythonDetails = insight?.python?.details ?? null
  const pythonDebug = insight?.python?.debug ?? null
  const lastSummary = insight?.lastSummary
  const scriptInfo = pythonDetails?._scriptExecution ?? null

  const scriptPath = typeof scriptInfo?.scriptPath === 'string' ? scriptInfo.scriptPath : undefined
  const scriptName = scriptPath ? scriptPath.split(/[\\/]/).pop() : undefined
  const scriptDuration =
    typeof scriptInfo?.startTime === 'number' && typeof scriptInfo?.endTime === 'number'
      ? scriptInfo.endTime - scriptInfo.startTime
      : null

  // Extract data for widgets (prefer persisted history entries)
  const historyEntries = batchHistory ?? []
  const selectedHistoryEntry =
    historyEntries.length > 0
      ? historyEntries[Math.min(historyIndex, historyEntries.length - 1)]
      : null
  const aggregatedBatchSizes = historyEntries.flatMap((entry, entryIdx) =>
    (entry.batchSizes ?? []).map((size: number) => ({
      size,
      historyIndex: entryIdx,
    }))
  )
  const aggregatedTopBatches = historyEntries.flatMap((entry, idx) =>
    (entry.topBatches ?? []).map((batch) => ({
      ...batch,
      _historyCreatedAt: entry.createdAt,
      _historyIndex: idx,
    }))
  )
  const aggregatedEtaWindow = (() => {
    const mins = historyEntries
      .map((entry) => entry.etaWindow?.min)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const maxs = historyEntries
      .map((entry) => entry.etaWindow?.max)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (mins.length === 0 || maxs.length === 0) {
      return null
    }
    return {
      min: Math.min(...mins),
      max: Math.max(...maxs),
    }
  })()

  const baseBatchSizes = (
    selectedHistoryEntry?.batchSizes ??
    pythonDetails?.batchSizes ??
    lastSummary?.batchSizes ??
    []
  ).map((size: number) => ({ size, historyIndex: historyIndex }))
  const baseTopBatches =
    selectedHistoryEntry?.topBatches ??
    pythonDetails?.topBatches ??
    lastSummary?.pythonBatches ??
    []
  const baseEtaWindow =
    selectedHistoryEntry?.etaWindow ??
    lastSummary?.etaWindow ??
    pythonDetails?.etaWindow ??
    null

  const batchSizes = aggregatedBatchSizes.length > 0 ? aggregatedBatchSizes : baseBatchSizes
  const topBatches = aggregatedTopBatches.length > 0 ? aggregatedTopBatches : baseTopBatches
  const etaWindow = aggregatedEtaWindow ?? baseEtaWindow
  const totalBatchRuns = historyEntries.length
  const timelineBatches = topBatches
    .map((batch: any, idx: number) => {
      const startEarliest =
        typeof batch?.windowStart?.earliest === 'number'
          ? batch.windowStart.earliest
          : typeof batch?.releaseAt === 'number'
          ? batch.releaseAt
          : null
      const startLatest =
        typeof batch?.windowStart?.latest === 'number'
          ? batch.windowStart.latest
          : startEarliest
      const endLatest =
        typeof batch?.windowEnd?.latest === 'number'
          ? batch.windowEnd.latest
          : typeof batch?.windowEnd?.earliest === 'number'
          ? batch.windowEnd.earliest
          : startLatest
      return {
        ...batch,
        startEarliest,
        startLatest,
        endLatest,
        index: idx,
      }
    })
    .filter((batch: any) => batch.startEarliest !== null)
  const timelineMinCandidates = [
    ...timelineBatches.map((batch: any) => Number(batch.startEarliest ?? 0)),
    etaWindow?.min ?? null,
  ].filter((value) => typeof value === 'number') as number[]
  const timelineMaxCandidates = [
    ...timelineBatches.map((batch: any) => Number(batch.endLatest ?? batch.startLatest ?? 0)),
    etaWindow?.max ?? null,
  ].filter((value) => typeof value === 'number') as number[]
  const timelineMin = timelineMinCandidates.length ? Math.min(...timelineMinCandidates) : 0
  const timelineMax = timelineMaxCandidates.length ? Math.max(...timelineMaxCandidates) : timelineMin + 1
  const timelineRange = Math.max(timelineMax - timelineMin, 1)

  const formatSimTime = (minuteValue: number | null | undefined) => {
    if (minuteValue === null || minuteValue === undefined) {
      return ''
    }
    if (simulationStartTime) {
      const base = new Date(simulationStartTime)
      const atTime = new Date(base.getTime() + minuteValue * 60000)
      return atTime.toLocaleString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    }
    return `t=${Math.round(minuteValue)}min`
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/30 p-4">
      {historyEntries.length > 0 && (
        <div className="rounded border bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-purple-900">
            Batch-Historie ({historyEntries.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {historyEntries.map((entry, idx) => {
              const dateLabel = new Date(entry.createdAt).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <Button
                  key={`${entry.createdAt}-${idx}`}
                  size="xs"
                  variant={idx === historyIndex ? 'default' : 'outline'}
                  className="text-[10px]"
                  onClick={() => setHistoryIndex(idx)}
                >
                  {dateLabel} · t={entry.simMinute ?? '–'}
                </Button>
              )
            })}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground space-y-1">
            <div>Diagramme zeigen kumulierte Daten aller Läufe.</div>
            <div>Auswahl #{historyIndex + 1} (neueste zuerst) dient zur Detailprüfung.</div>
          </div>
        </div>
      )}

      {/* Widget 1: Batch Run Count */}
      {totalBatchRuns > 0 && (
        <div className="rounded border bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Batch Runs seit Sim-Start
          </div>
          <div className="text-2xl font-bold text-purple-900">{totalBatchRuns}</div>
        </div>
      )}

      {/* Widget 2: Batch Sizes Bar Chart */}
      {batchSizes.length > 0 && (
        <div className="rounded border bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-purple-900">
            Letzte Batch-Größen
          </div>
          {(() => {
            const batches = batchSizes.slice(0, 12)
            const maxSize = Math.max(...batches.map((b: any) => b.size || 0), 1)

            // Color palette for different runs
            const colors = [
              { base: 'rgb(147, 51, 234)', hover: 'rgb(126, 34, 206)', selected: 'rgb(107, 33, 168)' },  // purple
              { base: 'rgb(59, 130, 246)', hover: 'rgb(37, 99, 235)', selected: 'rgb(29, 78, 216)' },    // blue
              { base: 'rgb(34, 197, 94)', hover: 'rgb(22, 163, 74)', selected: 'rgb(21, 128, 61)' },     // green
              { base: 'rgb(234, 88, 12)', hover: 'rgb(194, 65, 12)', selected: 'rgb(154, 52, 18)' },     // orange
              { base: 'rgb(236, 72, 153)', hover: 'rgb(219, 39, 119)', selected: 'rgb(190, 24, 93)' },   // pink
              { base: 'rgb(245, 158, 11)', hover: 'rgb(217, 119, 6)', selected: 'rgb(180, 83, 9)' },     // amber
            ]

            return (
              <div className="flex items-end gap-2">
                {batches.map((batch: any, idx: number) => {
                  const size = batch.size || 0
                  const batchHistoryIdx = batch.historyIndex ?? 0
                  const rawPercent = (size / maxSize) * 100
                  const heightPercent = size === 0 ? 4 : Math.max(rawPercent, 12)
                  const isSelected = batchHistoryIdx === historyIndex

                  const colorSet = colors[batchHistoryIdx % colors.length]
                  const bgColor = isSelected ? colorSet.selected : colorSet.base
                  const hoverColor = isSelected ? colorSet.selected : colorSet.hover

                  return (
                    <div key={idx} className="flex flex-col items-center" style={{ width: '20px' }}>
                      <div
                        className={`relative w-full rounded ${isSelected ? 'ring-2 ring-purple-900 ring-offset-1' : 'bg-muted/40'}`}
                        style={{ height: '70px', backgroundColor: isSelected ? 'transparent' : undefined }}
                        title={`Batch ${idx + 1}: ${size} Aufträge (Durchlauf #${batchHistoryIdx + 1})${isSelected ? ' (ausgewählt)' : ''}`}
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 rounded-t transition-all"
                          style={{
                            height: `${Math.min(heightPercent, 100)}%`,
                            backgroundColor: bgColor,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverColor)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = bgColor)}
                        />
                      </div>
                      <div className={`mt-1 text-[9px] ${isSelected ? 'font-bold text-purple-900' : 'text-muted-foreground'}`}>
                        {size}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Widget 3: Script Metadata (Compact) */}
      {scriptInfo && (
        <div className="rounded border bg-white p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Python Skript
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-purple-900">
              {scriptName ?? 'Unbekanntes Skript'}
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              {typeof scriptInfo.status === 'string' && (
                <div>
                  Status: <span className="font-medium text-foreground">{scriptInfo.status}</span>
                </div>
              )}
              {scriptDuration !== null && scriptDuration >= 0 && (
                <div>
                  Dauer: <span className="font-medium text-foreground">{scriptDuration}ms</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Widget 4: Timeline Diagram (Batch Windows + ETAs) */}
      {(topBatches.length > 0 || etaWindow) && (
        <div className="rounded border bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-purple-900">
            Zeitdiagramm: Batch-Fenster & Liefertermine
          </div>
          <div className="space-y-3">
            {timelineBatches.length > 0 ? (
              timelineBatches.slice(0, 5).map((batch: any, idx: number) => {
                const startEarliest = Number(batch.startEarliest ?? timelineMin)
                const startLatest = Number(batch.startLatest ?? startEarliest)
                const endLatest = Number(batch.endLatest ?? startLatest)
                const startWidth = Math.max(((startLatest - startEarliest) / timelineRange) * 100, 1)
                const windowLeft = ((startEarliest - timelineMin) / timelineRange) * 100
                const deliveryLeft = ((endLatest - timelineMin) / timelineRange) * 100

                return (
                  <div key={`${stageKey}-timeline-batch-${idx}`} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>
                        Batch {idx + 1}: {batch.size ?? '–'} Aufträge
                      </span>
                      {typeof batch.jaccardSimilarity === 'number' && (
                        <span className="text-muted-foreground">
                          Ø Ähnlichkeit {(batch.jaccardSimilarity * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="relative h-10 rounded bg-muted/30">
                      <div
                        className="absolute inset-y-0 rounded bg-purple-200/70"
                        style={{
                          left: `${windowLeft}%`,
                          width: `${Math.min(startWidth, 100 - windowLeft)}%`,
                        }}
                        title={`Startfenster: ${formatSimTime(startEarliest)} – ${formatSimTime(startLatest)}`}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-purple-600"
                        style={{ left: `${windowLeft + startWidth / 2}%` }}
                        title={`Geplanter Start: ${formatSimTime(batch.releaseAt ?? startEarliest)}`}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-green-500"
                        style={{ left: `${Math.min(deliveryLeft, 100)}%` }}
                        title={`Liefertermin: ${formatSimTime(endLatest)}`}
                      />
                    </div>
                    <div className="mt-1 text-[8px] text-muted-foreground">
                      Startfenster {formatSimTime(startEarliest)} – {formatSimTime(startLatest)} · Start {formatSimTime(batch.releaseAt ?? startEarliest)} · Lieferung {formatSimTime(endLatest)}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-[10px] text-muted-foreground">
                Keine Batch-Fenster vorhanden.
              </div>
            )}
            {etaWindow && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                Liefertermin-Fenster:{' '}
                {formatSimTime(etaWindow.min)} – {formatSimTime(etaWindow.max)} (Δ {Math.round(etaWindow.max - etaWindow.min)}min)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Widget 5: Hold Statistics */}
      {pythonDetails && (
        <div className="rounded border bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-purple-900">
            Hold-Statistik
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {typeof pythonDetails.maxHoldCount === 'number' && pythonDetails.maxHoldCount > 0 && (
              <div>
                <div className="text-muted-foreground">Max. Zurückhaltungen:</div>
                <div className="font-semibold">{pythonDetails.maxHoldCount}x</div>
              </div>
            )}
            {typeof pythonDetails.avgHoldCount !== 'undefined' && parseFloat(String(pythonDetails.avgHoldCount)) > 0 && (
              <div>
                <div className="text-muted-foreground">Ø Zurückhaltungen:</div>
                <div className="font-semibold">{pythonDetails.avgHoldCount}x</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Widget 6: Batch Details with Process Sequences & Jaccard Matrix */}
      {topBatches.length > 0 && topBatches.some((b: any) => (b.orderSequences && b.orderSequences.length > 0) || (b.orderDetails && b.orderDetails.length > 0) || (b.jaccardMatrix && b.jaccardMatrix.length > 0)) && (
        <div className="rounded border bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-purple-900">
            Batch-Inhalte & Ähnlichkeiten
          </div>
          <div className="space-y-4">
            {topBatches.map((batch: any, batchIdx: number) => {
              const hasSequences = batch.orderSequences && batch.orderSequences.length > 0
              const hasComponents = batch.orderDetails && batch.orderDetails.length > 0
              const hasMatrix = batch.jaccardMatrix && Array.isArray(batch.jaccardMatrix)
              const matrixLabels: string[] = hasMatrix
                ? (batch.orderSequences?.map((seq: OrderSequence) => seq.orderId) ??
                    batch.sampleOrders ??
                    batch.orderIds ??
                    [])
                : []

              if (!hasSequences && !hasComponents) return null

              return (
                <div key={`${stageKey}-batch-details-${batchIdx}`} className="space-y-2">
                  <Collapsible className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-auto p-1">
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </CollapsibleTrigger>
                      <div className="text-[10px] font-semibold">
                        Batch {batchIdx + 1}: {batch.size} Aufträge
                        {typeof batch.jaccardSimilarity === 'number' && (
                          <span className="ml-2 text-muted-foreground">
                            (Ø Jaccard: {(batch.jaccardSimilarity * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <CollapsibleContent className="ml-6 space-y-3">
                      {/* Prozess-Sequenzen (falls vorhanden) */}
                      {hasSequences && (
                        <div className="rounded border border-blue-200 bg-blue-50/30 p-2">
                          <div className="mb-2 text-[9px] font-semibold text-blue-900">
                            Ausgewählte Prozess-Sequenzen
                          </div>
                          <div className="space-y-1">
                            {batch.orderSequences.slice(0, 8).map((orderSeq: OrderSequence, idx: number) => (
                              <div key={idx} className="text-[8px]">
                                <span className="font-mono text-blue-700">{orderSeq.orderId.slice(0, 12)}...</span>
                                <span className="mx-1 text-muted-foreground">→</span>
                                <span className="text-foreground">
                                  {orderSeq.sequence.slice(0, 5).join(' → ')}
                                  {orderSeq.sequence.length > 5 && ' ...'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Jaccard-Matrix Heatmap */}
                      {hasMatrix && batch.jaccardMatrix.length > 0 && (
                        <div className="rounded border border-purple-200 bg-purple-50/30 p-2">
                          <div className="mb-2 text-[9px] font-semibold text-purple-900">
                            Jaccard-Ähnlichkeitsmatrix: Prozesssequenzbezogen
                          </div>
                          <div className="overflow-x-auto">
                            <div className="inline-flex flex-col text-[8px]">
                              <div className="ml-10 flex gap-1 text-muted-foreground">
                                {batch.jaccardMatrix.map((_: number[], idx: number) => (
                                  <div
                                    key={`col-${idx}`}
                                    className="w-8 truncate text-center"
                                    title={batch.jaccardLabels?.[idx] ?? matrixLabels[idx] ?? `Auftrag ${idx + 1}`}
                                  >
                                    {(batch.jaccardLabels?.[idx] ?? matrixLabels[idx] ?? `#${idx + 1}`).slice(-6)}
                                  </div>
                                ))}
                              </div>
                              {batch.jaccardMatrix.map((row: number[], i: number) => (
                                <div key={`row-${i}`} className="flex items-center gap-1">
                                  <div
                                    className="w-10 truncate text-muted-foreground"
                                    title={batch.jaccardLabels?.[i] ?? matrixLabels[i] ?? `Auftrag ${i + 1}`}
                                  >
                                    {(batch.jaccardLabels?.[i] ?? matrixLabels[i] ?? `#${i + 1}`).slice(-6)}
                                  </div>
                                  {row.map((value: number, j: number) => {
                                    const hue = value * 120
                                    const saturation = 70
                                    const lightness = 85 - value * 30
                                    const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`

                                    return (
                                      <div
                                        key={`${i}-${j}`}
                                        className="flex h-8 w-8 items-center justify-center text-[7px] font-mono border border-white"
                                        style={{ backgroundColor: bgColor }}
                                        title={`${batch.jaccardLabels?.[i] ?? matrixLabels[i] ?? `Auftrag ${i + 1}`} ↔ ${batch.jaccardLabels?.[j] ?? matrixLabels[j] ?? `Auftrag ${j + 1}`}: ${(value * 100).toFixed(0)}%`}
                                      >
                                        {(value * 100).toFixed(0)}
                                      </div>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[7px] text-muted-foreground">
                            <span>0% (unähnlich)</span>
                            <span>100% (identisch)</span>
                          </div>
                        </div>
                      )}

                      {batch.jaccardJustifications && batch.jaccardJustifications.length > 0 && (
                        <div className="rounded border border-purple-200 bg-purple-50/30 p-2">
                          <div className="mb-2 text-[9px] font-semibold text-purple-900">
                            Prozesssequenzen je Auftrag (Batch-Begründung)
                          </div>
                          <div className="space-y-1 text-[8px] font-mono text-muted-foreground max-h-32 overflow-y-auto">
                            {batch.jaccardJustifications.slice(0, 12).map((entry: { orderId: string; sequence: string[] }, idx: number) => (
                              <div key={`${entry.orderId}-${idx}`} className="truncate">
                                <span className="font-semibold text-purple-900 mr-1">
                                  {(batch.jaccardLabels?.[idx] ?? entry.orderId).slice(-8)}
                                </span>
                                {entry.sequence && entry.sequence.length > 0
                                  ? entry.sequence.join(' → ')
                                  : 'Keine Sequenzdaten'}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Baugruppen (Fallback, wenn keine Sequenzen) */}
                      {!hasSequences && hasComponents && (
                        <div className="rounded border border-muted bg-muted/20 p-2">
                          <div className="mb-1 text-[9px] font-semibold text-muted-foreground">
                            Stücklisten (Fallback)
                          </div>
                          <div className="space-y-1">
                            {batch.orderDetails.slice(0, 3).map((order: OrderDetail, orderIdx: number) => (
                              <div key={orderIdx} className="text-[8px]">
                                <div className="font-semibold text-foreground">
                                  {order.productVariant}
                                </div>
                                <div className="text-muted-foreground">
                                  {order.components.length} Baugruppen
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* PIP-specific visualizations (GA Plots) - Based on selected history */}
      {stageKey === 'pip' && (() => {
        const stageLabels: Record<string, string> = {
          'PIP_GA_PLOT_OBJECTIVE': 'GA Konvergenz: Zielfunktion',
          'PIP_GA_PLOT_GANTT': 'Gantt-Chart: Optimierte Sequenz',
          'PIP_GA_PLOT_COMPARISON': 'Vergleich: Baseline vs. Optimiert'
        }

        // Get the selected history entry
        const selectedEntry = historyEntries[historyIndex]
        if (!selectedEntry) return null

        // Find matching pythonDebug from recentSummaries based on createdAt
        let debugData: Array<Record<string, unknown>> | null = null

        if (recentSummaries && Array.isArray(recentSummaries)) {
          const matchingSummary = recentSummaries.find(
            s => s.createdAt === selectedEntry.createdAt
          )
          debugData = matchingSummary?.pythonDebug ?? null
        }

        // Fallback to current pythonDebug if no match found and it's the newest entry
        if (!debugData && historyIndex === 0 && pythonDebug) {
          debugData = pythonDebug
        }

        if (!debugData || !Array.isArray(debugData)) return null

        // Extract plot entries
        const plots = debugData
          .filter((d: any) =>
            d.media &&
            d.media.type === 'image/png' &&
            d.media.encoding === 'base64' &&
            d.media.data &&
            (d.stage === 'PIP_GA_PLOT_OBJECTIVE' ||
             d.stage === 'PIP_GA_PLOT_GANTT' ||
             d.stage === 'PIP_GA_PLOT_COMPARISON')
          )
          .map((entry: any) => ({
            stage: entry.stage as string,
            label: stageLabels[entry.stage] || entry.stage,
            imageData: entry.media.data as string,
          }))

        if (plots.length === 0) return null

        return (
          <div className="rounded border bg-white p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-purple-900">
                Genetischer Algorithmus (GA) - Visualisierungen
              </div>
              <div className="text-[9px] text-muted-foreground">
                {new Date(selectedEntry.createdAt).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mb-2">
              Mittelfristige Terminierung nach Becker (2025) - Monte-Carlo-Optimierung
            </div>
            {plots.map((plot, idx) => (
              <div key={`${plot.stage}-${idx}`} className="space-y-2">
                <div className="text-[10px] font-medium text-purple-700">
                  {plot.label}
                </div>
                <div className="rounded border border-purple-200 bg-purple-50/30 p-2">
                  <img
                    src={`data:image/png;base64,${plot.imageData}`}
                    alt={plot.label}
                    className="w-full h-auto rounded"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* PIP Operations Timeline (Gantt Chart) */}
      {stageKey === 'pip' && (() => {
        // Get the selected history entry
        const selectedEntry = historyEntries[historyIndex]
        if (!selectedEntry) return null

        // Find matching pythonDebug from recentSummaries
        let debugData: Array<Record<string, unknown>> | null = null

        if (recentSummaries && Array.isArray(recentSummaries)) {
          const matchingSummary = recentSummaries.find(
            s => s.createdAt === selectedEntry.createdAt
          )
          debugData = matchingSummary?.pythonDebug ?? null
        }

        // Fallback to current pythonDebug
        if (!debugData && historyIndex === 0 && pythonDebug) {
          debugData = pythonDebug
        }

        if (!debugData || !Array.isArray(debugData)) return null

        // Find PIP_OPS_TIMELINE entry
        const timelineEntry = debugData.find((d: any) => d.stage === 'PIP_OPS_TIMELINE')
        if (!timelineEntry || !timelineEntry.timeline) return null

        const timeline = timelineEntry.timeline as Array<{
          orderId: string
          station: string
          stationType: string
          machineType: string  // fixed, flex
          bgType: string       // Baugruppentyp
          step: string | null
          start: number
          end: number
          duration: number
          setupApplied: boolean
        }>

        const demMachines = (timelineEntry.demMachines as number) || 5
        const monMachines = (timelineEntry.monMachines as number) || 10

        // Group operations by station
        const allStations = Array.from(new Set(timeline.map(op => op.station))).sort()

        // Determine which stations are fixed vs flex (based on first op's machineType)
        const stationTypes = new Map<string, 'fixed' | 'flex'>()
        allStations.forEach(station => {
          const firstOp = timeline.find(op => op.station === station)
          stationTypes.set(station, firstOp?.machineType === 'flex' ? 'flex' : 'fixed')
        })

        // Count fixed/flex per type
        const demStations = allStations.filter(s => s.startsWith('DEM'))
        const monStations = allStations.filter(s => s.startsWith('MON'))
        const demFixed = demStations.filter(s => stationTypes.get(s) === 'fixed').length
        const demFlex = demStations.filter(s => stationTypes.get(s) === 'flex').length
        const monFixed = monStations.filter(s => stationTypes.get(s) === 'fixed').length
        const monFlex = monStations.filter(s => stationTypes.get(s) === 'flex').length

        // Calculate time range
        const allTimes = timeline.flatMap(op => [op.start, op.end])
        const minTime = Math.min(...allTimes, 0)
        const maxTime = Math.max(...allTimes, minTime + 1)
        const timeRange = maxTime - minTime || 1

        // Assign lighter colors to orders for better text readability
        const colors = [
          'rgb(196, 181, 253)', // light purple
          'rgb(147, 197, 253)', // light blue
          'rgb(134, 239, 172)', // light green
          'rgb(253, 186, 116)', // light orange
          'rgb(251, 207, 232)', // light pink
          'rgb(253, 224, 71)',  // light yellow
          'rgb(216, 180, 254)', // light violet
          'rgb(103, 232, 249)', // light cyan
        ]
        const orderColors = new Map<string, string>()
        timeline.forEach(op => {
          if (!orderColors.has(op.orderId)) {
            orderColors.set(op.orderId, colors[orderColors.size % colors.length])
          }
        })

        // Abbreviate BGType for display (e.g., "BGT-PS-Antrieb" -> "Antr")
        const abbreviateBgType = (bgType: string): string => {
          if (!bgType || bgType === 'unknown') return '?'
          // Remove "BGT-PS-" prefix and take first 4 chars
          const cleaned = bgType.replace(/^BGT-PS-/i, '').replace(/^BGT-/i, '')
          return cleaned.slice(0, 4)
        }

        return (
          <div className="rounded border bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-purple-900">
              Operations Timeline (Gantt-Chart)
            </div>
            {/* Station type summary */}
            <div className="mb-3 text-[10px] flex flex-wrap gap-3">
              <div className="flex items-center gap-1">
                <span className="font-medium">Demontage:</span>
                <span className="text-blue-600">{demFixed} fix</span>
                {demFlex > 0 && <span className="text-green-600">+ {demFlex} flex</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">Montage:</span>
                <span className="text-blue-600">{monFixed} fix</span>
                {monFlex > 0 && <span className="text-green-600">+ {monFlex} flex</span>}
              </div>
            </div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {allStations.map((station, stationIdx) => {
                const stationOps = timeline.filter(op => op.station === station)
                const isFixed = stationTypes.get(station) === 'fixed'
                return (
                  <div key={station} className="space-y-0.5">
                    <div className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
                      <span>{station}</span>
                      <span className={`text-[8px] px-1 rounded ${isFixed ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {isFixed ? 'fix' : 'flex'}
                      </span>
                    </div>
                    <div className="relative h-6 border rounded bg-muted/10">
                      {stationOps.map((op, opIdx) => {
                        const left = ((op.start - minTime) / timeRange) * 100
                        const width = ((op.end - op.start) / timeRange) * 100
                        const color = orderColors.get(op.orderId) || 'rgb(200, 200, 200)'
                        const setupIndicator = op.setupApplied ? '⚙' : ''
                        const bgAbbr = abbreviateBgType(op.bgType)
                        // Show abbreviated label: "A1:Antr" (order + bgType)
                        const shortLabel = `${op.orderId.slice(-2)}:${bgAbbr}`
                        return (
                          <div
                            key={opIdx}
                            className="absolute top-0.5 bottom-0.5 rounded text-[7px] text-gray-900 font-medium flex items-center justify-center overflow-hidden"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              backgroundColor: color,
                              border: op.setupApplied ? '2px solid orange' : '1px solid rgba(0,0,0,0.1)',
                            }}
                            title={`${setupIndicator}${op.orderId}: ${op.start.toFixed(0)}-${op.end.toFixed(0)} (${op.duration.toFixed(0)}min) | BGT: ${op.bgType} | ${op.machineType}`}
                          >
                            <span className="truncate px-0.5">{shortLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <div className="mt-2 text-[9px] text-muted-foreground">
                Zeitbereich: {minTime.toFixed(0)} - {maxTime.toFixed(0)} min (Sim-Zeit)
              </div>
            </div>
          </div>
        )
      })()}

      {/* PIP Order Comparison (Vorher/Nachher Debug) */}
      {stageKey === 'pip' && (() => {
        // Get the selected history entry
        const selectedEntry = historyEntries[historyIndex]
        if (!selectedEntry) return null

        // Find matching pythonDebug from recentSummaries
        let debugDataComparison: Array<Record<string, unknown>> | null = null

        if (recentSummaries && Array.isArray(recentSummaries)) {
          const matchingSummary = recentSummaries.find(
            s => s.createdAt === selectedEntry.createdAt
          )
          debugDataComparison = matchingSummary?.pythonDebug ?? null
        }

        // Fallback to current pythonDebug
        if (!debugDataComparison && historyIndex === 0 && pythonDebug) {
          debugDataComparison = pythonDebug
        }

        if (!debugDataComparison || !Array.isArray(debugDataComparison)) return null

        const comparisonEntry = debugDataComparison.find((d: any) => d.stage === 'PIP_ORDER_COMPARISON')
        if (!comparisonEntry) return null

        const orderChanges = comparisonEntry.orderChanges as Array<{
          orderId: string
          inputPos: number
          baselinePos: number
          optimizedPos: number
          delta: number
          changed: boolean
          variantChosen: number
          variantCount: number
        }> || []

        return (
          <div className="rounded border bg-white p-3 mt-3">
            <div className="mb-2 text-xs font-semibold text-blue-900">
              GA Optimierung: Auftragsreihenfolge Vorher/Nachher
            </div>
            <div className="mb-2 text-[10px] text-muted-foreground">
              Mutation-Rate: {(comparisonEntry.mutationRate * 100).toFixed(0)}% |
              Generationen: {comparisonEntry.generations} |
              Population: {comparisonEntry.population} |
              <span className={comparisonEntry.totalChanged > 0 ? "text-green-600 font-semibold" : "text-orange-600"}>
                {' '}{comparisonEntry.totalChanged}/{comparisonEntry.totalOrders} Aufträge umpositioniert
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-[10px] w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2">Auftrag</th>
                    <th className="text-center py-1 px-2">Input (FIFO)</th>
                    <th className="text-center py-1 px-2">Baseline (EDD)</th>
                    <th className="text-center py-1 px-2">Optimiert (GA)</th>
                    <th className="text-center py-1 px-2">Delta</th>
                    <th className="text-center py-1 px-2">Sequenz-Variante</th>
                  </tr>
                </thead>
                <tbody>
                  {orderChanges.map((change, idx) => (
                    <tr key={change.orderId} className={change.changed ? "bg-green-50" : ""}>
                      <td className="py-1 px-2 font-mono">{change.orderId.slice(-4)}</td>
                      <td className="text-center py-1 px-2">{change.inputPos}</td>
                      <td className="text-center py-1 px-2">{change.baselinePos}</td>
                      <td className="text-center py-1 px-2 font-semibold">{change.optimizedPos}</td>
                      <td className={`text-center py-1 px-2 ${change.delta && change.delta !== 0 ? (change.delta < 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {change.delta !== 0 ? (change.delta > 0 ? `+${change.delta}` : change.delta) : '-'}
                      </td>
                      <td className="text-center py-1 px-2">
                        {change.variantCount > 1 ? (
                          <span className="bg-purple-100 px-1 rounded">
                            V{change.variantChosen + 1}/{change.variantCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[9px] text-muted-foreground">
              <strong>Legende:</strong> Input=Ankunftsreihenfolge | Baseline=EDD-Sortiert | Optimiert=GA-Ergebnis |
              Delta negativ (grün) = Auftrag wurde nach vorne verschoben
            </div>
          </div>
        )
      })()}

      {/* PIPO-specific visualizations with history */}
      {stageKey === 'pipo' && (() => {
        const stageLabels: Record<string, string> = {
          'PIPO_MOAHS_PLOT_ITERATIONS': 'MOAHS Konvergenz über Iterationen',
          'PIPO_MOAHS_PLOT_GANTT': 'Gantt-Chart: Optimierter Plan'
        }

        // Get PIPO runs from recentSummaries
        const pipoRuns = (recentSummaries ?? [])
          .filter(s => s.stage === 'pipo' && s.pythonDebug)
          .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)) // Newest first
          .slice(0, 10) // Last 10 runs

        if (pipoRuns.length === 0) return null

        // Use historyIndex to select which run to show (bounded)
        const selectedRunIdx = Math.min(historyIndex, pipoRuns.length - 1)
        const selectedRun = pipoRuns[selectedRunIdx]

        if (!selectedRun?.pythonDebug || !Array.isArray(selectedRun.pythonDebug)) return null

        // Extract plot entries
        const plots = selectedRun.pythonDebug
          .filter((d: any) =>
            d.media &&
            d.media.type === 'image/png' &&
            d.media.encoding === 'base64' &&
            d.media.data &&
            (d.stage === 'PIPO_MOAHS_PLOT_ITERATIONS' ||
             d.stage === 'PIPO_MOAHS_PLOT_GANTT')
          )
          .map((entry: any) => ({
            stage: entry.stage as string,
            label: stageLabels[entry.stage] || entry.stage,
            imageData: entry.media.data as string,
          }))

        if (plots.length === 0) return null

        return (
          <div className="space-y-3">
            {/* History navigation for PIPO runs */}
            {pipoRuns.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {pipoRuns.map((run, idx) => (
                  <button
                    key={`pipo-run-${idx}`}
                    onClick={() => setHistoryIndex(idx)}
                    className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      idx === selectedRunIdx
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                  >
                    Run #{pipoRuns.length - idx}
                    <div className="text-[8px] opacity-75">
                      {new Date(run.createdAt).toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="rounded border bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-purple-900">
                  MOAHS-Algorithmus - Visualisierungen
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {new Date(selectedRun.createdAt).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">
                Kurzfristige Feinterminierung nach Becker (2025) - MOAHS Multi-Objective Optimization
                {pipoRuns.length > 1 && ` • Run ${pipoRuns.length - selectedRunIdx} von ${pipoRuns.length}`}
              </div>
              {plots.map((plot, idx) => (
                <div key={`${plot.stage}-${idx}`} className="space-y-2">
                  <div className="text-[10px] font-medium text-purple-700">
                    {plot.label}
                  </div>
                  <div className="rounded border border-purple-200 bg-purple-50/30 p-2">
                    <img
                      src={`data:image/png;base64,${plot.imageData}`}
                      alt={plot.label}
                      className="w-full h-auto rounded"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* OLD PIPO SVG rendering - keeping for reference, will remove later */}
      {false && stageKey === 'pipo' && (() => {
        const debug = Array.isArray(pythonDebug) ? pythonDebug : []
        const iterationData = debug.find((d: any) => d.stage === 'PIPO_ITERATION_SERIES')
        const ganttData = debug.find((d: any) => d.stage === 'PIPO_GANTT')

        return (
          <>
            {/* Iteration Charts */}
            {iterationData && (
              <div className="rounded border bg-white p-3 space-y-3">
                <div className="text-xs font-semibold text-purple-900">
                  MOAHS-Konvergenz über Iterationen
                </div>

                {/* Makespan Chart */}
                {iterationData.makespan && iterationData.makespan.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Durchlaufzeit (Makespan)
                    </div>
                    <div className="relative h-20 border rounded bg-muted/10 p-2">
                      <svg className="w-full h-full">
                        {(() => {
                          const data = iterationData.makespan as [number, number][]
                          const maxY = Math.max(...data.map(d => d[1]), 1)
                          const minY = Math.min(...data.map(d => d[1]), 0)
                          const range = maxY - minY || 1
                          const points = data.map(([x, y], i) => {
                            const xPos = (i / (data.length - 1 || 1)) * 100
                            const yPos = 100 - ((y - minY) / range) * 100
                            return `${xPos},${yPos}`
                          }).join(' ')
                          return (
                            <polyline
                              points={points}
                              fill="none"
                              stroke="rgb(147, 51, 234)"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        })()}
                      </svg>
                    </div>
                  </div>
                )}

                {/* Tardiness Chart */}
                {iterationData.tardiness && iterationData.tardiness.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Lieferterminverzug (Tardiness)
                    </div>
                    <div className="relative h-20 border rounded bg-muted/10 p-2">
                      <svg className="w-full h-full">
                        {(() => {
                          const data = iterationData.tardiness as [number, number][]
                          const maxY = Math.max(...data.map(d => d[1]), 1)
                          const minY = Math.min(...data.map(d => d[1]), 0)
                          const range = maxY - minY || 1
                          const points = data.map(([x, y], i) => {
                            const xPos = (i / (data.length - 1 || 1)) * 100
                            const yPos = 100 - ((y - minY) / range) * 100
                            return `${xPos},${yPos}`
                          }).join(' ')
                          return (
                            <polyline
                              points={points}
                              fill="none"
                              stroke="rgb(234, 88, 12)"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        })()}
                      </svg>
                    </div>
                  </div>
                )}

                {/* Idle Time Chart */}
                {iterationData.idleTime && iterationData.idleTime.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Leerlaufzeit (Idle Time)
                    </div>
                    <div className="relative h-20 border rounded bg-muted/10 p-2">
                      <svg className="w-full h-full">
                        {(() => {
                          const data = iterationData.idleTime as [number, number][]
                          const maxY = Math.max(...data.map(d => d[1]), 1)
                          const minY = Math.min(...data.map(d => d[1]), 0)
                          const range = maxY - minY || 1
                          const points = data.map(([x, y], i) => {
                            const xPos = (i / (data.length - 1 || 1)) * 100
                            const yPos = 100 - ((y - minY) / range) * 100
                            return `${xPos},${yPos}`
                          }).join(' ')
                          return (
                            <polyline
                              points={points}
                              fill="none"
                              stroke="rgb(34, 197, 94)"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        })()}
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gantt Chart */}
            {ganttData && ganttData.operations && ganttData.stations && (
              <div className="rounded border bg-white p-3">
                <div className="mb-2 text-xs font-semibold text-purple-900">
                  Gantt-Chart (Ausgewählter Plan)
                </div>
                {(() => {
                  const ops = ganttData.operations as Array<{
                    stationId: string
                    orderId: string
                    start: number
                    end: number
                    expectedDuration: number
                    resources: string[]
                  }>
                  const stations = ganttData.stations as string[]
                  const startTime = ganttData.startTime as number

                  const allTimes = ops.flatMap(op => [op.start, op.end])
                  const minTime = Math.min(...allTimes, startTime)
                  const maxTime = Math.max(...allTimes, startTime)
                  const timeRange = maxTime - minTime || 1

                  const colors = [
                    'rgb(147, 51, 234)',
                    'rgb(59, 130, 246)',
                    'rgb(34, 197, 94)',
                    'rgb(234, 88, 12)',
                    'rgb(236, 72, 153)',
                    'rgb(245, 158, 11)',
                  ]

                  const orderColors = new Map<string, string>()
                  ops.forEach(op => {
                    if (!orderColors.has(op.orderId)) {
                      orderColors.set(op.orderId, colors[orderColors.size % colors.length])
                    }
                  })

                  return (
                    <div className="space-y-1">
                      {stations.map((station, stationIdx) => {
                        const stationOps = ops.filter(op => op.stationId === station)
                        return (
                          <div key={station} className="space-y-0.5">
                            <div className="text-[9px] font-medium text-muted-foreground">
                              {station}
                            </div>
                            <div className="relative h-6 border rounded bg-muted/10">
                              {stationOps.map((op, opIdx) => {
                                const left = ((op.start - minTime) / timeRange) * 100
                                const width = ((op.end - op.start) / timeRange) * 100
                                const color = orderColors.get(op.orderId) || 'rgb(100, 100, 100)'
                                return (
                                  <div
                                    key={opIdx}
                                    className="absolute top-0.5 bottom-0.5 rounded text-[7px] text-white flex items-center justify-center overflow-hidden"
                                    style={{
                                      left: `${left}%`,
                                      width: `${width}%`,
                                      backgroundColor: color,
                                    }}
                                    title={`${op.orderId}: ${op.start.toFixed(0)} - ${op.end.toFixed(0)} (${op.expectedDuration.toFixed(0)}min)`}
                                  >
                                    <span className="truncate px-1">{op.orderId}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      <div className="mt-2 text-[9px] text-muted-foreground">
                        Zeitbereich: {minTime.toFixed(0)} - {maxTime.toFixed(0)} min
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
