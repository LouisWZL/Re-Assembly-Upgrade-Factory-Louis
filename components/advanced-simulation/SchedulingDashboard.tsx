'use client'

import { useCallback, useEffect, useState } from 'react'
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

interface QueueMonitorData {
  pap: StageData
  pip: StageData
  pipo: StageData
  lastUpdated: string
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

      const res = await fetch(`/api/queue-monitor?factoryId=${factoryId}`)
      if (!res.ok) {
        throw new Error(`Status ${res.status}`)
      }

      const result = await res.json()
      setData(result)
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
                            <div className="rounded-md border bg-muted/50 p-4">
                              <p className="text-sm text-muted-foreground">
                                Details zur Terminierung (Batches, ETAs, Priorities) werden hier
                                angezeigt.
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Platzhalter - wird später implementiert
                              </p>
                            </div>
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
