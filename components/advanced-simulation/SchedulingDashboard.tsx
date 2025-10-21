'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, Activity, Timer, Layers3, Trash2 } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from 'recharts'

type SchedulingStageKey = 'pap' | 'pip' | 'pipo'

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

interface RecentSummary {
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
  pythonDiffCount?: number
  pythonAssignments?: Array<{ orderId: string; eta: number | null; priorityScore: number | null }>
}

interface SchedulingInsightsResponse {
  stats: Record<SchedulingStageKey, StageStats>
  recentSummaries: RecentSummary[]
  insights: Partial<
    Record<
      SchedulingStageKey,
      {
        python?: {
          createdAt: string
          details: Record<string, any> | null
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
          simMinute: number | null
        }
      }
    >
  >
  lastUpdated: string
}

const stageLabels: Record<SchedulingStageKey, string> = {
  pap: 'Pre-Acceptance (PAP)',
  pip: 'Pre-Inspection (PIP)',
  pipo: 'Post-Inspection (PIPo)',
}

const stageAccent: Record<SchedulingStageKey, string> = {
  pap: 'text-sky-700',
  pip: 'text-emerald-700',
  pipo: 'text-violet-700',
}

const stageBadge: Record<SchedulingStageKey, string> = {
  pap: 'bg-sky-100 text-sky-700 border-sky-200',
  pip: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pipo: 'bg-violet-100 text-violet-700 border-violet-200',
}

interface SchedulingDashboardProps {
  factoryId: string
}

