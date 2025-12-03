'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getQueueStatus, type QueueType } from '@/app/actions/queue.actions'
import { Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QueueViewerProps {
  queueType: QueueType
  title: string
  autoRefresh?: boolean
  refreshInterval?: number
}

export function QueueViewer({
  queueType,
  title,
  autoRefresh = true,
  refreshInterval = 2000
}: QueueViewerProps) {
  const [queueData, setQueueData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQueueData = async () => {
    try {
      // Get current sim time from localStorage (updated by the running simulation)
      const currentSimMinute = parseInt(localStorage.getItem('currentSimMinute') || '0', 10)
      const result = await getQueueStatus(queueType, currentSimMinute)
      if (result.success && result.data) {
        setQueueData(result.data)
        setError(null)
      } else {
        setError(result.error || 'Failed to fetch queue data')
      }
    } catch (err) {
      setError('Error fetching queue data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueueData()

    if (autoRefresh) {
      const interval = setInterval(fetchQueueData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [queueType, autoRefresh, refreshInterval])

  const formatSimTime = (simMinute: number) => {
    return `Sim t=${simMinute}min`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading queue data...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
          <Button onClick={fetchQueueData} className="mt-4" variant="outline" size="sm">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {title}
            <Badge variant="outline">
              {queueData?.totalCount || 0} total
            </Badge>
            <Badge variant="default" className="bg-green-600">
              {queueData?.readyCount || 0} ready
            </Badge>
          </CardTitle>
          <Button onClick={fetchQueueData} variant="ghost" size="sm">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {queueData?.totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">Queue is empty</p>
        ) : (
          <div className="space-y-3">
            {queueData?.entries?.map((entry: any, idx: number) => (
              <div
                key={entry.id}
                className={`p-3 rounded-lg border ${
                  entry.isReady
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      Order #{idx + 1} - {entry.order?.kunde?.vorname} {entry.order?.kunde?.nachname}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.order?.produktvariante?.produkt?.bezeichnung} - {entry.order?.produktvariante?.bezeichnung}
                    </div>
                  </div>
                  {entry.isReady ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="w-3 h-3 mr-1" />
                      {entry.waitMinutes}m wait
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Queued at:</span>{' '}
                    <span className="font-mono">{formatSimTime(entry.queuedAtSimMinute)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Release at:</span>{' '}
                    <span className="font-mono">{formatSimTime(entry.releaseAtSimMinute)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Order:</span>{' '}
                    <span className="font-mono">#{entry.processingOrder}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Wait time:</span>{' '}
                    <span className="font-mono">{entry.releaseAfterMinutes} sim-min</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Current sim time:</span>{' '}
                    <span className="font-mono">{formatSimTime(entry.currentSimMinute || 0)}</span>
                  </div>
                </div>

                {entry.processTimes && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="text-xs text-muted-foreground mb-1">Process Times:</div>
                    <div className="flex gap-2 flex-wrap">
                      {(() => {
                        const pt = entry.processTimes as any;
                        // New structure with totals
                        if (pt.totals && typeof pt.totals === 'object') {
                          return Object.entries(pt.totals as Record<string, number>).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {value}m
                              {pt[key === 'demontage' ? 'demontage' : 'remontage']?.length > 0 &&
                                ` (${pt[key === 'demontage' ? 'demontage' : 'remontage'].length} ops)`
                              }
                            </Badge>
                          ));
                        }
                        // Old structure with direct key-value pairs
                        return Object.entries(pt as Record<string, number>).map(([key, value]) => {
                          if (typeof value === 'number') {
                            return (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key}: {value}m
                              </Badge>
                            );
                          }
                          return null;
                        }).filter(Boolean);
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
