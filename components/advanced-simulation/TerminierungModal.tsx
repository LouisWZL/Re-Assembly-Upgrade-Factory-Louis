'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Target, Settings, Zap, Edit2, ExternalLink } from 'lucide-react'
import { getAllAlgorithmBundles, setActiveAlgorithmBundle } from '@/app/actions/algorithm-bundle.actions'
import { toast } from 'sonner'
import Link from 'next/link'

interface TerminierungModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'grobterminierung' | 'durchlaufterminierung' | 'feinterminierung'
  factoryId?: string
}

// Grobterminierung (Long-term scheduling) algorithms
const grobterminierungAlgorithms = {
  'incoming_plus_avg': {
    name: 'Eingangszeit + Ø Durchlaufzeit',
    description: 'Ankunftszeit des Auftrags plus durchschnittliche Bearbeitungszeit aller Stationen'
  },
  'incoming_plus_max': {
    name: 'Eingangszeit + Max Durchlaufzeit',
    description: 'Ankunftszeit des Auftrags plus maximale mögliche Bearbeitungszeit (Worst-Case)'
  },
  'incoming_plus_min': {
    name: 'Eingangszeit + Min Durchlaufzeit',
    description: 'Ankunftszeit des Auftrags plus minimale theoretische Bearbeitungszeit (Best-Case)'
  },
  'customer_priority_based': {
    name: 'Kundenprioritäts-Terminierung',
    description: 'Terminschätzung basierend auf Kundenstatus (Premium-Kunden erhalten frühere Termine)'
  },
  'resource_availability': {
    name: 'Ressourcenverfügbarkeits-Modell',
    description: 'Berücksichtigt aktuelle Stationsauslastung und Warteschlangen für realistischere Schätzungen'
  },
  'empty_slot_1': {
    name: '--- Algorithmus-Slot 1 ---',
    description: 'Dieser Slot ist für zukünftige Erweiterungen reserviert. Studierende können hier neue Langzeit-Terminierungsalgorithmen implementieren.'
  },
  'empty_slot_2': {
    name: '--- Algorithmus-Slot 2 ---',
    description: 'Freier Slot für experimentelle Terminierungsansätze oder KI-basierte Prognosemodelle.'
  }
}

// Durchlaufterminierung (Mid-term scheduling) algorithms
const durchlaufterminierungAlgorithms = {
  'adaptive_fifo': {
    name: 'Adaptives FIFO',
    description: 'FIFO mit dynamischen Prioritätsanpassungen basierend auf Wartezeiten'
  },
  'bottleneck_aware': {
    name: 'Engpass-bewusste Terminierung',
    description: 'Erkennt Bottleneck-Stationen und plant Aufträge entsprechend um'
  },
  'load_balancing': {
    name: 'Lastausgleichs-Algorithmus',
    description: 'Verteilt Aufträge gleichmäßig auf verfügbare Parallelstationen'
  },
  'deadline_driven': {
    name: 'Deadline-orientierte Planung',
    description: 'Priorisiert Aufträge basierend auf kritischen Lieferterminen'
  },
  'complexity_based': {
    name: 'Komplexitäts-basierte Sortierung',
    description: 'Ordnet Aufträge nach Produktkomplexität und benötigten Prozessschritten'
  },
  'empty_slot_3': {
    name: '--- Algorithmus-Slot 3 ---',
    description: 'Reserviert für Machine Learning-basierte Terminierungsansätze oder genetische Algorithmen.'
  },
  'empty_slot_4': {
    name: '--- Algorithmus-Slot 4 ---',
    description: 'Platz für Hybrid-Algorithmen oder Multi-Kriterien-Entscheidungsverfahren.'
  }
}

// Feinterminierung (Short-term scheduling) algorithms
const feinterminierungAlgorithms = {
  'real_time_sjf': {
    name: 'Echtzeit Shortest Job First',
    description: 'SJF mit Echtzeitanpassung basierend auf aktuellen Stationszeiten'
  },
  'dynamic_priority': {
    name: 'Dynamische Prioritätsverteilung',
    description: 'Prioritäten ändern sich basierend on Wartezeit und Auftragsstatus'
  },
  'station_affinity': {
    name: 'Stations-Affinitäts-Scheduling',
    description: 'Bevorzugt Aufträge, die bereits an ähnlichen Stationen bearbeitet wurden'
  },
  'energy_efficient': {
    name: 'Energieeffiziente Terminierung',
    description: 'Minimiert Energieverbrauch durch intelligente Stationsnutzung'
  },
  'predictive_maintenance': {
    name: 'Wartungs-prädiktive Planung',
    description: 'Berücksichtigt geplante Wartungszeiten bei der Kurzzeitplanung'
  },
  'empty_slot_5': {
    name: '--- Algorithmus-Slot 5 ---',
    description: 'Freier Slot für Reinforcement Learning-Ansätze oder Online-Optimierungsverfahren.'
  },
  'empty_slot_6': {
    name: '--- Algorithmus-Slot 6 ---',
    description: 'Platz für IoT-basierte Terminierung oder Edge-Computing-Lösungen.'
  }
}

