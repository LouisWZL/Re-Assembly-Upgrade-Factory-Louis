'use client'

import { useState, useEffect } from 'react'
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

interface SimulationControlsBarProps {
  simulationTime?: Date
  isPlaying?: boolean
  onSimulationUpdate?: (time: Date, isPlaying: boolean) => void
}

export function SimulationControlsBar({ simulationTime, isPlaying, onSimulationUpdate }: SimulationControlsBarProps) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState([5])
  const [autoOrders, setAutoOrders] = useState(false)
  const [currentSimulationTime, setCurrentSimulationTime] = useState(new Date())
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [minThreshold, setMinThreshold] = useState(30)
  const [batchSize, setBatchSize] = useState(20)
  const [auftragsabwicklungIndex, setAuftragsabwicklungIndex] = useState(0)
  const [terminierungIndex, setTerminierungIndex] = useState(0)
  const [beschaffungIndex, setBeschaffungIndex] = useState(0)
  // New: capacity & flexibility controls
  const [demSlots, setDemSlots] = useState(4)
  const [monSlots, setMonSlots] = useState(6)
  const [flexSharePct, setFlexSharePct] = useState([50]) // percent 0..100
  const [setupTimeHours, setSetupTimeHours] = useState(2)
  const { activeFactory } = useFactory()

  // Sync with parent props
  useEffect(() => {
    if (isPlaying !== undefined) {
      setPlaying(isPlaying)
    }
  }, [isPlaying])

  useEffect(() => {
    if (simulationTime) {
      setCurrentSimulationTime(simulationTime)
    }
  }, [simulationTime])

  const handlePlayPause = () => {
    const newPlayingState = !playing
    setPlaying(newPlayingState)
    if (newPlayingState) {
      setHasStarted(true)
    }
    onSimulationUpdate?.(currentSimulationTime, newPlayingState)
  }

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
      const result = await deleteAllAuftraege(activeFactory.id)
      if (result.success) {
        setPlaying(false)
        setCurrentSimulationTime(new Date())
        setHasStarted(false)
        onSimulationUpdate?.(new Date(), false)
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
    <div className="border-t bg-background p-6">
      <div className="space-y-4">
        {/* Top row: Algorithm selection */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Algorithmus:</Label>
            <Select 
              value={auftragsabwicklungIndex.toString()} 
              onValueChange={(v) => setAuftragsabwicklungIndex(Number(v))}
              disabled={playing}
            >
              <SelectTrigger className="w-[200px] h-10">
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
            
            <Select 
              value={terminierungIndex.toString()} 
              onValueChange={(v) => setTerminierungIndex(Number(v))}
              disabled={playing}
            >
              <SelectTrigger className="w-[200px] h-10">
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
            
            <Select 
              value={beschaffungIndex.toString()} 
              onValueChange={(v) => setBeschaffungIndex(Number(v))}
              disabled={playing}
            >
              <SelectTrigger className="w-[200px] h-10">
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
        </div>

        {/* Bottom row: Controls and status */}
        <div className="flex items-center justify-between">
          {/* Left: Auto-orders */}
          <div className="flex items-center gap-4">
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
                        disabled={playing}
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
                        disabled={playing}
                        min={1}
                        max={50}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Erstelle {batchSize} neue Aufträge
                    </p>
                  </div>
                  {playing && (
                    <p className="text-xs text-amber-600">
                      Pausieren Sie die Simulation um die Werte zu ändern
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {/* Capacity & Flexibility */}
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Slots & Flex</Label>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-96">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Kapazität & Flexibilität</h4>
                    <p className="text-sm text-muted-foreground">
                      Einstellungen gelten für den modularen Algorithmus „FCFS Flex Slots“
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="dem-slots">DEM Slots</Label>
                      <Input
                        id="dem-slots"
                        type="number"
                        value={demSlots}
                        onChange={(e) => setDemSlots(Number(e.target.value))}
                        className="col-span-2 h-8"
                        disabled={playing}
                        min={0}
                        max={50}
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="mon-slots">MON Slots</Label>
                      <Input
                        id="mon-slots"
                        type="number"
                        value={monSlots}
                        onChange={(e) => setMonSlots(Number(e.target.value))}
                        className="col-span-2 h-8"
                        disabled={playing}
                        min={1}
                        max={50}
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label>Flex Anteil</Label>
                      <div className="col-span-2 flex items-center gap-2">
                        <Slider
                          value={flexSharePct}
                          onValueChange={(v) => setFlexSharePct(v)}
                          min={0}
                          max={100}
                          step={5}
                          className="w-48"
                          disabled={playing}
                        />
                        <span className="text-sm text-muted-foreground w-10">{flexSharePct[0]}%</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="setup-time">Setup (h)</Label>
                      <Input
                        id="setup-time"
                        type="number"
                        value={setupTimeHours}
                        onChange={(e) => setSetupTimeHours(Number(e.target.value))}
                        className="col-span-2 h-8"
                        disabled={playing}
                        min={0}
                        max={12}
                      />
                    </div>
                  </div>
                  {playing && (
                    <p className="text-xs text-amber-600">
                      Pausieren Sie die Simulation um die Werte zu ändern
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Center: Play controls */}
          <div className="flex items-center gap-4">
            <Button
              size="default"
              variant="outline"
              onClick={handlePlayPause}
              className="h-10 px-4"
            >
              {playing ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </>
              )}
            </Button>
            
            <Button
              size="default"
              variant="outline"
              onClick={handleRestart}
              className="h-10 px-4"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          {/* Right: Status and speed */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`h-3 w-3 rounded-full ${
                  playing 
                    ? 'bg-green-500' 
                    : hasStarted
                      ? 'bg-orange-500'
                      : 'bg-red-500'
                }`} />
                {playing && (
                  <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-500 animate-ping" />
                )}
              </div>
              <div className="bg-muted rounded px-3 py-2 font-mono text-sm font-medium">
                {currentSimulationTime.toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
                {' '}
                {currentSimulationTime.toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Label className="text-sm text-muted-foreground">Speed:</Label>
              <Slider
                value={speed}
                onValueChange={handleSpeedChange}
                min={0.5}
                max={20}
                step={0.5}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground w-12 text-right">{speed[0]}x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Component */}
      {activeFactory && (
        <Simulation
          factoryId={activeFactory.id}
          isPlaying={playing}
          speed={speed[0]}
          autoOrders={autoOrders}
          minThreshold={minThreshold}
          batchSize={batchSize}
          auftragsabwicklungIndex={auftragsabwicklungIndex}
          terminierungIndex={terminierungIndex}
          beschaffungIndex={beschaffungIndex}
          demSlots={demSlots}
          monSlots={monSlots}
          flexShare={flexSharePct[0] / 100}
          setupTimeHours={setupTimeHours}
          onTimeUpdate={setCurrentSimulationTime}
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
    </div>
  )
}
