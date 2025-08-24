// @ts-nocheck
'use client'

import { useEffect, useRef, useState } from 'react'
import * as joint from '@joint/plus'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { ProcessSequencesList } from '@/components/process-sequences-list'

// Import JointJS CSS - IMPORTANT!
import '@joint/plus/joint-plus.css'

interface OrderProcessGraphViewerProps {
  order: {
    id: string
    produktvariante: {
      bezeichnung: string
      typ: string
    }
    processGraphDataBg?: any
    processGraphDataBgt?: any
    processSequences?: any
    baugruppenInstances?: Array<{
      id: string
      zustand: number
      reAssemblyTyp?: string | null
      baugruppe: {
        id: string
        bezeichnung: string
        artikelnummer: string
        variantenTyp: string
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

export function OrderProcessGraphViewer({ order }: OrderProcessGraphViewerProps) {
  const [activeTab, setActiveTab] = useState<'baugruppen' | 'baugruppentypen'>('baugruppen')
  const paperRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<joint.dia.Graph | null>(null)
  const paperInstanceRef = useRef<joint.dia.Paper | null>(null)
  const paperScrollerRef = useRef<joint.ui.PaperScroller | null>(null)
  
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

    const processGraphData = activeTab === 'baugruppen' ? order?.processGraphDataBg : order?.processGraphDataBgt
    console.log('OrderProcessGraphViewer - Tab:', activeTab, 'Order:', order?.id, 'Has data:', !!processGraphData)

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

    if (!processGraphData?.cells) {
      return
    }

    // Create Graph
    const graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes })
    graphRef.current = graph

    // Create Paper with proper configuration
    const paper = new joint.dia.Paper({
      width: 1200,
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
      interactive: false, // Disable all interactions
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
      console.log('Loading process graph with cells:', processGraphData.cells.length)
      graph.fromJSON(processGraphData)
      
      // Apply color coding based on reassembly types and graph structure
      const elements = graph.getElements()
      
      // Collect shapes with reassembly types and by process type
      const reassemblyShapes = new Set<string>()
      const demontageShapes = new Map<string, joint.dia.Element>()
      const remontageShapes = new Map<string, joint.dia.Element>()
      
      elements.forEach(element => {
        const cellData = element.toJSON()
        
        // Check if this shape has a reassembly type
        if (cellData.baugruppenInstance && order.baugruppenInstances) {
          const instance = order.baugruppenInstances.find(
            (bi: any) => bi.id === cellData.baugruppenInstance.id
          )
          if (instance && instance.reAssemblyTyp) {
            reassemblyShapes.add(String(element.id))
          }
        }
        
        // Categorize by process type
        if (cellData.processType === 'demontage') {
          demontageShapes.set(String(element.id), element)
        } else if (cellData.processType === 'remontage') {
          remontageShapes.set(String(element.id), element)
        }
      })
      
      // Collect all predecessors of reassembly shapes in demontage
      const orangeShapes = new Set<string>()
      reassemblyShapes.forEach(reassemblyId => {
        const reassemblyElement = graph.getCell(reassemblyId)
        if (reassemblyElement && demontageShapes.has(String(reassemblyId))) {
          // Get all predecessors (deep search)
          const predecessors = graph.getPredecessors(reassemblyElement as joint.dia.Element, { deep: true })
          predecessors.forEach(pred => {
            // Only add if it's not Inspektion and is in demontage subgraph
            if (pred.id !== 'inspektion' && demontageShapes.has(String(pred.id))) {
              orangeShapes.add(String(pred.id))
            }
          })
        }
      })
      
      // Collect all successors of reassembly shapes in remontage
      const purpleShapes = new Set<string>()
      reassemblyShapes.forEach(reassemblyId => {
        const reassemblyElement = graph.getCell(reassemblyId)
        if (reassemblyElement && remontageShapes.has(String(reassemblyId))) {
          // Get all successors (deep search)
          const successors = graph.getSuccessors(reassemblyElement as joint.dia.Element, { deep: true })
          successors.forEach(succ => {
            // Only add if it's not Qualitätsprüfung and is in remontage subgraph
            if (succ.id !== 'qualitaetspruefung' && remontageShapes.has(String(succ.id))) {
              purpleShapes.add(String(succ.id))
            }
          })
        }
      })
      
      // Color all shapes
      elements.forEach(element => {
        const elementId = String(element.id)
        let fillColor = '#4f4f4f' // Default gray for other shapes
        let strokeColor = '#3a3a3a' // Darker gray border
        let textColor = '#ffffff' // Default white text for gray
        
        // 4. Inspektion and Qualitätsprüfung (green)
        if (elementId === 'inspektion' || elementId === 'qualitaetspruefung') {
          fillColor = '#4ca132'
          strokeColor = '#3a7d26' // Darker green
          textColor = '#000000' // Black text
        }
        // 1. Shapes with ReassemblyTyp (light blue)
        else if (reassemblyShapes.has(String(elementId))) {
          fillColor = '#87b0de'
          strokeColor = '#6189b5' // Darker blue
          textColor = '#000000' // Black text
        }
        // 2. Demontage predecessors of reassembly shapes (orange)
        else if (orangeShapes.has(String(elementId))) {
          fillColor = '#f1a22b'
          strokeColor = '#c98222' // Darker orange
          textColor = '#000000' // Black text
        }
        // 3. Remontage successors of reassembly shapes (purple)
        else if (purpleShapes.has(String(elementId))) {
          fillColor = '#672a92'
          strokeColor = '#4f2070' // Darker purple
          textColor = '#ffffff' // White text
        }
        
        // Apply the colors
        element.attr('body/fill', fillColor)
        element.attr('body/stroke', strokeColor)
        element.attr('body/strokeWidth', 2)
        element.attr('body/fillOpacity', 1)
        element.attr('label/fill', textColor)
      })
      
      // Color all links black
      const links = graph.getLinks()
      links.forEach(link => {
        link.attr('line/stroke', '#000000')
        link.attr('line/strokeWidth', 2)
      })
      
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
      console.error('Error loading process graph:', error)
    }

    // Add panning functionality
    paper.on('blank:pointerdown', (evt: any) => {
      paperScroller.startPanning(evt)
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
  }, [order?.id, activeTab])
  
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
    return null
  }

  if (!order.processGraphDataBg && !order.processGraphDataBgt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Prozess</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Kein Prozessgraph verfügbar
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>Prozess</CardTitle>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'baugruppen' | 'baugruppentypen')}>
          <TabsList className="h-8">
            <TabsTrigger value="baugruppen" className="text-xs px-3 h-7">Baugruppen-Ebene</TabsTrigger>
            <TabsTrigger value="baugruppentypen" className="text-xs px-3 h-7">Baugruppentyp-Ebene</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="relative" style={{ height: '460px' }}>
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
              
              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f1a22b', border: '2px solid #c98222' }}></div>
                  <span className="text-muted-foreground">Zwangsbeziehung</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#87b0de', border: '2px solid #6189b5' }}></div>
                  <span className="text-muted-foreground">Re-Assembly</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4f4f4f', border: '2px solid #3a3a3a' }}></div>
                  <span className="text-muted-foreground">Nicht notwendiges Prozessmodul</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#672a92', border: '2px solid #4f2070' }}></div>
                  <span className="text-muted-foreground">Reziproke Zwangsbeziehung</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4ca132', border: '2px solid #3a7d26' }}></div>
                  <span className="text-muted-foreground">Prozessphase</span>
                </div>
              </div>
            </div>
      </CardContent>
      
      {/* Process Sequences List */}
      {order.processSequences && (
        <CardContent className="border-t pt-4">
          <ProcessSequencesList 
            sequences={
              activeTab === 'baugruppen' 
                ? order.processSequences.baugruppen 
                : order.processSequences.baugruppentypen
            } 
          />
        </CardContent>
      )}
    </Card>
  )
}