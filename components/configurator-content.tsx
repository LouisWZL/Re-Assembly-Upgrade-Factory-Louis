'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, Package, Car, Wrench, Cpu, Cog } from 'lucide-react'
import { BaugruppenManagement } from '@/components/baugruppen-management'
import { FactoryEinstellungen } from '@/components/factory-einstellungen'
import { ProduktManagement } from '@/components/produkt-management'
import { JointJSProductView } from '@/components/jointjs-product-view'
import { SidebarInsetHeader } from '@/components/sidebar-inset-header'
import { SidebarInset } from '@/components/ui/sidebar'
import { ConfiguratorWelcome } from '@/components/configurator-welcome'
import { useView } from '@/contexts/view-context'
import { toast } from 'sonner'
import { updateProduktGraph } from '@/app/actions/produkt.actions'
import { AlertCircle } from 'lucide-react'

interface Variante {
  id: string
  bezeichnung: string
  zustand: string | null
  typ: string
  baugruppen: Baugruppe[]
}

interface Baugruppe {
  id: string
  bezeichnung: string
  artikelnummer: string
  variantenTyp: string
  prozesszeit: number | null
  volumen: number | null
  prozesse: Prozess[]
  baugruppentyp?: {
    id: string
    bezeichnung: string
  }
}

interface Prozess {
  id: string
  name: string
}

interface Baugruppentyp {
  id: string
  bezeichnung: string
  beschreibung?: string | null
}

interface Produkt {
  id: string
  bezeichnung: string
  seriennummer: string
  baugruppentypen?: Baugruppentyp[]
  varianten: Variante[]
}

interface ConfiguratorContentProps {
  factoryId: string
}

// Icon mapping for Baugruppentypen
const baugruppentypenIcons: Record<string, React.ComponentType<any>> = {
  Chassis: Car,
  Karosserie: Car,
  Fahrwerk: Wrench,
  Interieur: Package,
  Elektronik: Cpu,
  Antrieb: Cog,
}

