'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Save, Clock, Wrench, TrendingUp } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { updateFactoryName, updateFactoryCapacity, getFactory, updateFactorySchichtmodell, updateFactoryMontagestationen, updateFactoryTargetBatchAverage, updateFactoryPflichtUpgradeSchwelle } from '@/app/actions/factory.actions'

interface FactoryEinstellungenProps {
  factoryId: string
}

export function FactoryEinstellungen({ factoryId }: FactoryEinstellungenProps) {
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [savingCapacity, setSavingCapacity] = useState(false)
  const [savingSchichtmodell, setSavingSchichtmodell] = useState(false)
  const [savingMontagestationen, setSavingMontagestationen] = useState(false)
  const [savingTargetBatchAverage, setSavingTargetBatchAverage] = useState(false)
  const [savingPflichtUpgradeSchwelle, setSavingPflichtUpgradeSchwelle] = useState(false)
  const [factoryData, setFactoryData] = useState<any>(null)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [schichtmodell, setSchichtmodell] = useState('EINSCHICHT')
  const [montagestationen, setMontagestationen] = useState('')
  const [targetBatchAverage, setTargetBatchAverage] = useState(65)
  const [pflichtUpgradeSchwelle, setPflichtUpgradeSchwelle] = useState(30)

  useEffect(() => {
    loadFactoryData()
  }, [factoryId])

  const loadFactoryData = async () => {
    setLoading(true)
    try {
      const result = await getFactory(factoryId)
      if (result.success && result.data) {
        setFactoryData(result.data)
        setName(result.data.name)
        setCapacity(result.data.kapazität.toString())
        setSchichtmodell(result.data.schichtmodell || 'EINSCHICHT')
        setMontagestationen(result.data.anzahlMontagestationen?.toString() || '10')
        setTargetBatchAverage(result.data.targetBatchAverage || 65)
        setPflichtUpgradeSchwelle(result.data.pflichtUpgradeSchwelle || 30)
      } else {
        toast.error('Fehler beim Laden der Factory-Daten')
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateName = async () => {
    if (!name.trim()) {
      toast.error('Bitte geben Sie einen Namen ein')
      return
    }

    setSavingName(true)
    try {
      const result = await updateFactoryName(factoryId, name.trim())
      if (result.success) {
        toast.success(result.message)
        await loadFactoryData()
        // Trigger sidebar refresh
        window.dispatchEvent(new CustomEvent('factoryUpdated'))
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setSavingName(false)
    }
  }

  const handleUpdateCapacity = async () => {
    const capacityValue = parseInt(capacity)
    
    if (isNaN(capacityValue) || capacityValue < 1) {
      toast.error('Bitte geben Sie eine gültige Kapazität ein (mindestens 1)')
      return
    }

    setSavingCapacity(true)
    try {
      const result = await updateFactoryCapacity(factoryId, capacityValue)
      if (result.success) {
        toast.success(result.message)
        await loadFactoryData()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setSavingCapacity(false)
    }
  }

  const handleUpdateSchichtmodell = async () => {
    setSavingSchichtmodell(true)
    try {
      const result = await updateFactorySchichtmodell(factoryId, schichtmodell as 'EINSCHICHT' | 'ZWEISCHICHT' | 'DREISCHICHT')
      if (result.success) {
        toast.success(result.message)
        await loadFactoryData()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setSavingSchichtmodell(false)
    }
  }

  const handleUpdateMontagestationen = async () => {
    const stationenValue = parseInt(montagestationen)
    
    if (isNaN(stationenValue) || stationenValue < 1 || stationenValue > 100) {
      toast.error('Bitte geben Sie eine gültige Anzahl ein (1-100)')
      return
    }

    setSavingMontagestationen(true)
    try {
      const result = await updateFactoryMontagestationen(factoryId, stationenValue)
      if (result.success) {
        toast.success(result.message)
        await loadFactoryData()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setSavingMontagestationen(false)
    }
  }

  const handleUpdateBaugruppenzustand = async () => {
    setSavingTargetBatchAverage(true)
    setSavingPflichtUpgradeSchwelle(true)
    
    try {
      // Update both values
      const [averageResult, schwelleResult] = await Promise.all([
        updateFactoryTargetBatchAverage(factoryId, targetBatchAverage),
        updateFactoryPflichtUpgradeSchwelle(factoryId, pflichtUpgradeSchwelle)
      ])
      
      if (averageResult.success && schwelleResult.success) {
        toast.success('Baugruppenzustand-Einstellungen erfolgreich aktualisiert')
        await loadFactoryData()
      } else {
        if (!averageResult.success) {
          toast.error(averageResult.error || 'Fehler beim Aktualisieren des Durchschnittswerts')
        }
        if (!schwelleResult.success) {
          toast.error(schwelleResult.error || 'Fehler beim Aktualisieren der Pflicht-Upgrade Schwelle')
        }
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setSavingTargetBatchAverage(false)
      setSavingPflichtUpgradeSchwelle(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid gap-6">
            <div className="h-48 bg-muted rounded"></div>
            <div className="h-48 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6">
      <h2 className="text-2xl font-bold mb-6">Fabrikeinstellungen</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        {/* Factory Name Card */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Re-Assembly Upgrade Factory Name</CardTitle>
            <CardDescription>
              Bearbeiten Sie den Namen Ihrer Re-Assembly Upgrade Factory
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-1">
            <div className="flex-1">
              <div className="space-y-2">
                <Label htmlFor="factoryName">Name</Label>
                <Input
                  id="factoryName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Stuttgart Factory"
                  disabled={savingName}
                />
              </div>
            </div>
            <div className="pt-4">
              <Button 
                onClick={handleUpdateName}
                disabled={savingName || name === factoryData?.name}
                size="sm"
              >
                {savingName ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Factory Capacity Card */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Re-Assembly Upgrade Factory Kapazität</CardTitle>
            <CardDescription>
              Die Kapazität der Re-Assembly Upgrade Factory gibt an, wie viele Produkte gleichzeitig in der Factory bearbeitet werden können. 
              Diese Einstellung beeinflusst die Produktionsplanung und Terminierung von Aufträgen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-1">
            <div className="flex-1">
              <div className="space-y-2">
                <Label htmlFor="factoryCapacity">Kapazität (Gleichzeitig bearbeitbare Produkte)</Label>
                <Input
                  id="factoryCapacity"
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="z.B. 50"
                  min="1"
                  disabled={savingCapacity}
                />
                <p className="text-sm text-muted-foreground">
                  Aktuelle Auslastung: {factoryData?.auftraege?.length || 0} von {capacity} Aufträgen
                </p>
              </div>
            </div>
            <div className="pt-4">
              <Button 
                onClick={handleUpdateCapacity}
                disabled={savingCapacity || capacity === factoryData?.kapazität?.toString()}
                size="sm"
              >
                {savingCapacity ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Schichtmodell Card */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Schichtmodell
            </CardTitle>
            <CardDescription>
              Wählen Sie das Schichtmodell für Ihre Re-Assembly Upgrade Factory. 
              Dies bestimmt, wie viele Stunden pro Tag produziert werden kann.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-1">
            <div className="flex-1">
              <div className="space-y-2">
                <Label htmlFor="schichtmodell">Schichtmodell</Label>
                <Select
                  value={schichtmodell}
                  onValueChange={setSchichtmodell}
                  disabled={savingSchichtmodell}
                >
                  <SelectTrigger id="schichtmodell">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EINSCHICHT">
                      <div>
                        <div className="font-medium">Einschicht</div>
                        <div className="text-sm text-muted-foreground">8 Stunden pro Tag</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="ZWEISCHICHT">
                      <div>
                        <div className="font-medium">Zweischicht</div>
                        <div className="text-sm text-muted-foreground">16 Stunden pro Tag</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="DREISCHICHT">
                      <div>
                        <div className="font-medium">Dreischicht</div>
                        <div className="text-sm text-muted-foreground">24 Stunden pro Tag</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="pt-4">
              <Button 
                onClick={handleUpdateSchichtmodell}
                disabled={savingSchichtmodell || schichtmodell === factoryData?.schichtmodell}
                size="sm"
              >
                {savingSchichtmodell ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Montagestationen Card */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Montagestationen
            </CardTitle>
            <CardDescription>
              Die Anzahl der Montagestationen bestimmt, wie viele Baugruppen gleichzeitig 
              bearbeitet werden können. Mehr Stationen ermöglichen eine höhere Parallelisierung.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-1">
            <div className="flex-1">
              <div className="space-y-2">
                <Label htmlFor="montagestationen">Anzahl Montagestationen</Label>
                <Input
                  id="montagestationen"
                  type="number"
                  value={montagestationen}
                  onChange={(e) => setMontagestationen(e.target.value)}
                  placeholder="z.B. 10"
                  min="1"
                  max="100"
                  disabled={savingMontagestationen}
                />
                <p className="text-sm text-muted-foreground">
                  Empfohlen: 5-20 Stationen je nach Produktkomplexität
                </p>
              </div>
            </div>
            <div className="pt-4">
              <Button 
                onClick={handleUpdateMontagestationen}
                disabled={savingMontagestationen || montagestationen === factoryData?.anzahlMontagestationen?.toString()}
                size="sm"
              >
                {savingMontagestationen ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Baugruppenzustand Card */}
        <Card className="flex flex-col h-full col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Baugruppenzustand
            </CardTitle>
            <CardDescription>
              Konfigurieren Sie den durchschnittlichen Zustand für Baugruppen in Aufträgen und die Schwelle für automatische Pflicht-Upgrades.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col flex-1">
            <div className="flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Durchschnittlicher Zustand */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Durchschnittlicher Baugruppenzustand</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="targetBatchAverage">Durchschnitt</Label>
                      <span className="text-2xl font-bold text-primary">{targetBatchAverage}%</span>
                    </div>
                    <Slider
                      id="targetBatchAverage"
                      min={10}
                      max={90}
                      step={1}
                      value={[targetBatchAverage]}
                      onValueChange={(value) => setTargetBatchAverage(value[0])}
                      disabled={savingTargetBatchAverage}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>10%</span>
                      <span>50%</span>
                      <span>90%</span>
                    </div>
                  </div>
                </div>
                
                {/* Pflicht-Upgrade Schwelle */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Pflicht-Upgrade Schwelle</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pflichtUpgradeSchwelle">Schwellenwert</Label>
                      <span className="text-2xl font-bold text-destructive">{pflichtUpgradeSchwelle}%</span>
                    </div>
                    <Slider
                      id="pflichtUpgradeSchwelle"
                      min={0}
                      max={100}
                      step={5}
                      value={[pflichtUpgradeSchwelle]}
                      onValueChange={(value) => setPflichtUpgradeSchwelle(value[0])}
                      disabled={savingPflichtUpgradeSchwelle}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg bg-muted p-3 mt-6">
                <p className="text-sm text-muted-foreground">
                  <strong>Info:</strong> Baugruppen mit einem Zustand unter {pflichtUpgradeSchwelle}% werden automatisch 
                  als Pflicht-Upgrade markiert. Die Farbcodierung erfolgt dynamisch:
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    0-{pflichtUpgradeSchwelle}%
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-amber-500 rounded"></div>
                    {pflichtUpgradeSchwelle + 1}-{pflichtUpgradeSchwelle + Math.floor((100 - pflichtUpgradeSchwelle) / 2)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    {pflichtUpgradeSchwelle + Math.floor((100 - pflichtUpgradeSchwelle) / 2) + 1}-100%
                  </span>
                </div>
              </div>
            </div>
            
            <div className="pt-4">
              <Button 
                onClick={handleUpdateBaugruppenzustand}
                disabled={
                  (savingTargetBatchAverage || savingPflichtUpgradeSchwelle) ||
                  (targetBatchAverage === (factoryData?.targetBatchAverage || 65) && 
                   pflichtUpgradeSchwelle === (factoryData?.pflichtUpgradeSchwelle || 30))
                }
                size="sm"
              >
                {(savingTargetBatchAverage || savingPflichtUpgradeSchwelle) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}