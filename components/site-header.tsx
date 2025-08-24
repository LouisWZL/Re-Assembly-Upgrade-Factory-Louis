"use client"

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Play, Pause, RotateCcw, Loader2, Settings } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { auftragsabwicklungAlgorithmen, terminierungAlgorithmen, beschaffungAlgorithmen } from '@/components/simulation/registry'
import { FactorySwitcher } from '@/components/factory-switcher'
import { useFactory } from '@/contexts/factory-context'
import { deleteAllAuftraege } from '@/app/actions/auftrag.actions'
import { Simulation } from '@/components/simulation/simulation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface SiteHeaderProps {
  onSimulationUpdate?: (time: Date, isPlaying: boolean) => void
}

export function SiteHeader({ onSimulationUpdate }: SiteHeaderProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState([1])
  const [autoOrders, setAutoOrders] = useState(false)
  const [simulationTime, setSimulationTime] = useState(new Date())
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [minThreshold, setMinThreshold] = useState(30) // Minimum-Schwelle für Auto-Aufträge
  const [batchSize, setBatchSize] = useState(20) // Batch-Größe für Auto-Aufträge
  const [auftragsabwicklungIndex, setAuftragsabwicklungIndex] = useState(0) // Standard: Algorithmus 1
  const [terminierungIndex, setTerminierungIndex] = useState(0) // Standard: Algorithmus 1
  const [beschaffungIndex, setBeschaffungIndex] = useState(0) // Standard: Algorithmus 1
  const { activeFactory } = useFactory()
  const pathname = usePathname()
  const isConfigurator = pathname.startsWith('/factory-configurator/')
  const isSimulation = pathname.startsWith('/simulation')
  
  // Determine current tab based on pathname
  const getCurrentTab = () => {
    if (isSimulation) return 'simulation'
    if (isConfigurator) return 'factory-configurator'
    return 'auftragsübersicht'
  }

  const handlePlayPause = () => {
    const newPlayingState = !isPlaying
    setIsPlaying(newPlayingState)
    if (newPlayingState) {
      setHasStarted(true)
    }
    onSimulationUpdate?.(simulationTime, newPlayingState)
  }
  
  // Notify when simulation time changes
  useEffect(() => {
    onSimulationUpdate?.(simulationTime, isPlaying)
  }, [simulationTime, isPlaying, onSimulationUpdate])

  const handleRestart = async () => {
    setShowResetDialog(true)
  }

  const handleConfirmReset = async () => {
    if (!activeFactory) {
      toast.error('Keine Factory ausgewählt')
      return
    }

    setResetting(true)
    try {
      // Delete all orders for this factory
      const result = await deleteAllAuftraege(activeFactory.id)
      if (result.success) {
        // Reset simulation
        setIsPlaying(false)
        setSimulationTime(new Date())
        setHasStarted(false)
        toast.success('Simulation und Aufträge zurückgesetzt')
      } else {
        toast.error(result.error || 'Fehler beim Zurücksetzen')
      }
    } catch (error) {
      console.error('Error resetting simulation:', error)
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setResetting(false)
      setShowResetDialog(false)
    }
  }

  const handleSpeedChange = (value: number[]) => {
    setSpeed(value)
  }

  return (
    <header className="flex sticky top-0 z-50 w-full items-center border-b bg-background">
      <div className="flex h-14 w-full items-center gap-4 px-4">
        <FactorySwitcher />
        
        {/* Main Navigation Tabs */}
        <Tabs value={getCurrentTab()} className="flex-1">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 bg-gray-100">
            <TabsTrigger value="auftragsübersicht" className="data-[state=active]:bg-white" asChild>
              <Link href="/">Auftragsübersicht</Link>
            </TabsTrigger>
            <TabsTrigger value="factory-configurator" className="data-[state=active]:bg-white" asChild>
              <Link href={`/factory-configurator/${activeFactory?.id || ''}`}>Factory Konfiguration</Link>
            </TabsTrigger>
            <TabsTrigger value="simulation" className="data-[state=active]:bg-white" asChild>
              <Link href="/simulation">Simulation</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex-1" />
        
        {/* WZL Logo */}
        <div className="flex items-center">
          <img 
            src="/wzl-logo.svg" 
            alt="WZL RWTH Aachen University" 
            className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity"
          />
        </div>
        
        <div className="flex items-center gap-6">
          {false && (
            <>
              {/* Simulation Controls */}
              <div className="flex items-center gap-4">
              
              {/* Algorithmus-Auswahl */}
              <div className="flex items-center gap-2">
                {/* Auftragsabwicklung */}
                <Select 
                  value={auftragsabwicklungIndex.toString()} 
                  onValueChange={(v) => setAuftragsabwicklungIndex(Number(v))}
                  disabled={isPlaying}
                >
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue placeholder="Auftragsabwicklung" />
                  </SelectTrigger>
                  <SelectContent>
                    {auftragsabwicklungAlgorithmen.map((algo, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {algo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Terminierung */}
                <Select 
                  value={terminierungIndex.toString()} 
                  onValueChange={(v) => setTerminierungIndex(Number(v))}
                  disabled={isPlaying}
                >
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue placeholder="Terminierung" />
                  </SelectTrigger>
                  <SelectContent>
                    {terminierungAlgorithmen.map((algo, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {algo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Beschaffung */}
                <Select 
                  value={beschaffungIndex.toString()} 
                  onValueChange={(v) => setBeschaffungIndex(Number(v))}
                  disabled={isPlaying}
                >
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue placeholder="Beschaffung" />
                  </SelectTrigger>
                  <SelectContent>
                    {beschaffungAlgorithmen.map((algo, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {algo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Auto-Aufträge Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      id="auto-orders"
                      checked={autoOrders}
                      onCheckedChange={(checked) => setAutoOrders(checked as boolean)}
                    />
                    <Label 
                      htmlFor="auto-orders" 
                      className="text-sm cursor-pointer"
                      title="Automatisch neue Aufträge erstellen"
                    >
                      Auto-Aufträge
                    </Label>
                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Auto-Aufträge Einstellungen</h4>
                      <p className="text-sm text-muted-foreground">
                        Konfigurieren Sie die automatische Auftragserstellung
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid grid-cols-3 items-center gap-4">
                        <Label htmlFor="min-threshold">Minimum</Label>
                        <Input
                          id="min-threshold"
                          type="number"
                          value={minThreshold}
                          onChange={(e) => setMinThreshold(Number(e.target.value))}
                          className="col-span-2 h-8"
                          disabled={isPlaying}
                          min={1}
                          max={100}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Wenn weniger als {minThreshold} Aufträge in Auftragsannahme
                      </p>
                      <div className="grid grid-cols-3 items-center gap-4">
                        <Label htmlFor="batch-size">Batch-Größe</Label>
                        <Input
                          id="batch-size"
                          type="number"
                          value={batchSize}
                          onChange={(e) => setBatchSize(Number(e.target.value))}
                          className="col-span-2 h-8"
                          disabled={isPlaying}
                          min={1}
                          max={50}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Erstelle {batchSize} neue Aufträge
                      </p>
                    </div>
                    {isPlaying && (
                      <p className="text-xs text-amber-600">
                        Pausieren Sie die Simulation um die Werte zu ändern
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handlePlayPause}
                className="h-8 w-8 p-0"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleRestart}
                className="h-8 w-8 p-0"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              
              {/* Digitale Uhr mit Status-Indikator */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className={`h-3 w-3 rounded-full ${
                    isPlaying 
                      ? 'bg-green-500' 
                      : hasStarted
                        ? 'bg-orange-500'
                        : 'bg-red-500'
                  }`} />
                  {isPlaying && (
                    <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-500 animate-ping" />
                  )}
                </div>
                <div className="bg-muted rounded px-3 py-1 font-mono text-sm font-medium">
                  {simulationTime.toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })}
                  {' '}
                  {simulationTime.toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Speed:</span>
                <Slider
                  value={speed}
                  onValueChange={handleSpeedChange}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground w-8">{speed[0]}x</span>
              </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Simulation Component */}
      {activeFactory && getCurrentTab() === 'auftragsübersicht' && (
        <Simulation
          factoryId={activeFactory.id}
          isPlaying={isPlaying}
          speed={speed[0]}
          autoOrders={autoOrders}
          minThreshold={minThreshold}
          batchSize={batchSize}
          auftragsabwicklungIndex={auftragsabwicklungIndex}
          terminierungIndex={terminierungIndex}
          beschaffungIndex={beschaffungIndex}
          onTimeUpdate={setSimulationTime}
        />
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Simulation zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion wird die Simulation zurücksetzen und <strong>alle Aufträge dieser Factory löschen</strong>. 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmReset}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lösche...
                </>
              ) : (
                'Zurücksetzen & Löschen'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}