export function ConfiguratorContent({ factoryId }: ConfiguratorContentProps) {
  const [selectedVariante, setSelectedVariante] = useState<Variante | null>(null)
  const [selectedProdukt, setSelectedProdukt] = useState<Produkt | null>(null)
  const [allBaugruppen, setAllBaugruppen] = useState<Baugruppe[]>([])
  const [allBaugruppentypen, setAllBaugruppentypen] = useState<Baugruppentyp[]>([])
  const [allProzesse, setAllProzesse] = useState<Prozess[]>([])
  const [loading, setLoading] = useState(false)
  const [factoryData, setFactoryData] = useState<any>(null)
  const { currentView, setCurrentView } = useView()
  
  // States for JointJS controls
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeGraphView, setActiveGraphView] = useState<'structure' | 'process'>('structure')
  
  // Control handlers for JointJS (define before any early returns)
  const handleZoomIn = useCallback(() => {
    if (window.jointJSZoomIn) window.jointJSZoomIn()
  }, [])
  
  const handleZoomOut = useCallback(() => {
    if (window.jointJSZoomOut) window.jointJSZoomOut()
  }, [])
  
  const handleZoomToFit = useCallback(() => {
    if (window.jointJSZoomToFit) window.jointJSZoomToFit()
  }, [])
  
  const handleUndo = useCallback(() => {
    if (window.jointJSUndo) window.jointJSUndo()
  }, [])
  
  const handleRedo = useCallback(() => {
    if (window.jointJSRedo) window.jointJSRedo()
  }, [])
  
  const handleSave = useCallback(async () => {
    if (window.jointJSSave) {
      window.jointJSSave()
    }
  }, [])
  
  const handleViewChange = useCallback(async (view: 'structure' | 'process') => {
    // Save current graph before switching
    if (window.jointJSSave) {
      await window.jointJSSave()
    }
    
    setActiveGraphView(view)
    // Dispatch event for JointJS view to handle
    window.dispatchEvent(new CustomEvent('graphViewChanged', { detail: view }))
  }, [])

  const fetchFactoryData = async () => {
    try {
      console.log('🏭 ConfiguratorContent: Fetching factory data for ID:', factoryId)
      
      const [factoryResponse, baugruppenResponse] = await Promise.all([
        fetch('/api/factories', { cache: 'no-store' }),
        fetch(`/api/baugruppen?factoryId=${factoryId}`, { cache: 'no-store' })
      ])
      
      const factoryData = await factoryResponse.json()
      const baugruppenData = await baugruppenResponse.json()
      
      console.log('🏭 ConfiguratorContent: Factory response:', factoryData)
      console.log('🏭 ConfiguratorContent: Baugruppen response:', baugruppenData)
      
      // Check if data is an array
      if (!Array.isArray(factoryData)) {
        console.error('❌ Invalid factory response format:', factoryData)
        return
      }
      
      const factory = factoryData.find((f: any) => f.id === factoryId)
      console.log('🏭 ConfiguratorContent: Found factory:', factory)
      
      if (factory) {
        setFactoryData(factory)
        console.log('✅ ConfiguratorContent: Factory set with products:', factory.produkte?.length || 0)
        
        // Set Baugruppen from API response
        if (baugruppenData && Array.isArray(baugruppenData)) {
          setAllBaugruppen(baugruppenData)
          console.log('✅ ConfiguratorContent: Set', baugruppenData.length, 'Baugruppen')
          
          // Sammle Prozesse aus den Baugruppen
          const prozesseMap = new Map<string, Prozess>()
          baugruppenData.forEach((baugruppe: Baugruppe) => {
            if (baugruppe.prozesse) {
              baugruppe.prozesse.forEach((prozess: Prozess) => {
                prozesseMap.set(prozess.id, prozess)
              })
            }
          })
          setAllProzesse(Array.from(prozesseMap.values()))
          console.log('✅ ConfiguratorContent: Set', prozesseMap.size, 'Prozesse')
        }
        
        // Sammle Baugruppentypen von der Factory
        if (factory.baugruppentypen && Array.isArray(factory.baugruppentypen)) {
          setAllBaugruppentypen(factory.baugruppentypen)
          console.log('✅ ConfiguratorContent: Set', factory.baugruppentypen.length, 'Baugruppentypen from factory')
        } else {
          // Fallback: Sammle Baugruppentypen aus den Baugruppen
          const baugruppentypMap = new Map<string, Baugruppentyp>()
          baugruppenData.forEach((baugruppe: Baugruppe) => {
            if (baugruppe.baugruppentyp) {
              baugruppentypMap.set(baugruppe.baugruppentyp.id, baugruppe.baugruppentyp)
            }
          })
          setAllBaugruppentypen(Array.from(baugruppentypMap.values()))
          console.log('✅ ConfiguratorContent: Set', baugruppentypMap.size, 'Baugruppentypen from Baugruppen (fallback)')
        }
      } else {
        console.error('❌ Factory not found with ID:', factoryId)
        console.error('Available factory IDs:', factoryData.map((f: any) => f.id))
      }
    } catch (error) {
      console.error('❌ Error fetching factory data:', error)
    }
  }

  useEffect(() => {
    fetchFactoryData()
  }, [factoryId])

  useEffect(() => {
    const handleVarianteSelection = async (event: CustomEvent) => {
      setCurrentView('variante')
      setLoading(true)
      const varianteId = event.detail
      
      try {
        const response = await fetch('/api/factories')
        const data = await response.json()
        
        // Check if data is an array
        if (!Array.isArray(data)) {
          console.error('Invalid response format:', data)
          setLoading(false)
          return
        }
        
        const factory = data.find((f: any) => f.id === factoryId)
        
        if (factory) {
          // Finde die ausgewählte Variante
          for (const produkt of factory.produkte) {
            const variante = produkt.varianten.find((v: Variante) => v.id === varianteId)
            if (variante) {
              setSelectedVariante(variante)
              break
            }
          }
        }
        
        setLoading(false)
      } catch (error) {
        console.error('Error fetching variante details:', error)
        setLoading(false)
      }
    }

    const handleViewChange = (event: CustomEvent) => {
      const view = event.detail
      setCurrentView(view)
      if (view !== 'variante') {
        setSelectedVariante(null)
      }
      if (view !== 'produkt') {
        setSelectedProdukt(null)
      }
    }

    const handleProduktSelection = async (event: CustomEvent) => {
      setCurrentView('produkt')
      const produktId = event.detail
      
      try {
        const response = await fetch('/api/factories')
        const data = await response.json()
        
        if (!Array.isArray(data)) {
          console.error('Invalid response format:', data)
          return
        }
        
        const factory = data.find((f: any) => f.id === factoryId)
        if (factory) {
          const produkt = factory.produkte.find((p: Produkt) => p.id === produktId)
          if (produkt) {
            setSelectedProdukt(produkt)
          }
        }
      } catch (error) {
        console.error('Error fetching product details:', error)
      }
    }

    window.addEventListener('varianteSelected', handleVarianteSelection as unknown as EventListener)
    window.addEventListener('viewChanged', handleViewChange as unknown as EventListener)
    window.addEventListener('produktSelected', handleProduktSelection as unknown as EventListener)
    
    return () => {
      window.removeEventListener('varianteSelected', handleVarianteSelection as unknown as EventListener)
      window.removeEventListener('viewChanged', handleViewChange as unknown as EventListener)
      window.removeEventListener('produktSelected', handleProduktSelection as unknown as EventListener)
    }
  }, [factoryId])

  // Home View
  if (currentView === 'home') {
    return (
      <div>
        <ConfiguratorWelcome />
        {allBaugruppentypen.length === 0 && allBaugruppen.length === 0 && (
          <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-md">
            <h3 className="text-red-800 font-semibold">⚠️ Factory Configuration Debug</h3>
            <p className="text-red-600 text-sm mt-2">
              Current Factory ID: <code>{factoryId}</code><br/>
              Baugruppentypen loaded: {allBaugruppentypen.length}<br/>
              Baugruppen loaded: {allBaugruppen.length}<br/>
              Factory data: {factoryData ? `${factoryData.name} with ${factoryData.produkte?.length || 0} products` : 'None'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Reload Configuration
            </button>
          </div>
        )}
      </div>
    )
  }

  // Baugruppen View
  if (currentView === 'baugruppen') {
    return <BaugruppenManagement factoryId={factoryId} />
  }

  // Einstellungen View
  if (currentView === 'einstellungen') {
    return <FactoryEinstellungen factoryId={factoryId} />
  }

  // Produkte View (renamed from Prozesse)
  if (currentView === 'produkte') {
    return <ProduktManagement factoryId={factoryId} />
  }

  // Produkt View
  if (currentView === 'produkt' && selectedProdukt) {
    return (
      <SidebarInset className="flex flex-col h-full">
        <SidebarInsetHeader
          produktName={selectedProdukt.bezeichnung}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomToFit={handleZoomToFit}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onSave={handleSave}
          isSaving={isSaving}
          showTabs={true}
          activeView={activeGraphView}
          onViewChange={handleViewChange}
        />
        {activeGraphView === 'structure' && (
          <div className="bg-amber-50 border-y border-amber-200 px-6 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-900">
                <strong>Hinweis zur Produktstruktur:</strong> Erstellen Sie die Baumstruktur von links nach rechts. 
                Die zuerst demontierbaren Baugruppen befinden sich links, während die zuletzt demontierbaren 
                Baugruppen rechts positioniert werden. Diese Anordnung definiert die Demontagereihenfolge 
                im Prozessgraph.
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <JointJSProductView 
            produktId={selectedProdukt.id} 
            produktName={selectedProdukt.bezeichnung}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomToFit={handleZoomToFit}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onCanUndoChange={setCanUndo}
            onCanRedoChange={setCanRedo}
            onSave={handleSave}
            onSavingChange={setIsSaving}
            activeView={activeGraphView}
          />
        </div>
      </SidebarInset>
    )
  }

  // Varianten View
  if (currentView === 'variante' && !selectedVariante) {
    return null
  }

  if (currentView === 'variante' && selectedVariante) {
    return (
    <div className="flex flex-col h-full p-6 gap-6">
      {/* Oberer Bereich - 60vh */}
      <div className="flex-[6] min-h-0">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{selectedVariante.bezeichnung}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <span className="font-semibold">ID:</span> {selectedVariante.id}
              </div>
              <div>
                <span className="font-semibold">Typ:</span>{' '}
                <Badge variant="default">
                  {selectedVariante.typ}
                </Badge>
              </div>
              <div>
                <span className="font-semibold">Zustand:</span>{' '}
                <Badge variant={selectedVariante.zustand === 'SEHR_GUT' ? 'default' : 'secondary'}>
                  {selectedVariante.zustand || 'N/A'}
                </Badge>
              </div>
              <div>
                <span className="font-semibold">Varianten-Typ:</span>{' '}
                <Badge variant="outline">
                  {selectedVariante.typ}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unterer Bereich - 40vh */}
      <div className="flex-[4] min-h-0 grid grid-cols-2 gap-6">
        {/* Baugruppen Tabelle */}
        <Card className="overflow-hidden">
          <CardHeader className="py-4">
            <CardTitle className="text-base">Verfügbare Baugruppen für {selectedVariante.typ} Varianten</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto h-[calc(100%-4rem)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Art-Nr.</TableHead>
                    <TableHead>Prozesszeit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allBaugruppen
                    .filter(bg => bg.variantenTyp === selectedVariante.typ || bg.variantenTyp === 'basicAndPremium')
                    .map((baugruppe) => (
                      <TableRow key={baugruppe.id}>
                        <TableCell className="font-medium">{baugruppe.bezeichnung}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {baugruppe.baugruppentyp?.bezeichnung || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>{baugruppe.artikelnummer}</TableCell>
                        <TableCell>
                          {(baugruppe as any).montagezeit ? `${(baugruppe as any).montagezeit} Min` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Prozesse Tabelle */}
        <Card className="overflow-hidden">
          <CardHeader className="py-4">
            <CardTitle className="text-base">Alle Prozesse der Factory</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto h-[calc(100%-4rem)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prozess</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allProzesse.map((prozess) => (
                    <TableRow key={prozess.id}>
                      <TableCell className="font-medium">{prozess.name}</TableCell>
                      <TableCell className="text-muted-foreground">{prozess.id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    )
  }

  // Default - return Home view if no view matches or view is empty
  return <ConfiguratorWelcome />
}