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

interface StageSummaryInsight {
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
  simMinute: number | null
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

interface QueueMonitorData {
  pap: StageData
  pip: StageData
  pipo: StageData
  lastUpdated: string
  insights?: Record<SchedulingStageKey, StageInsight>
  summaryUpdated?: string
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

      const [queueRes, summaryRes] = await Promise.all([
        fetch(`/api/queue-monitor?factoryId=${factoryId}`),
        fetch(`/api/scheduling-summary?factoryId=${factoryId}`),
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
      } else {
        console.warn(
          '[SchedulingDashboard] scheduling-summary request failed:',
          summaryRes.status
        )
      }

      setData({
        ...queueData,
        insights,
        summaryUpdated,
      })
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
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StageDetailsDisplay({
  stageKey,
  insight,
}: {
  stageKey: SchedulingStageKey
  insight: StageInsight | undefined
}) {
  if (!insight?.python && !insight?.lastSummary) {
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

  const pythonDetails = insight.python?.details ?? null
  const pythonDebug = insight.python?.debug ?? []
  const lastSummary = insight.lastSummary

  const scriptInfo = pythonDetails?._scriptExecution ?? null
  const scriptPath =
    typeof scriptInfo?.scriptPath === 'string' ? scriptInfo.scriptPath : undefined
  const scriptName = scriptPath ? scriptPath.split(/[\\/]/).pop() : undefined
  const scriptDuration =
    typeof scriptInfo?.startTime === 'number' && typeof scriptInfo?.endTime === 'number'
      ? scriptInfo.endTime - scriptInfo.startTime
      : null

  const sanitizedPythonDetails =
    pythonDetails && typeof pythonDetails === 'object'
      ? Object.fromEntries(
          Object.entries(pythonDetails).filter(([key]) => key !== '_scriptExecution')
        )
      : null

  const renderList = (obj: Record<string, any>) => {
    return (
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        {Object.entries(obj).map(([key, value]) => {
          if (key.startsWith('_')) return null
          if (value === null || value === undefined) return null
          if (Array.isArray(value) && value.length === 0) return null
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .trim()
          let display: ReactNode = value as ReactNode
          if (Array.isArray(value)) {
            if (typeof value[0] === 'object') {
              display = (
                <pre className="mt-1 rounded bg-muted p-2 text-[10px] text-muted-foreground">
                  {JSON.stringify(value.slice(0, 8), null, 2)}
                </pre>
              )
            } else {
              display = value.join(', ')
            }
          } else if (typeof value === 'object') {
            display = (
              <pre className="mt-1 rounded bg-muted p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(value, null, 2)}
              </pre>
            )
          }
          return (
            <div key={key}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
              <div className="text-xs text-foreground">{display}</div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderDebugEntry = (entry: Record<string, any>, index: number) => {
    const stage = typeof entry.stage === 'string' ? entry.stage : `Debug-${index + 1}`
    const media = entry.media
    const mediaData =
      media && typeof media === 'object' && typeof media.data === 'string'
        ? media.data
        : null

    return (
      <div key={`${stage}-${index}`} className="rounded-md border p-3 text-xs">
        <div className="font-semibold text-purple-900">{stage}</div>
        <div className="mt-1 space-y-2">
          {mediaData ? (
            <div className="rounded bg-white p-2">
              <img
                src={`data:${media.type ?? 'image/png'};base64,${mediaData}`}
                alt={stage}
                className="mx-auto max-h-64"
              />
            </div>
          ) : null}
            <pre className="rounded bg-muted p-2 text-[10px] text-muted-foreground">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(entry).filter(
                    ([key]) => key !== 'media' && key !== 'stage'
                  )
                ),
                null,
                2
              )}
            </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/30 p-4">
      {lastSummary && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-purple-900">
            Letzte Freigabe {lastSummary.simMinute !== null ? `@ t=${lastSummary.simMinute}min` : ''}
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded border bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Freigegeben
              </div>
              <div className="text-lg font-semibold">{lastSummary.releasedCount}</div>
            </div>
            <div className="rounded border bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Änderungen
              </div>
              <div className="text-lg font-semibold">{lastSummary.reorderCount}</div>
            </div>
            <div className="rounded border bg-white p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Python Diff
              </div>
              <div className="text-lg font-semibold">
                {lastSummary.pythonDiffCount ?? lastSummary.reorderCount}
              </div>
            </div>
          </div>
          {lastSummary.pythonPriorities && lastSummary.pythonPriorities.length > 0 && (
            <div className="rounded border bg-white p-3">
              <div className="text-xs font-semibold text-purple-900">Prioritäten</div>
              <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-muted p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(lastSummary.pythonPriorities.slice(0, 12), null, 2)}
              </pre>
            </div>
          )}
          {lastSummary.pythonBatches && lastSummary.pythonBatches.length > 0 && (
            <div className="rounded border bg-white p-3">
              <div className="text-xs font-semibold text-purple-900">Batches</div>
              <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-muted p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(lastSummary.pythonBatches.slice(0, 8), null, 2)}
              </pre>
            </div>
          )}
          {lastSummary.pythonEtaList && lastSummary.pythonEtaList.length > 0 && (
            <div className="rounded border bg-white p-3">
              <div className="text-xs font-semibold text-purple-900">ETA Vorschau</div>
              <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-muted p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(lastSummary.pythonEtaList.slice(0, 8), null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {(scriptName || scriptPath) && (
        <div className="space-y-1 rounded border bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Python Skript
          </div>
          <div className="text-xs font-semibold text-purple-900">
            {scriptName ?? 'Unbekanntes Skript'}
          </div>
          {scriptPath && (
            <div className="break-all text-[10px] text-muted-foreground">{scriptPath}</div>
          )}
          {typeof scriptInfo?.status === 'string' && (
            <div className="text-[10px] text-muted-foreground">
              Status: <span className="font-medium text-foreground">{scriptInfo.status}</span>
            </div>
          )}
          {scriptDuration !== null && scriptDuration >= 0 && (
            <div className="text-[10px] text-muted-foreground">
              Dauer: <span className="font-medium text-foreground">{scriptDuration} ms</span>
            </div>
          )}
        </div>
      )}

      {sanitizedPythonDetails && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-purple-900">Script KPIs</div>
          {renderList(sanitizedPythonDetails)}
        </div>
      )}

      {pythonDebug.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-purple-900">Debug / Heuristik</div>
          <div className="grid gap-2">
            {pythonDebug.slice(0, 6).map((entry, idx) => renderDebugEntry(entry, idx))}
            {pythonDebug.length > 6 && (
              <div className="text-[10px] text-muted-foreground">
                … {pythonDebug.length - 6} weitere Debug-Einträge
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
