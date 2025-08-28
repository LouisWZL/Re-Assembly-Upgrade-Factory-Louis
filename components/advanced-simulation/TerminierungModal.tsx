'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Target, Settings, Zap } from 'lucide-react'

interface TerminierungModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'grobterminierung' | 'durchlaufterminierung' | 'feinterminierung'
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

export function TerminierungModal({ isOpen, onClose, type }: TerminierungModalProps) {
  // Local state for selected algorithms
  const [selectedGrobAlgorithm, setSelectedGrobAlgorithm] = useState('incoming_plus_avg')
  const [selectedDurchlaufAlgorithm, setSelectedDurchlaufAlgorithm] = useState('adaptive_fifo')
  const [selectedFeinAlgorithm, setSelectedFeinAlgorithm] = useState('real_time_sjf')

  const getModalContent = () => {
    switch (type) {
      case 'grobterminierung':
        return {
          title: 'Langzeit-Terminierung',
          icon: <Target className="h-5 w-5 text-blue-600" />,
          color: 'blue',
          content: (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Strategische Terminplanung für die erste Terminschätzung bei Auftragseingang
              </p>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Terminierungs-Algorithmus:</Label>
                  <Select value={selectedGrobAlgorithm} onValueChange={setSelectedGrobAlgorithm}>
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(grobterminierungAlgorithms).map(([key, algo]) => (
                        <SelectItem key={key} value={key} disabled={key.includes('empty_slot')}>
                          <div>
                            <div className="font-medium">{algo.name}</div>
                            <div className="text-xs text-gray-500">{algo.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 border rounded-lg bg-blue-50">
                  <div className="font-medium text-blue-800">
                    {grobterminierungAlgorithms[selectedGrobAlgorithm as keyof typeof grobterminierungAlgorithms].name}
                  </div>
                  <div className="text-sm text-blue-600 mt-1">
                    {grobterminierungAlgorithms[selectedGrobAlgorithm as keyof typeof grobterminierungAlgorithms].description}
                  </div>
                </div>
              </div>
            </div>
          )
        }

      case 'durchlaufterminierung':
        return {
          title: 'Mittelfristige Terminierung',
          icon: <Settings className="h-5 w-5 text-orange-600" />,
          color: 'orange',
          content: (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Mittelfristige Planungsstrategien für optimierte Durchlaufzeiten
              </p>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Planungs-Algorithmus:</Label>
                  <Select value={selectedDurchlaufAlgorithm} onValueChange={setSelectedDurchlaufAlgorithm}>
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(durchlaufterminierungAlgorithms).map(([key, algo]) => (
                        <SelectItem key={key} value={key} disabled={key.includes('empty_slot')}>
                          <div>
                            <div className="font-medium">{algo.name}</div>
                            <div className="text-xs text-gray-500">{algo.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 border rounded-lg bg-orange-50">
                  <div className="font-medium text-orange-800">
                    {durchlaufterminierungAlgorithms[selectedDurchlaufAlgorithm as keyof typeof durchlaufterminierungAlgorithms].name}
                  </div>
                  <div className="text-sm text-orange-600 mt-1">
                    {durchlaufterminierungAlgorithms[selectedDurchlaufAlgorithm as keyof typeof durchlaufterminierungAlgorithms].description}
                  </div>
                </div>
              </div>
            </div>
          )
        }

      case 'feinterminierung':
        return {
          title: 'Kurzzeit-Terminierung',
          icon: <Zap className="h-5 w-5 text-green-600" />,
          color: 'green',
          content: (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Echzeit-Scheduling für optimale Stationszuweisungen
              </p>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Scheduling-Algorithmus:</Label>
                  <Select value={selectedFeinAlgorithm} onValueChange={setSelectedFeinAlgorithm}>
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(feinterminierungAlgorithms).map(([key, algo]) => (
                        <SelectItem key={key} value={key} disabled={key.includes('empty_slot')}>
                          <div>
                            <div className="font-medium">{algo.name}</div>
                            <div className="text-xs text-gray-500">{algo.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 border rounded-lg bg-green-50">
                  <div className="font-medium text-green-800">
                    {feinterminierungAlgorithms[selectedFeinAlgorithm as keyof typeof feinterminierungAlgorithms].name}
                  </div>
                  <div className="text-sm text-green-600 mt-1">
                    {feinterminierungAlgorithms[selectedFeinAlgorithm as keyof typeof feinterminierungAlgorithms].description}
                  </div>
                </div>
              </div>
            </div>
          )
        }

      default:
        return { title: '', icon: null, color: 'blue', content: null }
    }
  }

  const modalData = getModalContent()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {modalData.icon}
            {modalData.title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          {modalData.content}
        </div>
      </DialogContent>
    </Dialog>
  )
}