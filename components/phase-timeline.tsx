'use client'

import { useEffect, useRef, useState } from 'react'
import * as joint from '@joint/plus'
import { useOrder } from '@/contexts/order-context'
import { useFactory } from '@/contexts/factory-context'
import { getTimelineData, getTransitionSummary } from '@/app/actions/phase-timeline.actions'
import '@joint/plus/joint-plus.css'

// Define phase types as constants for SQLite compatibility
type AuftragsPhase = 
  | 'AUFTRAGSANNAHME'
  | 'INSPEKTION' 
  | 'REASSEMBLY_START'
  | 'REASSEMBLY_ENDE'
  | 'QUALITAETSPRUEFUNG'
  | 'AUFTRAGSABSCHLUSS'

// Token configuration for animations
const TOKEN_CONFIG = {
  size: 5,
  color: '#1a48a5',
  duration: 1500
}

interface PhaseTimelineProps {
  simulationTime?: Date
  isPlaying?: boolean
}

export function PhaseTimeline({ simulationTime, isPlaying }: PhaseTimelineProps) {
  const paperRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<joint.dia.Graph | null>(null)
  const paperInstanceRef = useRef<joint.dia.Paper | null>(null)
  const phaseShapesRef = useRef<Map<string, joint.shapes.standard.Rectangle>>(new Map())
  const linksRef = useRef<Map<string, joint.shapes.standard.Link>>(new Map())
  const { selectedOrder } = useOrder()
  const { activeFactory } = useFactory()
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')

  // Phase order
  const phaseOrder = [
    'AUFTRAGSANNAHME',
    'INSPEKTION',
    'REASSEMBLY_START',
    'REASSEMBLY_ENDE',
    'QUALITAETSPRUEFUNG',
    'AUFTRAGSABSCHLUSS'
  ]

  // Phase labels in German
  const phaseLabels: Record<string, string> = {
    'AUFTRAGSANNAHME': 'Auftragsannahme',
    'INSPEKTION': 'Inspektion',
    'REASSEMBLY_START': 'Re-Assembly Start',
    'REASSEMBLY_ENDE': 'Re-Assembly Ende',
    'QUALITAETSPRUEFUNG': 'Qualitätsprüfung',
    'AUFTRAGSABSCHLUSS': 'Auftragsabschluss'
  }

  // Initialize JointJS
  useEffect(() => {
    if (!paperRef.current || !activeFactory) return

    // Create graph
    const graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes })
    graphRef.current = graph

    // Create paper
    const paper = new joint.dia.Paper({
      el: paperRef.current,
      model: graph,
      width: phaseOrder.length * 200 + 100,
      height: 150,
      gridSize: 10,
      drawGrid: false,
      background: {
        color: 'hsl(var(--background))'
      },
      interactive: false,
      cellViewNamespace: joint.shapes,
      defaultLink: () => new joint.shapes.standard.Link()
    })
    paperInstanceRef.current = paper

    // Create phase shapes
    createPhaseShapes()
    
    // Initial data load
    loadTimelineData()

    return () => {
      paper.remove()
      graph.clear()
    }
  }, [activeFactory])

  // Create phase shapes and links
  const createPhaseShapes = () => {
    const graph = graphRef.current
    if (!graph) return

    const shapeWidth = 120
    const shapeHeight = 40
    const spacing = 200
    const yPosition = 35

    phaseShapesRef.current.clear()
    linksRef.current.clear()

    // Create shapes for each phase
    phaseOrder.forEach((phase, index) => {
      const shape = new joint.shapes.standard.Rectangle({
        position: { x: 50 + index * spacing, y: yPosition },
        size: { width: shapeWidth, height: shapeHeight },
        attrs: {
          body: {
            fill: '#ffffff',
            stroke: '#495057',
            strokeWidth: 2,
            rx: 8,
            ry: 8
          },
          label: {
            text: phaseLabels[phase],
            fill: '#212529',
            fontSize: 11,
            fontWeight: 'normal',
          }
        },
        z: 2
      })
      
      graph.addCell(shape)
      phaseShapesRef.current.set(phase, shape)

      // Add count label above the shape
      const countLabel = new joint.shapes.standard.TextBlock({
        position: { x: 50 + index * spacing, y: yPosition - 20 },
        size: { width: shapeWidth, height: 20 },
        attrs: {
          body: {
            fill: 'transparent',
            stroke: 'none'
          },
          label: {
            text: '0',
            fill: '#495057',
            fontSize: 16,
            fontWeight: 'bold',
            textAnchor: 'middle',
            refX: '50%'
          }
        },
        id: `count-${phase}`
      })
      
      graph.addCell(countLabel)
    })

    // Create links between phases after all shapes are created
    phaseOrder.forEach((phase, index) => {
      if (index < phaseOrder.length - 1) {
        const currentShape = phaseShapesRef.current.get(phase)
        const nextShape = phaseShapesRef.current.get(phaseOrder[index + 1])
        
        if (currentShape && nextShape) {
          const link = new joint.shapes.standard.Link({
            source: { id: currentShape.id },
            target: { id: nextShape.id },
            attrs: {
              line: {
                stroke: '#000000',
                strokeWidth: 2,
                strokeDasharray: '0',
                targetMarker: {
                  type: 'path',
                  d: 'M 10 -5 0 0 10 5 z',
                  fill: '#000000',
                  stroke: '#000000'
                }
              },
              wrapper: {
                strokeWidth: 20,
                strokeOpacity: 0
              }
            },
            z: 1
          })
          
          graph.addCell(link)
          const linkKey = `${phase}->${phaseOrder[index + 1]}`
          linksRef.current.set(linkKey, link)
        }
      }
    })
  }

  // Load timeline data
  const loadTimelineData = async () => {
    if (!activeFactory) return

    try {
      const result = await getTimelineData(activeFactory.id)
      if (result.success && result.data) {
        updatePhaseCounts(result.data.phaseCounts)
      }
    } catch (error) {
      console.error('Error loading timeline data:', error)
    }
  }

  // Update phase counts
  const updatePhaseCounts = (phaseCounts: Array<{ phase: AuftragsPhase, count: number }> | undefined) => {
    if (!phaseCounts || !graphRef.current) return
    
    phaseCounts.forEach(({ phase, count }) => {
      // Update count label above shape
      const countLabel = graphRef.current?.getCell(`count-${phase}`)
      if (countLabel) {
        countLabel.attr('label/text', count.toString())
      }
    })
  }

  // No highlighting anymore - keep shapes always white
  useEffect(() => {
    // Empty effect - no highlighting when order is selected
  }, [selectedOrder])

  // Check for transitions and animate
  useEffect(() => {
    if (!isPlaying || !simulationTime || !activeFactory) return

    // Check every 2 simulation hours
    const currentHour = simulationTime.getHours()
    if (currentHour % 2 !== 0) return

    const timeString = simulationTime.toISOString()
    if (timeString === lastUpdateTime) return
    
    setLastUpdateTime(timeString)
    checkAndAnimateTransitions(timeString)
  }, [simulationTime, isPlaying, activeFactory])

  // Check for transitions and animate them
  const checkAndAnimateTransitions = async (currentTime: string) => {
    if (!activeFactory || !graphRef.current) return

    try {
      // Get transitions since last update
      const result = await getTransitionSummary(
        activeFactory.id,
        lastUpdateTime || undefined,
        currentTime
      )

      if (result.success && result.data) {
        // Animate each transition group
        for (const transition of result.data) {
          if (transition.count > 0) {
            animateTransition(transition.from, transition.to, transition.count)
          }
        }

        // Update counts after animations
        setTimeout(() => {
          loadTimelineData()
        }, 1500)
      }
    } catch (error) {
      console.error('Error checking transitions:', error)
    }
  }

  // Animate transition between phases using tokens along links
  const animateTransition = (
    fromPhase: AuftragsPhase | null,
    toPhase: AuftragsPhase,
    count: number
  ) => {
    const paper = paperInstanceRef.current
    const graph = graphRef.current
    if (!paper || !graph) return

    // For new orders entering the system
    if (!fromPhase) {
      const toShape = phaseShapesRef.current.get(toPhase)
      if (toShape) {
        // Animate tokens appearing and moving to first phase
        for (let i = 0; i < Math.min(count, 5); i++) {
          setTimeout(() => {
            const token = new joint.shapes.standard.Circle({
              position: { x: 10, y: toShape.position().y + 15 },
              size: { width: TOKEN_CONFIG.size * 2, height: TOKEN_CONFIG.size * 2 },
              attrs: {
                body: {
                  fill: TOKEN_CONFIG.color,
                  stroke: 'none',
                  opacity: 0
                }
              }
            })
            
            graph.addCell(token)
            
            // Fade in and move to shape
            token.transition('attrs/body/opacity', 1, {
              duration: 300,
              complete: () => {
                token.transition('position', 
                  { 
                    x: toShape.position().x + 60, 
                    y: toShape.position().y + 15 
                  }, 
                  {
                    duration: TOKEN_CONFIG.duration - 300,
                    timingFunction: joint.util.timing.cubic,
                    complete: () => {
                      // Update count
                      const targetCountLabel = graphRef.current?.getCell(`count-${toPhase}`)
                      if (targetCountLabel) {
                        const currentCount = parseInt(targetCountLabel.attr('label/text') as string || '0')
                        targetCountLabel.attr('label/text', (currentCount + 1).toString())
                      }
                      
                      // Fade out and remove
                      token.transition('attrs/body/opacity', 0, {
                        duration: 200,
                        complete: () => token.remove()
                      })
                    }
                  }
                )
              }
            })
          }, i * 200)
        }
      }
      return
    }

    // Find the link for transitions between phases
    const linkKey = `${fromPhase}->${toPhase}`
    const link = linksRef.current.get(linkKey)
    
    if (link) {
      // Animate tokens along the link path
      const linkView = paper.findViewByModel(link)
      if (linkView) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          setTimeout(() => {
            // Get source and target positions
            const fromShape = phaseShapesRef.current.get(fromPhase)
            const toShape = phaseShapesRef.current.get(toPhase)
            
            if (fromShape && toShape) {
              // Create token at source
              const token = new joint.shapes.standard.Circle({
                position: { 
                  x: fromShape.position().x + 60, 
                  y: fromShape.position().y + 20 
                },
                size: { width: TOKEN_CONFIG.size * 2, height: TOKEN_CONFIG.size * 2 },
                attrs: {
                  body: {
                    fill: TOKEN_CONFIG.color,
                    stroke: 'none'
                  }
                }
              })
              
              graph.addCell(token)
              
              // Update source count immediately
              const sourceCountLabel = graphRef.current?.getCell(`count-${fromPhase}`)
              if (sourceCountLabel) {
                const currentCount = parseInt(sourceCountLabel.attr('label/text') as string || '0')
                sourceCountLabel.attr('label/text', Math.max(0, currentCount - 1).toString())
              }
              
              // Animate token along the link (straight line)
              const startX = fromShape.position().x + 120 // Right edge of source shape
              const startY = fromShape.position().y + 20 // Center vertically
              const endX = toShape.position().x // Left edge of target shape
              const endY = toShape.position().y + 20 // Center vertically
              
              let progress = 0
              const totalDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2))
              
              const animateStep = () => {
                progress += 3 // Speed of animation (pixels per frame)
                const t = Math.min(progress / totalDistance, 1)
                
                if (t < 1) {
                  // Linear interpolation along the link
                  const x = startX + (endX - startX) * t
                  const y = startY + (endY - startY) * t
                  
                  token.position(x - TOKEN_CONFIG.size, y - TOKEN_CONFIG.size)
                  requestAnimationFrame(animateStep)
                } else {
                  // Update target count
                  const targetCountLabel = graphRef.current?.getCell(`count-${toPhase}`)
                  if (targetCountLabel) {
                    const currentCount = parseInt(targetCountLabel.attr('label/text') as string || '0')
                    targetCountLabel.attr('label/text', (currentCount + 1).toString())
                  }
                  
                  // Remove token
                  token.remove()
                }
              }
              
              requestAnimationFrame(animateStep)
            }
          }, i * 200)
        }
      }
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-background border-t">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h3 className="text-sm font-semibold text-muted-foreground">Auftragsphasen-Timeline</h3>
        {isPlaying && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-muted-foreground">Simulation läuft</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div ref={paperRef} className="h-full" />
      </div>
    </div>
  )
}