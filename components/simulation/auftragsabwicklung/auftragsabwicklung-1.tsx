/**
 * Mitarbeiter: Standard
 * Beschreibung: Demo-Auftragsabwicklungsalgorithmus mit 7er-Batch-Verarbeitung und Kapazitätsprüfung
 */

import { AuftragsPhase } from '@prisma/client'
import { AuftragsabwicklungAlgorithmus } from '../types'

const auftragsabwicklung1: AuftragsabwicklungAlgorithmus = {
  name: 'Demo Auftragsabwicklung',
  description: 'Verarbeitet Aufträge in 7er-Batches mit Kapazitätsprüfung für Re-Assembly',
  
  process: async (factory, simulationTime, factoryId) => {
    const updates: Array<{ id: string; phase: AuftragsPhase }> = []
    
    // Verarbeite Aufträge nach Phase
    for (const auftrag of factory.auftraege) {
      let newPhase: AuftragsPhase | null = null
      
      switch (auftrag.phase) {
        case AuftragsPhase.AUFTRAGSANNAHME:
          // Nach 2 Stunden -> Inspektion
          newPhase = AuftragsPhase.INSPEKTION
          break
          
        case AuftragsPhase.INSPEKTION:
          // Prüfe ob 7 Aufträge für Batch vorhanden sind
          const inspektionAuftraege = factory.auftraege.filter(
            (a: any) => a.phase === AuftragsPhase.INSPEKTION
          )
          
          if (inspektionAuftraege.length >= 7) {
            // Prüfe Kapazität: Zähle aktuelle Re-Assembly Aufträge
            const currentReAssemblyCount = factory.auftraege.filter(
              (a: any) => a.phase === AuftragsPhase.REASSEMBLY_START || 
                   a.phase === AuftragsPhase.REASSEMBLY_ENDE
            ).length
            
            // Prüfe ob Platz für 7 weitere Aufträge in Re-Assembly ist
            if (currentReAssemblyCount + 7 <= factory.kapazität) {
              // Starte Re-Assembly für alle 7
              const batch = inspektionAuftraege.slice(0, 7)
              for (const batchAuftrag of batch) {
                updates.push({
                  id: batchAuftrag.id,
                  phase: AuftragsPhase.REASSEMBLY_START
                })
              }
            } else {
              console.log(`Kapazität erreicht: ${currentReAssemblyCount}/${factory.kapazität} - warte mit Batch`)
            }
          }
          break
          
        case AuftragsPhase.REASSEMBLY_START:
          // Nach Prozesszeit -> Re-Assembly Ende
          newPhase = AuftragsPhase.REASSEMBLY_ENDE
          break
          
        case AuftragsPhase.REASSEMBLY_ENDE:
          // Sofort -> Qualitätsprüfung
          newPhase = AuftragsPhase.QUALITAETSPRUEFUNG
          break
          
        case AuftragsPhase.QUALITAETSPRUEFUNG:
          // Nach 2 Stunden -> Abschluss
          newPhase = AuftragsPhase.AUFTRAGSABSCHLUSS
          break
          
        case AuftragsPhase.AUFTRAGSABSCHLUSS:
          // Fertig - nichts zu tun
          break
      }
      
      if (newPhase && auftrag.phase !== AuftragsPhase.INSPEKTION) {
        // Inspektion wird im Batch verarbeitet
        updates.push({
          id: auftrag.id,
          phase: newPhase
        })
      }
    }
    
    return { updates }
  }
}

export default auftragsabwicklung1