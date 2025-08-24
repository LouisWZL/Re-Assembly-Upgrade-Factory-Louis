'use client'

import { useEffect, useRef, useState } from 'react'
import * as joint from '@joint/plus'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ReAssemblyTyp } from '@prisma/client'
import { BaugruppenDetailsTable } from '@/components/baugruppen-details-table'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

// Import JointJS CSS - IMPORTANT!
import '@joint/plus/joint-plus.css'

interface BaugruppeDetail {
  id: string
  bezeichnung: string
  artikelnummer: string
  variantenTyp: string
  zustand: number
  reAssemblyTyp?: ReAssemblyTyp | null
}

interface OrderGraphViewerProps {
  order: {
    id: string
    factory?: {
      pflichtUpgradeSchwelle?: number | null
    } | null
    produktvariante: {
      bezeichnung: string
      typ: string
    }
    graphData?: any
    baugruppenInstances?: Array<{
      id: string
      zustand: number
      reAssemblyTyp?: ReAssemblyTyp | null
      baugruppe: {
        id: string
        bezeichnung: string
        artikelnummer: string
        variantenTyp: string
        demontagezeit?: number | null
        montagezeit?: number | null
        baugruppentyp?: {
          bezeichnung: string
        } | null
      }
      austauschBaugruppe?: {
        id: string
        bezeichnung: string
        artikelnummer: string
        variantenTyp: string
        baugruppentyp?: {
          bezeichnung: string
        } | null
      } | null
    }>
  } | null
}