export function SchedulingDashboard({ factoryId }: SchedulingDashboardProps) {
  const [data, setData] = useState<SchedulingInsightsResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const sessionStartRef = useRef<number | null>(null)

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
      // Reset the view
      sessionStartRef.current = null
      setData(null)
      await fetchData({ reset: false })
    } catch (err) {
      console.error('[SchedulingDashboard] Failed to clear logs:', err)
      setError('Failed to clear scheduling logs')
    } finally {
      setLoading(false)
    }
  }, [factoryId])

  const fetchData = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (!factoryId) return
      try {
        if (reset) {
          sessionStartRef.current = Date.now()
          setData(null)
          setError(null)
        }
        setLoading(true)
        const params = new URLSearchParams({ factoryId })
        if (sessionStartRef.current !== null) {
          params.append('since', sessionStartRef.current.toString())
        }
        const res = await fetch(`/api/scheduling-summary?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          throw new Error(`Status ${res.status}`)
        }
        const json = (await res.json()) as SchedulingInsightsResponse
        setData(json)
        setError(null)
      } catch (err) {
        console.error('[SchedulingDashboard] Failed to load summary:', err)
        setError('Failed to load scheduling metrics')
      } finally {
        setLoading(false)
      }
    },
    [factoryId]
  )

  useEffect(() => {
    if (!factoryId) return
    // Don't set sessionStartRef on initial load - load all historical data
    fetchData({ reset: false })
    const interval = setInterval(() => fetchData(), 5000)
    return () => clearInterval(interval)
  }, [factoryId, fetchData])

  const hasData = useMemo(() => {
    if (!data) return false
    return (
      Object.values(data.stats).some((stat) => stat.runs > 0) ||
      data.recentSummaries.length > 0
    )
  }, [data])

  const chartData = useMemo(() => {
    if (!data || data.recentSummaries.length === 0) return []
    const reversed = [...data.recentSummaries].reverse()
    return reversed.map((entry, idx) => {
      const diff = entry.pythonDiffCount ?? entry.reorderCount ?? 0
      return {
        index: idx,
        simMinute: entry.simMinute ?? idx,
        pap: entry.stage === 'pap' ? diff : null,
        pip: entry.stage === 'pip' ? diff : null,
        pipo: entry.stage === 'pipo' ? diff : null,
      }
    })
  }, [data])

  const allReordersZero = useMemo(() => {
    if (chartData.length === 0) return false
    return chartData.every((row) => (row.pap ?? 0) === 0 && (row.pip ?? 0) === 0 && (row.pipo ?? 0) === 0)
  }, [chartData])

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-purple-600" />
            Scheduling Performance
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Live metrics for PAP, PIP and PIPo scheduling runs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Letzte Aktualisierung: {new Date(data.lastUpdated).toLocaleTimeString()}
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
            onClick={() => fetchData({ reset: true })}
            disabled={loading}
            title="Verlauf leeren und neu laden"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">Scheduling metrics werden geladen…</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(stageLabels) as SchedulingStageKey[]).map((stageKey) => {
                const stats = data.stats[stageKey]
                return (
                  <div
                    key={stageKey}
                    className="rounded-lg border border-purple-200 bg-purple-50/40 p-4"
                  >
                    <div className={`text-xs font-semibold uppercase ${stageAccent[stageKey]}`}>
                      {stageLabels[stageKey]}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${stageBadge[stageKey]} font-semibold`}
                      >
                        Läufe: {stats.runs}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Letzter Lauf: {stats.lastRun !== null ? `t=${stats.lastRun}min` : '–'}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-purple-900">
                      <span>Letzte Freigaben</span>
                      <span className="text-right font-medium">{stats.lastReleased}</span>
                      <span>Summe Freigaben</span>
                      <span className="text-right">{stats.totalReleased}</span>
                      <span>Letzte Änderungen</span>
                      <span className="text-right">{stats.lastReorder}</span>
                      <span>Summe Änderungen</span>
                      <span className="text-right">{stats.totalReorder}</span>
                      <span>Letzte Python-Diff</span>
                      <span className="text-right">{stats.lastPythonDiff}</span>
                      <span>Summe Python-Diff</span>
                      <span className="text-right">{stats.totalPythonDiff}</span>
                      <span>Queue-Größe (zuletzt)</span>
                      <span className="text-right">{stats.lastQueueSize}</span>
                      <span>Batches (zuletzt)</span>
                      <span className="text-right">{stats.lastBatches}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border rounded-lg">
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-900">
                  🐍 Python Script Execution Status
                </div>
              </div>
              <div className="p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {(Object.keys(stageLabels) as SchedulingStageKey[]).map((stageKey) => {
                    const insight = data.insights?.[stageKey]
                    const scriptExec = insight?.python?.details?._scriptExecution
                    const hasExecution = scriptExec && scriptExec.scriptPath

                    return (
                      <div
                        key={stageKey}
                        className={`rounded-lg border p-3 text-xs ${hasExecution ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div className={`font-semibold mb-2 ${stageAccent[stageKey]}`}>
                          {stageLabels[stageKey]}
                        </div>
                        {hasExecution ? (
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-1">
                              <span className="text-gray-600 min-w-[50px]">Script:</span>
                              <span className="font-mono text-[10px] break-all">
                                {scriptExec.scriptPath.split('/').pop()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-600 min-w-[50px]">Status:</span>
                              <Badge
                                variant="outline"
                                className={scriptExec.status === 'success' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}
                              >
                                {scriptExec.status === 'success' ? '✅ Success' : '❌ Failed'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-600 min-w-[50px]">Time:</span>
                              <span className="text-gray-800">
                                {new Date(scriptExec.startTime).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-600 min-w-[50px]">Duration:</span>
                              <span className="font-medium text-purple-700">
                                {scriptExec.endTime - scriptExec.startTime}ms
                              </span>
                            </div>
                            <div className="pt-1 border-t border-dashed">
                              <div className="text-[10px] text-gray-500 font-mono break-all">
                                {scriptExec.scriptPath}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 italic">
                            Noch kein Python-Script ausgeführt
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="border rounded-lg">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Timer className="h-4 w-4" /> Letzte Terminierungen
                </div>
                <span className="text-xs text-muted-foreground">
                  {data.recentSummaries.length} Einträge
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y text-xs">
                {data.recentSummaries.length === 0 ? (
                  <div className="p-4 text-muted-foreground">Noch keine Terminierungen erfasst.</div>
                ) : (
                  data.recentSummaries.map((entry) => (
                    <div key={entry.id} className="px-4 py-2 space-y-1">
                      <div className="grid grid-cols-7 gap-2">
                        <div className={`${stageAccent[entry.stage]} font-semibold`}>
                          {stageLabels[entry.stage]}
                        </div>
                        <div>t={entry.simMinute ?? '–'}min</div>
                        <div>Released: {entry.releasedCount}</div>
                        <div>Changes: {entry.reorderCount}</div>
                        <div>PyDiff: {entry.pythonDiffCount ?? entry.reorderCount ?? 0}</div>
                        <div>Queue: {entry.queueSize}</div>
                        <div>Batches: {entry.batchCount}</div>
                      </div>
                      {Array.isArray(entry.orderSequence) && entry.orderSequence.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Seq: {entry.orderSequence.slice(0, 6).join(', ')}
                          {entry.orderSequence.length > 6 ? ' …' : ''}
                        </div>
                      )}
                      {Array.isArray(entry.pythonReleaseList) && entry.pythonReleaseList.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Python Release: {entry.pythonReleaseList.slice(0, 6).join(', ')}
                          {entry.pythonReleaseList.length > 6 ? ' …' : ''}
                        </div>
                      )}
                      {Array.isArray(entry.pythonAssignments) && entry.pythonAssignments.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          ETA Seq:{' '}
                          {entry.pythonAssignments
                            .slice(0, 4)
                            .map((assign) => `${assign.orderId}:${assign.eta ?? '–'}`)
                            .join(', ')}
                          {entry.pythonAssignments.length > 4 ? ' …' : ''}
                        </div>
                      )}
                      {Array.isArray(entry.pythonDebug) && entry.pythonDebug.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Debug: {entry.pythonDebug
                            .slice(0, 2)
                            .map((d: any, idx: number) => {
                              const stage = typeof d?.stage === 'string' ? d.stage : `step-${idx + 1}`
                              const message =
                                typeof d?.message === 'string'
                                  ? d.message
                                  : JSON.stringify(d)
                              return `${stage}: ${message}`
                            })
                            .join(' | ')}
                          {entry.pythonDebug.length > 2 ? ' …' : ''}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-purple-600" /> Reorder-Verlauf (nach Stage)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-60">
                {chartData.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Noch keine Daten für Reorder-Verlauf verfügbar.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.5)" />
                      <XAxis dataKey="simMinute" tick={{ fontSize: 10 }} label={{ value: 'Sim-Minute', position: 'insideBottomRight', offset: -6, fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} label={{ value: 'Reorder Count', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10 }} />
                      <Tooltip formatter={(value: any) => [value ?? 0, 'Reorders']} labelFormatter={(label) => `t=${label}min`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="pap" name="PAP" stroke="#0284c7" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="pip" name="PIP" stroke="#059669" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="pipo" name="PIPo" stroke="#7c3aed" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {allReordersZero && chartData.length > 0 && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Keine Reorder-Änderungen erkannt – die Python-Ausgabe entspricht aktuell der Queue-Reihenfolge.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="border rounded-lg">
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/50 text-sm font-semibold">
                <Layers3 className="h-4 w-4" /> Optimierungs-Einblicke
              </div>
              <div className="grid gap-4 md:grid-cols-3 p-4">
                {(Object.keys(stageLabels) as SchedulingStageKey[]).map((stageKey) => {
                  const insight = data.insights?.[stageKey]
                  const lastSummary = insight?.lastSummary
                  const pythonDetails = insight?.python?.details
                  const pythonDebug = insight?.python?.debug
                  const pythonTimestamp = insight?.python?.createdAt
                    ? new Date(insight.python.createdAt).toLocaleTimeString()
                    : '–'
                  return (
                    <div key={stageKey} className="rounded-lg border border-dashed p-3 text-xs space-y-2">
                      <div className={`font-semibold ${stageAccent[stageKey]}`}>
                        {stageLabels[stageKey]}
                      </div>
                      {lastSummary ? (
                        <div className="space-y-1">
                          <div className="font-medium text-purple-900">Letzte Freigabe</div>
                          <div>t={lastSummary.simMinute ?? '–'}min • Released: {lastSummary.releasedCount}</div>
                          <div>Changes: {lastSummary.reorderCount} • Queue: {lastSummary.queueSize}</div>
                          {Array.isArray(lastSummary.orderSequence) && lastSummary.orderSequence.length > 0 && (
                            <div>
                              Sequenz:{' '}
                              {lastSummary.orderSequence.slice(0, 6).join(', ')}
                              {lastSummary.orderSequence.length > 6 ? ' …' : ''}
                            </div>
                          )}
                          {Array.isArray(lastSummary.pythonReleaseList) && lastSummary.pythonReleaseList.length > 0 && (
                            <div>
                              Python Release:{' '}
                              {lastSummary.pythonReleaseList.slice(0, 6).join(', ')}
                              {lastSummary.pythonReleaseList.length > 6 ? ' …' : ''}
                            </div>
                          )}
                          {Array.isArray(lastSummary.pythonAssignments) && lastSummary.pythonAssignments.length > 0 && (
                            <div>
                              ETA Seq:{' '}
                              {lastSummary.pythonAssignments
                                .slice(0, 6)
                                .map((assign) => `${assign.orderId}:${assign.eta ?? '–'}`)
                                .join(', ')}
                              {lastSummary.pythonAssignments.length > 6 ? ' …' : ''}
                            </div>
                          )}
                          {Array.isArray(lastSummary.pythonEtaList) && lastSummary.pythonEtaList.length > 0 && (
                            <div>
                              ETA (Top):{' '}
                              {lastSummary.pythonEtaList
                                .slice(0, 4)
                                .map((eta) => `${eta.orderId}:${eta.eta}`)
                                .join(', ')}
                              {lastSummary.pythonEtaList.length > 4 ? ' …' : ''}
                            </div>
                          )}
                          <div>Python Diff: {lastSummary.pythonDiffCount ?? lastSummary.reorderCount ?? 0}</div>
                          {Array.isArray(lastSummary.pythonDebug) && lastSummary.pythonDebug.length > 0 && (
                            <div>
                              Debug:{' '}
                              {lastSummary.pythonDebug
                                .slice(0, 2)
                                .map((d: any, idx: number) => {
                                  const stage = typeof d?.stage === 'string' ? d.stage : `step-${idx + 1}`
                                  const message =
                                    typeof d?.message === 'string'
                                      ? d.message
                                      : JSON.stringify(d)
                                  return `${stage}: ${message}`
                                })
                                .join(' | ')}
                              {lastSummary.pythonDebug.length > 2 ? ' …' : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">Noch keine Freigabe protokolliert.</div>
                      )}
                      {pythonDetails ? (
                        <div className="space-y-1 pt-2 border-t border-dashed">
                          <div className="font-medium text-purple-900">Python-Analyse</div>
                          {pythonDetails.batchCount !== undefined && <div>Batches: {pythonDetails.batchCount}</div>}
                          {pythonDetails.averageBatchSize !== undefined && (
                            <div>⌀ Batchgröße: {pythonDetails.averageBatchSize}</div>
                          )}
                          {pythonDetails.releaseListCount !== undefined && (
                            <div>Release-Liste: {pythonDetails.releaseListCount}</div>
                          )}
                          {pythonDetails.paretoSize !== undefined && (
                            <div>Pareto-Punkte: {pythonDetails.paretoSize}</div>
                          )}
                          {pythonDetails.selectedPlanId && <div>Plan: {pythonDetails.selectedPlanId}</div>}
                          {Array.isArray(pythonDetails.topBatches) && pythonDetails.topBatches.length > 0 && (
                            <div>
                              Top Batches:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px] space-y-1">
                                {pythonDetails.topBatches.map((batch: any, idx: number) => (
                                  <div key={idx} className="border-b border-dashed last:border-none pb-1 last:pb-0">
                                    <div>ID: {batch.id || '–'} • Size: {batch.size}</div>
                                    {Array.isArray(batch.sampleOrders) && batch.sampleOrders.length > 0 && (
                                      <div>Orders: {batch.sampleOrders.join(', ')}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {Array.isArray(pythonDetails.etaPreview) && pythonDetails.etaPreview.length > 0 && (
                            <div>
                              ETA Vorschau:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px] space-y-1">
                                {pythonDetails.etaPreview.map((eta: any, idx: number) => (
                                  <div key={idx}>
                                    {eta.orderId}: {eta.eta}m
                                    {eta.lower !== undefined && eta.upper !== undefined &&
                                      ` (Range ${eta.lower}-${eta.upper})`}
                                    {eta.confidence !== null && ` • p=${eta.confidence}`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {Array.isArray(pythonDetails.topPriorities) && pythonDetails.topPriorities.length > 0 && (
                            <div>
                              Prioritäten:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px] space-y-1">
                                {pythonDetails.topPriorities.map((p: any, idx: number) => (
                                  <div key={idx}>
                                    {p.orderId}: {p.priority?.toFixed?.(2) ?? p.priority}
                                    {p.dueDate ? ` • due ${p.dueDate}` : ''}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {Array.isArray(pythonDetails.releaseListPreview) && pythonDetails.releaseListPreview.length > 0 && (
                            <div>
                              Release-Liste:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px]">
                                {pythonDetails.releaseListPreview.join(', ')}
                              </div>
                            </div>
                          )}
                          {Array.isArray(pythonDetails.releasedOpsPreview) && pythonDetails.releasedOpsPreview.length > 0 && (
                            <div>
                              Freigegebene Operationen:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px] space-y-1">
                                {pythonDetails.releasedOpsPreview.map((op: any, idx: number) => (
                                  <div key={idx}>
                                    {op.id || 'op'} • Station {op.station} • Dauer {op.duration}m
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {Array.isArray(pythonDetails.paretoPreview) && pythonDetails.paretoPreview.length > 0 && (
                            <div>
                              Pareto-Pläne:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px] space-y-1">
                                {pythonDetails.paretoPreview.map((plan: any, idx: number) => (
                                  <div key={idx}>
                                    {plan.id || 'plan'} • Makespan: {plan.makespan ?? 'n/a'} • Tardiness: {plan.tardiness ?? 'n/a'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {Array.isArray(pythonDebug) && pythonDebug.length > 0 && (
                            <div>
                              Debug:
                              <div className="mt-1 rounded border border-purple-100 p-2 text-[10px] space-y-1">
                                {pythonDebug.slice(0, 6).map((entry: any, idx: number) => (
                                  <div key={idx}>
                                    {entry.stage || `step-${idx + 1}`}: {entry.message ?? JSON.stringify(entry)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="text-muted-foreground">
                            Letzter Python-Run: {pythonTimestamp}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            {!hasData && (
              <div className="text-xs text-muted-foreground">
                Noch keine Terminierungsdurchläufe registriert. Sobald neue Batches
                freigegeben werden, erscheinen hier Live-Metriken.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