export function TerminierungModal({ isOpen, onClose, type, factoryId }: TerminierungModalProps) {
  // Algorithm Bundles state
  const [bundles, setBundles] = useState<any[]>([])
  const [selectedBundleId, setSelectedBundleId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Load bundles when modal opens
  useEffect(() => {
    if (isOpen && factoryId) {
      loadBundles()
    }
  }, [isOpen, factoryId])

  const loadBundles = async () => {
    setLoading(true)
    const result = await getAllAlgorithmBundles(factoryId)
    if (result.success && result.data) {
      setBundles(result.data)
      // Find active bundle
      const activeBundle = result.data.find((b: any) => b.isActive && b.factoryId === factoryId)
      if (activeBundle) {
        setSelectedBundleId(activeBundle.id)
      }
    }
    setLoading(false)
  }

  const handleBundleChange = async (bundleId: string) => {
    if (!factoryId) return

    setSelectedBundleId(bundleId)
    const result = await setActiveAlgorithmBundle(bundleId, factoryId)

    if (result.success) {
      toast.success('Algorithmus-Bundle aktiviert')
      loadBundles() // Reload to update active state
    } else {
      toast.error(result.error)
    }
  }

  const selectedBundle = bundles.find(b => b.id === selectedBundleId)

  const getModalConfig = () => {
    switch (type) {
      case 'grobterminierung':
        return {
          title: 'PAP - Grobterminierung',
          icon: <Target className="h-5 w-5 text-blue-600" />,
          color: 'blue',
          description: 'Pre-Acceptance Processing: Strategische Terminplanung für die erste Terminschätzung bei Auftragseingang',
          scriptField: 'papScriptPath' as const,
          descriptionField: 'papDescription' as const
        }
      case 'durchlaufterminierung':
        return {
          title: 'PIP - Durchlaufterminierung',
          icon: <Settings className="h-5 w-5 text-orange-600" />,
          color: 'orange',
          description: 'Pre-Inspection Processing: Mittelfristige Planungsstrategien für optimierte Durchlaufzeiten',
          scriptField: 'pipScriptPath' as const,
          descriptionField: 'pipDescription' as const
        }
      case 'feinterminierung':
        return {
          title: 'PIPO - Feinterminierung',
          icon: <Zap className="h-5 w-5 text-green-600" />,
          color: 'green',
          description: 'Post-Inspection Processing Optimization: Echtzeit-Scheduling für optimale Stationszuweisungen',
          scriptField: 'pipoScriptPath' as const,
          descriptionField: 'pipoDescription' as const
        }
      default:
        return {
          title: '',
          icon: null,
          color: 'blue',
          description: '',
          scriptField: 'papScriptPath' as const,
          descriptionField: 'papDescription' as const
        }
    }
  }

  const config = getModalConfig()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              Terminierungs-Konfiguration
            </div>
            <Link href="/simulation/algorithms" target="_blank">
              <Button variant="outline" size="sm" className="gap-2">
                <Edit2 className="h-4 w-4" />
                Bundles bearbeiten
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-600">
            Python-Skripte für Warteschlangen-Terminierung
          </p>

          {loading ? (
            <div className="p-4 text-center text-gray-500">Lade Bundles...</div>
          ) : (
            <>
              <div className="space-y-3">
                <Label className="text-sm font-medium">Aktives Algorithmus-Bundle:</Label>
                <Select value={selectedBundleId} onValueChange={handleBundleChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bundle auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bundles.map((bundle) => (
                      <SelectItem key={bundle.id} value={bundle.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{bundle.name}</span>
                          {bundle.isActive && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Aktiv</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedBundle && (
                <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                  <div className="pb-3 border-b">
                    <div className="font-semibold text-lg">{selectedBundle.name}</div>
                    {selectedBundle.author && (
                      <div className="text-xs text-gray-500 mt-1">Autor: {selectedBundle.author}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {/* PreAcceptanceQueue */}
                    <div className="flex items-center gap-3 p-2 bg-white rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="font-medium text-sm">PreAcceptanceQueue</span>
                      </div>
                      {selectedBundle.papScriptPath ? (
                        <code className="text-xs text-gray-600 font-mono">
                          {selectedBundle.papScriptPath}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">nicht konfiguriert</span>
                      )}
                    </div>

                    {/* PreInspectionQueue */}
                    <div className="flex items-center gap-3 p-2 bg-white rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                        <span className="font-medium text-sm">PreInspectionQueue</span>
                      </div>
                      {selectedBundle.pipScriptPath ? (
                        <code className="text-xs text-gray-600 font-mono">
                          {selectedBundle.pipScriptPath}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">nicht konfiguriert</span>
                      )}
                    </div>

                    {/* PostInspectionQueue */}
                    <div className="flex items-center gap-3 p-2 bg-white rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="font-medium text-sm">PostInspectionQueue</span>
                      </div>
                      {selectedBundle.pipoScriptPath ? (
                        <code className="text-xs text-gray-600 font-mono">
                          {selectedBundle.pipoScriptPath}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">nicht konfiguriert</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}