export function OrderGraphViewer({ order }: OrderGraphViewerProps) {
  const paperRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<joint.dia.Graph | null>(null)
  const paperInstanceRef = useRef<joint.dia.Paper | null>(null)
  const paperScrollerRef = useRef<joint.ui.PaperScroller | null>(null)
  const [selectedBaugruppe, setSelectedBaugruppe] = useState<BaugruppeDetail | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  
  // Zoom functions
  const handleZoomIn = () => {
    if (paperScrollerRef.current) {
      paperScrollerRef.current.zoom(0.2, { max: 3 })
    }
  }
  
  const handleZoomOut = () => {
    if (paperScrollerRef.current) {
      paperScrollerRef.current.zoom(-0.2, { min: 0.2 })
    }
  }
  
  const handleZoomToFit = () => {
    if (paperScrollerRef.current) {
      paperScrollerRef.current.zoomToFit({
        minScale: 0.2,
        maxScale: 2,
        padding: 50
      })
    }
  }

  useEffect(() => {
    if (!paperRef.current) return

    console.log('OrderGraphViewer - Order changed:', order?.id, 'Has graphData:', !!order?.graphData)

    // Clean up previous instances
    if (paperScrollerRef.current) {
      paperScrollerRef.current.remove()
      paperScrollerRef.current = null
    }
    if (paperInstanceRef.current) {
      paperInstanceRef.current.remove()
      paperInstanceRef.current = null
    }
    if (graphRef.current) {
      graphRef.current.clear()
      graphRef.current = null
    }

    if (!order?.graphData?.cells) {
      return
    }

    // Create Graph
    const graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes })
    graphRef.current = graph

    // Create Paper with proper configuration
    const paper = new joint.dia.Paper({
      width: 1000,
      height: 600,
      model: graph,
      cellViewNamespace: joint.shapes,
      background: {
        color: '#f8f9fa'
      },
      gridSize: 20,
      drawGrid: {
        name: 'doubleMesh',
        args: [
          { color: '#e5e5e5', thickness: 1 }, // minor grid
          { color: '#d0d0d0', thickness: 1, scaleFactor: 5 } // major grid
        ]
      },
      interactive: { 
        elementMove: false, // Prevent moving elements
        linkMove: false,    // Prevent moving links
        labelMove: false    // Prevent moving labels
      },
      async: true,
      frozen: true,
      sorting: joint.dia.Paper.sorting.APPROX
    })
    paperInstanceRef.current = paper

    // Create PaperScroller for better navigation
    const paperScroller = new joint.ui.PaperScroller({
      paper: paper,
      autoResizePaper: true,
      padding: 50,
      cursor: 'default',
      baseWidth: paperRef.current.clientWidth || 800,
      baseHeight: 400,
      contentOptions: {
        padding: 50,
        allowNewOrigin: 'any',
        useModelGeometry: true
      }
    })
    paperScrollerRef.current = paperScroller

    // Append to DOM
    paperRef.current.appendChild(paperScroller.el)
    paperScroller.render()

    // Center the paper
    paperScroller.center()

    // Load graph data
    try {
      console.log('Loading graph with cells:', order.graphData.cells.length)
      graph.fromJSON(order.graphData)
      
      // Unfreeze to see the graph
      paper.unfreeze()
      
      // Use zoomToFit after content is loaded
      setTimeout(() => {
        paperScroller.zoomToFit({
          minScale: 0.2,
          maxScale: 2,
          padding: 50
        })
      }, 100)
    } catch (error) {
      console.error('Error loading graph:', error)
    }

    // Create baugruppe map for quick lookup
    const baugruppeMap = new Map<string, BaugruppeDetail>()
    order.baugruppenInstances?.forEach(instance => {
      baugruppeMap.set(instance.baugruppe.id, {
        id: instance.baugruppe.id,
        bezeichnung: instance.baugruppe.bezeichnung,
        artikelnummer: instance.baugruppe.artikelnummer,
        variantenTyp: instance.baugruppe.variantenTyp,
        zustand: instance.zustand,
        reAssemblyTyp: instance.reAssemblyTyp
      })
    })

    // Add panning functionality like in factory-configurator
    paper.on('blank:pointerdown', (evt: any) => {
      paperScroller.startPanning(evt)
    })

    // Add click handler for elements
    paper.on('element:pointerclick', (elementView: joint.dia.ElementView) => {
      const element = elementView.model
      const cellData = element.toJSON()
      
      // Check if this is a baugruppe element
      if (cellData.baugruppe) {
        const baugruppeDetail = baugruppeMap.get(cellData.baugruppe.id)
        if (baugruppeDetail) {
          setSelectedBaugruppe(baugruppeDetail)
          setDialogOpen(true)
        }
      }
    })

    // Update element colors based on ReAssemblyTyp
    graph.getElements().forEach(element => {
      const cellData = element.toJSON()
      if (cellData.baugruppe) {
        const instance = order.baugruppenInstances?.find(
          bi => bi.baugruppe.id === cellData.baugruppe.id
        )
        if (instance) {
          // Color based on ReAssemblyTyp
          let fillColor = '#4f4f4f' // gray for normal assemblies
          let strokeColor = '#3a3a3a' // darker gray border
          let textColor = '#ffffff' // white text for gray
          
          if (instance.reAssemblyTyp) {
            fillColor = '#87b0de' // light blue for ReAssembly
            strokeColor = '#6189b5' // darker blue border
            textColor = '#000000' // black text for blue
          }
          
          element.attr('body/fill', fillColor)
          element.attr('body/fillOpacity', 0.8)
          element.attr('body/stroke', strokeColor)
          element.attr('body/strokeWidth', 2)
          element.attr('body/cursor', 'pointer') // Use pointer cursor instead of move
          element.attr('label/fill', textColor)
        }
      }
    })

    return () => {
      if (paperScrollerRef.current) {
        paperScrollerRef.current.remove()
      }
      if (paperInstanceRef.current) {
        paperInstanceRef.current.remove()
      }
      if (graphRef.current) {
        graphRef.current.clear()
      }
    }
  }, [order?.id])
  
  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeydown = (evt: KeyboardEvent) => {
      // Check if focus is on an input element
      if (evt.target instanceof HTMLInputElement || evt.target instanceof HTMLTextAreaElement) {
        return
      }
      
      if (evt.ctrlKey || evt.metaKey) {
        if (evt.key === '+' || evt.key === '=') {
          evt.preventDefault()
          handleZoomIn()
        } else if (evt.key === '-') {
          evt.preventDefault()
          handleZoomOut()
        } else if (evt.key === '0') {
          evt.preventDefault()
          handleZoomToFit()
        }
      }
    }
    
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  if (!order) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Wählen Sie einen Auftrag aus der Auftragsübersicht aus
      </div>
    )
  }

  const getZustandLabel = (zustand: number) => {
    if (zustand >= 80) return 'Sehr gut'
    if (zustand >= 60) return 'Gut'
    if (zustand >= 40) return 'Mittel'
    if (zustand >= 20) return 'Schlecht'
    return 'Sehr schlecht'
  }

  const getZustandColor = (zustand: number) => {
    if (zustand >= 80) return 'text-green-600'
    if (zustand >= 60) return 'text-emerald-600'
    if (zustand >= 40) return 'text-amber-600'
    if (zustand >= 20) return 'text-orange-600'
    return 'text-red-600'
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Auftragsdetails</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-normal text-muted-foreground">
                {order.produktvariante.bezeichnung}
              </span>
              <Badge variant={order.produktvariante.typ === 'premium' ? 'default' : 'secondary'}>
                {order.produktvariante.typ}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex gap-6" style={{ height: '460px' }}>
            {/* Graph Container - 40% width */}
            <div className="w-[40%] flex flex-col">
              {/* Graph with Zoom Controls */}
              <div className="relative flex-1">
                <div 
                  ref={paperRef} 
                  className="absolute inset-0 border rounded-lg bg-muted/10"
                  style={{ overflow: 'hidden' }}
                />
                {/* Zoom Controls */}
                <div className="absolute top-2 right-2 flex gap-1 bg-background/90 backdrop-blur-sm rounded-md p-1 shadow-sm border">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleZoomIn}
                    title="Vergrößern"
                    className="h-7 w-7"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleZoomOut}
                    title="Verkleinern"
                    className="h-7 w-7"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleZoomToFit}
                    title="Ansicht anpassen"
                    className="h-7 w-7"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Legend and Instructions */}
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#87b0de', opacity: 0.8, border: '2px solid #6189b5' }}></div>
                    <span className="text-muted-foreground">Re-Assembly</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4f4f4f', opacity: 0.8, border: '2px solid #3a3a3a' }}></div>
                    <span className="text-muted-foreground">Baugruppe</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Klicken Sie auf eine Baugruppe im Graph für Details
                </p>
              </div>
            </div>
            
            {/* Table Container - 60% width */}
            <div className="w-[60%] flex flex-col">
              <div className="bg-muted/5 rounded-lg p-3 h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Baugruppen-Details</h3>
                  <span className="text-xs text-muted-foreground">
                    {order.baugruppenInstances?.length || 0} Baugruppen
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <BaugruppenDetailsTable 
                    baugruppenInstances={order.baugruppenInstances}
                    pflichtUpgradeSchwelle={order.factory?.pflichtUpgradeSchwelle ?? 30}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Baugruppe Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby="baugruppe-details-description">
          <DialogHeader>
            <DialogTitle>{selectedBaugruppe?.bezeichnung}</DialogTitle>
          </DialogHeader>
          <div id="baugruppe-details-description" className="sr-only">
            Details zur ausgewählten Baugruppe
          </div>
          {selectedBaugruppe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Artikelnummer</Label>
                  <p className="font-mono text-sm">{selectedBaugruppe.artikelnummer}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Varianten-Typ</Label>
                  <Badge variant="outline">{selectedBaugruppe.variantenTyp}</Badge>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Zustand</Label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        selectedBaugruppe.zustand >= 60 ? 'bg-green-500' :
                        selectedBaugruppe.zustand >= 30 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${selectedBaugruppe.zustand}%` }}
                    />
                  </div>
                  <span className={`text-sm font-medium ${getZustandColor(selectedBaugruppe.zustand)}`}>
                    {selectedBaugruppe.zustand}% - {getZustandLabel(selectedBaugruppe.zustand)}
                  </span>
                </div>
              </div>

              {selectedBaugruppe.reAssemblyTyp && (
                <div>
                  <Label className="text-muted-foreground">Re-Assembly-Typ</Label>
                  <Badge 
                    variant={selectedBaugruppe.reAssemblyTyp === ReAssemblyTyp.PFLICHT ? 'destructive' : 'default'}
                    className="mt-1"
                  >
                    {selectedBaugruppe.reAssemblyTyp}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}