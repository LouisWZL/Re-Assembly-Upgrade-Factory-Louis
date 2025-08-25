'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, RefreshCw, Database, Settings, Bug } from 'lucide-react'

interface DebugData {
  timestamp: string
  environment: string
  isVercel: boolean
  databaseUrl: string
  connection?: string
  initialization?: string
  counts?: {
    factories: number
    customers: number
    orders: number
    baugruppentypen?: number
    baugruppen?: number
    produkte?: number
    varianten?: number
  }
  factoryDetails?: Array<{
    name: string
    products: number
    baugruppentypen: number
    baugruppen: number
  }>
  productDetails?: Array<{
    name: string
    factory: string
    baugruppentypen: string[]
    variantenCount: number
  }>
  error?: {
    message: string
    stack?: string
  }
}

interface FactoryData {
  id: string
  name: string
  kapazität: number
}

export function DebugInfo() {
  const [isOpen, setIsOpen] = useState(false)
  const [debugData, setDebugData] = useState<DebugData | null>(null)
  const [factoryData, setFactoryData] = useState<FactoryData[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<string>('')

  const fetchDebugData = async () => {
    setLoading(true)
    try {
      // Fetch debug info
      const debugResponse = await fetch('/api/debug-db', { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      
      if (debugResponse.ok) {
        const data = await debugResponse.json()
        setDebugData(data)
      } else {
        const errorText = await debugResponse.text()
        setDebugData({
          timestamp: new Date().toISOString(),
          environment: 'unknown',
          isVercel: false,
          databaseUrl: 'unknown',
          error: {
            message: `Debug endpoint failed: ${debugResponse.status} ${errorText}`
          }
        })
      }

      // Fetch factory data
      try {
        const factoryResponse = await fetch('/api/factories', { 
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })
        
        if (factoryResponse.ok) {
          const factories = await factoryResponse.json()
          setFactoryData(Array.isArray(factories) ? factories : [])
        } else {
          const errorText = await factoryResponse.text()
          setFactoryData(null)
          console.error('Factory fetch failed:', errorText)
        }
      } catch (factoryError) {
        setFactoryData(null)
        console.error('Factory fetch error:', factoryError)
      }

      setLastRefresh(new Date().toLocaleTimeString())
    } catch (error) {
      console.error('Debug fetch error:', error)
      setDebugData({
        timestamp: new Date().toISOString(),
        environment: 'unknown',
        isVercel: false,
        databaseUrl: 'unknown',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      })
    } finally {
      setLoading(false)
    }
  }

  const forceInit = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/force-init', {
        method: 'POST',
        cache: 'no-store'
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('Force init result:', result)
        await fetchDebugData() // Refresh data after init
      } else {
        const errorText = await response.text()
        console.error('Force init failed:', errorText)
      }
    } catch (error) {
      console.error('Force init error:', error)
    } finally {
      setLoading(false)
    }
  }

  const ensureData = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/ensure-data', {
        method: 'POST',
        cache: 'no-store'
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('Ensure data result:', result)
        await fetchDebugData() // Refresh data after ensuring
      } else {
        const errorText = await response.text()
        console.error('Ensure data failed:', errorText)
      }
    } catch (error) {
      console.error('Ensure data error:', error)
    } finally {
      setLoading(false)
    }
  }

  const cleanupDuplicates = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/cleanup-duplicates', {
        method: 'POST',
        cache: 'no-store'
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('Cleanup result:', result)
        await fetchDebugData() // Refresh data after cleanup
      } else {
        const errorText = await response.text()
        console.error('Cleanup failed:', errorText)
      }
    } catch (error) {
      console.error('Cleanup error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fixAllData = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/fix-all-data', {
        method: 'POST',
        cache: 'no-store'
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('Fix all result:', result)
        await fetchDebugData() // Refresh data after fix
      } else {
        const errorText = await response.text()
        console.error('Fix all failed:', errorText)
      }
    } catch (error) {
      console.error('Fix all error:', error)
    } finally {
      setLoading(false)
    }
  }

  const forceSchema = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/force-schema', {
        method: 'POST',
        cache: 'no-store'
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('Force schema result:', result)
        await fetchDebugData() // Refresh data after schema creation
      } else {
        const errorText = await response.text()
        console.error('Force schema failed:', errorText)
      }
    } catch (error) {
      console.error('Force schema error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && !debugData) {
      fetchDebugData()
    }
  }, [isOpen])

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="bg-background shadow-lg">
            <Bug className="h-4 w-4 mr-2" />
            Debug Info
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-2">
          <Card className="w-96 max-h-96 overflow-auto shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Database Debug Info</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchDebugData}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={forceInit}
                    disabled={loading}
                    title="Force Init"
                  >
                    <Database className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={ensureData}
                    disabled={loading}
                    title="Ensure Data"
                  >
                    ✓
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={cleanupDuplicates}
                    disabled={loading}
                    title="Clean Duplicates"
                  >
                    🧹
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fixAllData}
                    disabled={loading}
                    title="Fix All Data"
                  >
                    🔧
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={forceSchema}
                    disabled={loading}
                    title="Force Schema"
                  >
                    🗄️
                  </Button>
                </div>
              </div>
              {lastRefresh && (
                <CardDescription className="text-xs">
                  Last updated: {lastRefresh}
                </CardDescription>
              )}
            </CardHeader>
            
            <CardContent className="space-y-3 text-xs">
              {debugData ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Environment:</span>
                      <Badge variant="secondary">{debugData.environment}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Vercel:</span>
                      <Badge variant={debugData.isVercel ? "default" : "outline"}>
                        {debugData.isVercel ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Database URL:</span>
                      <Badge variant={debugData.databaseUrl === 'SET' ? "default" : "destructive"}>
                        {debugData.databaseUrl}
                      </Badge>
                    </div>
                    {debugData.connection && (
                      <div className="flex justify-between">
                        <span>Connection:</span>
                        <Badge variant={debugData.connection === 'SUCCESS' ? "default" : "destructive"}>
                          {debugData.connection}
                        </Badge>
                      </div>
                    )}
                    {debugData.initialization && (
                      <div className="flex justify-between">
                        <span>Initialization:</span>
                        <Badge variant={debugData.initialization === 'SUCCESS' ? "default" : "destructive"}>
                          {debugData.initialization}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {debugData.counts && (
                    <div className="space-y-1">
                      <div className="font-semibold">Record Counts:</div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div>Factories: {debugData.counts.factories}</div>
                        <div>Customers: {debugData.counts.customers}</div>
                        <div>Orders: {debugData.counts.orders}</div>
                        {debugData.counts.baugruppentypen !== undefined && (
                          <div>Baugruppentypen: {debugData.counts.baugruppentypen}</div>
                        )}
                        {debugData.counts.baugruppen !== undefined && (
                          <div>Baugruppen: {debugData.counts.baugruppen}</div>
                        )}
                        {debugData.counts.produkte !== undefined && (
                          <div>Produkte: {debugData.counts.produkte}</div>
                        )}
                        {debugData.counts.varianten !== undefined && (
                          <div>Varianten: {debugData.counts.varianten}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {factoryData && (
                    <div className="space-y-1">
                      <div className="font-semibold">Factories ({factoryData.length}):</div>
                      <div className="space-y-1">
                        {factoryData.map((factory, idx) => (
                          <div key={factory.id || idx} className="text-xs bg-muted p-1 rounded">
                            {factory.name} (Cap: {factory.kapazität})
                          </div>
                        ))}
                        {factoryData.length === 0 && (
                          <div className="text-xs text-red-500">No factories found!</div>
                        )}
                      </div>
                    </div>
                  )}

                  {debugData.factoryDetails && debugData.factoryDetails.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-semibold">Factory Details:</div>
                      <div className="space-y-1">
                        {debugData.factoryDetails.map((factory, idx) => (
                          <div key={idx} className="text-xs bg-muted p-1 rounded">
                            <div className="font-medium">{factory.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Products: {factory.products}, BGT: {factory.baugruppentypen}, BG: {factory.baugruppen}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugData.productDetails && debugData.productDetails.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-semibold">Product Details:</div>
                      <div className="space-y-1">
                        {debugData.productDetails.map((product, idx) => (
                          <div key={idx} className="text-xs bg-muted p-1 rounded">
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs">Factory: {product.factory}</div>
                            <div className="text-xs">Variants: {product.variantenCount}</div>
                            <div className="text-xs">
                              BGT ({product.baugruppentypen.length}): {
                                product.baugruppentypen.length > 0 
                                  ? product.baugruppentypen.join(', ')
                                  : 'NONE CONNECTED!'
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugData.error && (
                    <div className="space-y-1">
                      <div className="font-semibold text-red-600">Error:</div>
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                        {debugData.error.message}
                      </div>
                      {debugData.error.stack && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-red-600">Stack Trace</summary>
                          <pre className="text-xs bg-red-50 p-2 rounded mt-1 overflow-auto">
                            {debugData.error.stack}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t text-xs text-muted-foreground">
                    Timestamp: {new Date(debugData.timestamp).toLocaleString()}
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  {loading ? "Loading..." : "Click refresh to load debug info"}
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}