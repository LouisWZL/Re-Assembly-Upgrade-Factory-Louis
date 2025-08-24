'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { useView } from '@/contexts/view-context'
import * as joint from '@joint/plus'

interface Baugruppentyp {
  id: string
  bezeichnung: string
}

interface ConfiguratorSidebarRightProps {
  factoryId: string
}

export function ConfiguratorSidebarRight({ factoryId }: ConfiguratorSidebarRightProps) {
  const { currentView } = useView()
  const stencilRef = useRef<HTMLDivElement>(null)
  const stencilInstanceRef = useRef<joint.ui.Stencil | null>(null)
  const [baugruppentypen, setBaugruppentypen] = useState<Baugruppentyp[]>([])
  const allBaugruppentypenRef = useRef<Baugruppentyp[]>([])
  const usedBaugruppentypenRef = useRef<Set<string>>(new Set())
  const [isStencilDisabled, setIsStencilDisabled] = useState(false)

  // Fetch Baugruppentypen when factory changes
  useEffect(() => {
    const fetchBaugruppentypen = async () => {
      try {
        // Import the server action
        const { getBaugruppentypen } = await import('@/app/actions/baugruppentyp.actions')
        
        // Get all Baugruppentypen for this factory
        const result = await getBaugruppentypen(factoryId)
        
        if (result.success && result.data) {
          setBaugruppentypen(result.data)
          allBaugruppentypenRef.current = result.data
        }
      } catch (error) {
        console.error('Error fetching Baugruppentypen:', error)
      }
    }

    if (factoryId) {
      fetchBaugruppentypen()
    }
  }, [factoryId])

  useEffect(() => {
    if (currentView !== 'produkt' || !stencilRef.current || baugruppentypen.length === 0) {
      // Clean up if not in produkt view or no baugruppentypen
      if (stencilInstanceRef.current) {
        stencilInstanceRef.current.remove()
        stencilInstanceRef.current = null
      }
      return
    }

    // Store all Baugruppentypen in ref
    allBaugruppentypenRef.current = baugruppentypen

    // Function to create and setup stencil completely
    const createStencil = () => {
      const mainPaper = (window as any).mainJointPaper
      const mainGraph = (window as any).mainJointGraph
      if (!mainPaper || !mainGraph) {
        return
      }

      // Remove existing stencil if any
      if (stencilInstanceRef.current) {
        stencilInstanceRef.current.remove()
        stencilInstanceRef.current = null
      }

      // Clear the container
      if (stencilRef.current) {
        stencilRef.current.innerHTML = ''
      }

      // Get used Baugruppentyp IDs from the main graph
      const usedIds = new Set<string>()
      mainGraph.getElements().forEach((element: joint.dia.Element) => {
        const baugruppentyp = element.get('baugruppentyp')
        if (baugruppentyp && baugruppentyp.id) {
          usedIds.add(baugruppentyp.id)
        }
      })

      // Create shapes for available Baugruppentypen
      const shapes: joint.shapes.standard.Rectangle[] = []
      const uniformColor = { fill: '#ffffff', stroke: '#22529a' }

      allBaugruppentypenRef.current.forEach((typ, index) => {
        // Only create shape if it's not currently used in the paper
        if (!usedIds.has(typ.id)) {
          const color = uniformColor
          
          const shape = new joint.shapes.standard.Rectangle({
            size: { width: 120, height: 80 },
            attrs: {
              body: {
                fill: color.fill,
                stroke: color.stroke,
                strokeWidth: 2,
                rx: 8,
                ry: 8
              },
              label: {
                text: typ.bezeichnung,
                fill: '#22529a',
                fontSize: 14,
                fontWeight: '600',
                textWrap: {
                  width: 110,
                  height: 70,
                  ellipsis: true
                }
              }
            }
          })
          
          // Store baugruppentyp data on the shape
          shape.set('baugruppentyp', typ)
          shapes.push(shape)
        }
      })

      // Only create stencil if there are shapes to show
      if (shapes.length === 0) {
        return
      }

      // Create new Stencil without groups for simpler layout
      const stencil = new joint.ui.Stencil({
        paper: mainPaper,
        width: 280,
        height: 600,
        layout: {
          columns: 2,
          columnWidth: 120,
          rowHeight: 80,
          columnGap: 20,
          rowGap: 20,
          marginX: 20,
          marginY: 20,
          resizeToFit: false
        },
        dropAnimation: {
          duration: 300,
          easing: 'ease-in-out'
        }
      })

      stencilInstanceRef.current = stencil

      // Render and append stencil
      stencil.render()
      if (stencilRef.current) {
        stencilRef.current.appendChild(stencil.el)
      }

      // Load shapes directly without groups
      stencil.load(shapes)

      // Listen for successful drops
      stencil.on('element:drop', () => {
        // Recreate stencil after a short delay
        setTimeout(() => {
          createStencil()
        }, 100)
      })
    }

    // Wait for paper ready event
    const handlePaperReady = () => {
      createStencil()

      // Listen for element removal from main graph
      const mainGraph = (window as any).mainJointGraph
      if (mainGraph) {
        mainGraph.on('remove', (cell: joint.dia.Cell) => {
          if (cell.isElement() && cell.get('baugruppentyp')) {
            // Recreate stencil after a short delay
            setTimeout(() => {
              createStencil()
            }, 100)
          }
        })
      }
    }
    
    // Handle graph loaded event (when graph is loaded from backend)
    const handleGraphLoaded = () => {
      // Recreate stencil to reflect loaded graph state
      setTimeout(() => {
        createStencil()
      }, 200)
    }
    
    // Handle graph changed event (for undo/redo)
    const handleGraphChanged = () => {
      // Recreate stencil to reflect current graph state
      setTimeout(() => {
        createStencil()
      }, 50)
    }
    
    // Handle stencil control events
    const handleStencilControl = (event: CustomEvent) => {
      if (stencilInstanceRef.current) {
        if (event.detail === 'disable') {
          stencilInstanceRef.current.stopListening()
          setIsStencilDisabled(true)
        } else if (event.detail === 'enable') {
          stencilInstanceRef.current.startListening()
          setIsStencilDisabled(false)
        }
      }
    }
    
    // Listen for events
    window.addEventListener('jointjs-paper-ready', handlePaperReady)
    window.addEventListener('graph-loaded', handleGraphLoaded)
    window.addEventListener('graph-changed', handleGraphChanged)
    window.addEventListener('stencilControl', handleStencilControl as EventListener)
    
    // Try with a delay to ensure paper is ready
    const timeoutId = setTimeout(handlePaperReady, 100)

    // Cleanup
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('jointjs-paper-ready', handlePaperReady)
      window.removeEventListener('graph-loaded', handleGraphLoaded)
      window.removeEventListener('graph-changed', handleGraphChanged)
      window.removeEventListener('stencilControl', handleStencilControl as EventListener)
      if (stencilInstanceRef.current) {
        stencilInstanceRef.current.remove()
        stencilInstanceRef.current = null
      }
    }
  }, [currentView, baugruppentypen])

  if (currentView !== 'produkt') {
    return (
      <Sidebar 
        side="right" 
        collapsible="none"
        className="sticky top-0 hidden h-svh border-l lg:flex"
        style={{ "--sidebar-width": "20rem" } as React.CSSProperties}
      >
        <SidebarHeader className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Details</h2>
        </SidebarHeader>
        <SidebarContent>
          <div className="p-4 text-sm text-muted-foreground">
            <p>Weitere Details und Optionen werden hier angezeigt.</p>
          </div>
        </SidebarContent>
      </Sidebar>
    )
  }

  return (
    <Sidebar 
      side="right" 
      collapsible="none"
      className="sticky top-0 hidden h-svh border-l lg:flex"
      style={{ "--sidebar-width": "20rem" } as React.CSSProperties}
    >
      <SidebarHeader className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Baugruppentypen</h2>
      </SidebarHeader>
      <SidebarContent className="p-0 relative">
        <div 
          ref={stencilRef} 
          className="h-full w-full relative"
          style={{ position: 'relative' }}
        />
        {isStencilDisabled && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="text-center p-4">
              <p className="text-sm text-muted-foreground">
                Baugruppentypen sind in der Prozessstruktur-Ansicht nicht verfügbar
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Wechseln Sie zur Produktstruktur-Ansicht, um Baugruppentypen hinzuzufügen
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  )
}