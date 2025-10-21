/**
 * Mitarbeiter: Standard
 * Beschreibung: Demo-Terminierungsalgorithmus mit Zeitschienen und Terminen
 */

import { AuftragsPhase } from '@/types/enums'
import { TerminierungAlgorithmus } from '../types'

// Hilfsfunktionen für Terminierung
function generateZeitschiene(startDate: Date): { von: string; bis: string } {
  const von = new Date(startDate)
  von.setDate(von.getDate() + Math.floor(Math.random() * 7) + 7) // 7-14 Tage in der Zukunft
  
  const bis = new Date(von)
  bis.setDate(bis.getDate() + Math.floor(Math.random() * 7) + 3) // 3-10 Tage Zeitspanne
  
  return {
    von: von.toISOString().split('T')[0],
    bis: bis.toISOString().split('T')[0]
  }
}

function generateFestesDatum(startDate: Date, daysToAdd: number): string {
  const datum = new Date(startDate)
  datum.setDate(datum.getDate() + daysToAdd)
  return datum.toISOString().split('T')[0]
}

const terminierung1: TerminierungAlgorithmus = {
  name: 'Demo Terminierung',
  description: 'Erstellt Zeitschienen und Termine basierend auf Phasenübergängen',
  
  process: async (updates, simulationTime) => {
    const terminierungen: Array<{
      auftragId: string
      typ: 'GROB_ZEITSCHIENE' | 'GROBTERMIN' | 'FEINTERMIN'
      datum: string | { von: string; bis: string }
      bemerkung?: string
    }> = []
    
    for (const update of updates) {
      let terminierung = null
      
      switch (update.phase) {
        case AuftragsPhase.INSPEKTION:
          // Setze grobe Zeitschiene bei Übergang zu Inspektion
          terminierung = {
            auftragId: update.id,
            typ: 'GROB_ZEITSCHIENE' as const,
            datum: generateZeitschiene(simulationTime),
            bemerkung: 'Erste Schätzung bei Auftragsannahme'
          }
          break
          
        case AuftragsPhase.REASSEMBLY_START:
          // Grobtermin nach Inspektion
          terminierung = {
            auftragId: update.id,
            typ: 'GROBTERMIN' as const,
            datum: generateFestesDatum(simulationTime, 5),
            bemerkung: 'Nach Inspektion festgelegt'
          }
          break
          
        case AuftragsPhase.REASSEMBLY_ENDE:
          // Feintermin nach Re-Assembly
          terminierung = {
            auftragId: update.id,
            typ: 'FEINTERMIN' as const,
            datum: generateFestesDatum(simulationTime, 2),
            bemerkung: 'Feintermin nach Re-Assembly'
          }
          break
      }
      
      if (terminierung) {
        terminierungen.push(terminierung)
      }
    }
    
    return { terminierungen }
  }
}

export default terminierung1
