'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { AuftragsPhase, Schichtmodell } from '@prisma/client'

// Types für Terminierung und Beschaffung
interface Terminierung {
  datum: string | { von: string; bis: string }
  typ: 'GROB_ZEITSCHIENE' | 'GROBTERMIN' | 'FEINTERMIN'
  bemerkung?: string
  createdAt: string
}

interface Beschaffung {
  baugruppen: Array<{ id: string; anzahl: number }>
  typ: 'EINZEL' | 'BUENDEL'
  lieferant?: string
  datum: string
  createdAt: string
}

/**
 * Fügt eine neue Terminierung zum Auftrag hinzu
 */
export async function addTerminierung(
  auftragId: string,
  typ: 'GROB_ZEITSCHIENE' | 'GROBTERMIN' | 'FEINTERMIN',
  datum: string | { von: string; bis: string },
  bemerkung?: string
) {
  const auftrag = await prisma.auftrag.findUnique({
    where: { id: auftragId }
  })
  
  if (!auftrag) {
    throw new Error('Auftrag nicht gefunden')
  }
  
  const terminierungen = (auftrag.terminierung as unknown as Terminierung[]) || []
  const neueTerminierung: Terminierung = {
    datum,
    typ,
    bemerkung,
    createdAt: new Date().toISOString()
  }
  
  terminierungen.push(neueTerminierung)
  
  await prisma.auftrag.update({
    where: { id: auftragId },
    data: { terminierung: terminierungen as any }
  })
}

/**
 * Fügt eine neue Beschaffung zur Factory hinzu
 */
export async function addBeschaffung(
  factoryId: string,
  baugruppen: Array<{ id: string; anzahl: number }>,
  typ: 'EINZEL' | 'BUENDEL' = 'EINZEL',
  lieferant?: string
) {
  const factory = await prisma.reassemblyFactory.findUnique({
    where: { id: factoryId }
  })
  
  if (!factory) {
    throw new Error('Factory nicht gefunden')
  }
  
  const beschaffungen = (factory.beschaffung as unknown as Beschaffung[]) || []
  const neueBeschaffung: Beschaffung = {
    baugruppen,
    typ,
    lieferant,
    datum: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }
  
  beschaffungen.push(neueBeschaffung)
  
  // Update Factory und Baugruppen-Verfügbarkeit
  await prisma.$transaction(async (tx) => {
    // Update Factory
    await tx.reassemblyFactory.update({
      where: { id: factoryId },
      data: { beschaffung: beschaffungen as any }
    })
    
    // Update Baugruppen-Verfügbarkeit
    for (const bg of baugruppen) {
      await tx.baugruppe.update({
        where: { id: bg.id },
        data: { 
          verfuegbar: {
            increment: bg.anzahl
          }
        }
      })
    }
  })
}

/**
 * Holt die aktuelle Terminierung eines Auftrags
 * (Helper-Funktion, nicht als Server Action exportiert)
 */
function getLatestTerminierung(terminierungen: any): Terminierung | null {
  if (!terminierungen || !Array.isArray(terminierungen) || terminierungen.length === 0) {
    return null
  }
  return terminierungen[terminierungen.length - 1]
}

/**
 * Generiert eine zufällige Zeitschiene (von-bis)
 */
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

/**
 * Generiert ein zufälliges festes Datum
 */
function generateFestesDatum(startDate: Date, daysToAdd: number): string {
  const datum = new Date(startDate)
  datum.setDate(datum.getDate() + daysToAdd)
  return datum.toISOString().split('T')[0]
}

/**
 * Hauptfunktion für Simulationsschritt
 * 
 * WICHTIG: Fabrikkapazität bedeutet jetzt:
 * Die maximale Anzahl von Aufträgen, die gleichzeitig in Re-Assembly 
 * (REASSEMBLY_START oder REASSEMBLY_ENDE Phase) sein können.
 */
export async function processSimulationStep(
  factoryId: string,
  simulationTime: Date,
  autoOrders: boolean = false,
  minThreshold: number = 30,
  batchSize: number = 20
) {
  try {
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId },
      include: {
        auftraege: {
          include: {
            baugruppenInstances: {
              include: {
                baugruppe: true
              }
            }
          }
        }
      }
    })
    
    if (!factory) {
      return { success: false, error: 'Factory nicht gefunden' }
    }
    
    // Prüfe ob wir in der Schichtzeit sind
    const hour = simulationTime.getHours()
    const isInShift = factory.schichtmodell === Schichtmodell.DREISCHICHT ||
      (factory.schichtmodell === Schichtmodell.ZWEISCHICHT && hour < 16) ||
      (factory.schichtmodell === Schichtmodell.EINSCHICHT && hour >= 8 && hour < 16)
    
    if (!isInShift) {
      return { success: true, message: 'Außerhalb der Schichtzeit' }
    }
    
    // Verarbeite Aufträge nach Phase
    const updates = []
    
    for (const auftrag of factory.auftraege) {
      let newPhase: AuftragsPhase | null = null
      let terminierung = null
      
      switch (auftrag.phase) {
        case AuftragsPhase.AUFTRAGSANNAHME:
          // Nach 2 Stunden -> Inspektion
          newPhase = AuftragsPhase.INSPEKTION
          // Setze grobe Zeitschiene
          terminierung = {
            typ: 'GROB_ZEITSCHIENE' as const,
            datum: generateZeitschiene(simulationTime),
            bemerkung: 'Erste Schätzung bei Auftragsannahme'
          }
          break
          
        case AuftragsPhase.INSPEKTION:
          // Prüfe ob 7 Aufträge für Batch vorhanden sind
          const inspektionAuftraege = factory.auftraege.filter(
            a => a.phase === AuftragsPhase.INSPEKTION
          )
          
          if (inspektionAuftraege.length >= 7) {
            // Prüfe Kapazität: Zähle aktuelle Re-Assembly Aufträge
            const currentReAssemblyCount = factory.auftraege.filter(
              a => a.phase === AuftragsPhase.REASSEMBLY_START || 
                   a.phase === AuftragsPhase.REASSEMBLY_ENDE
            ).length
            
            // Prüfe ob Platz für 7 weitere Aufträge in Re-Assembly ist
            if (currentReAssemblyCount + 7 <= factory.kapazität) {
              // Starte Re-Assembly für alle 7
              const batch = inspektionAuftraege.slice(0, 7)
              for (const batchAuftrag of batch) {
                updates.push({
                  id: batchAuftrag.id,
                  phase: AuftragsPhase.REASSEMBLY_START,
                  terminierung: {
                    typ: 'GROBTERMIN' as const,
                    datum: generateFestesDatum(simulationTime, 5),
                    bemerkung: 'Nach Inspektion festgelegt'
                  }
                })
              }
            } else {
              console.log(`Kapazität erreicht: ${currentReAssemblyCount}//${factory.kapazität} - warte mit Batch`)
            }
          }
          break
          
        case AuftragsPhase.REASSEMBLY_START:
          // Berechne Prozesszeit
          const totalTime = auftrag.baugruppenInstances.reduce((sum, bi) => {
            const demontagezeit = bi.baugruppe.demontagezeit || 60
            const montagezeit = bi.baugruppe.montagezeit || 60
            return sum + demontagezeit + montagezeit
          }, 0)
          
          // Nach Prozesszeit -> Re-Assembly Ende
          newPhase = AuftragsPhase.REASSEMBLY_ENDE
          terminierung = {
            typ: 'FEINTERMIN' as const,
            datum: generateFestesDatum(simulationTime, 2),
            bemerkung: 'Feintermin nach Re-Assembly'
          }
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
      
      if (newPhase) {
        updates.push({
          id: auftrag.id,
          phase: newPhase,
          terminierung
        })
      }
    }
    
    // Führe alle Updates aus
    for (const update of updates) {
      await prisma.auftrag.update({
        where: { id: update.id },
        data: { phase: update.phase }
      })
      
      if (update.terminierung) {
        await addTerminierung(
          update.id,
          update.terminierung.typ,
          update.terminierung.datum,
          update.terminierung.bemerkung
        )
      }
    }
    
    // Auto-Aufträge erstellen wenn aktiviert
    if (autoOrders) {
      await createAutoOrders(factoryId, minThreshold, batchSize)
    }
    
    revalidatePath('/')
    
    return { 
      success: true, 
      message: `${updates.length} Aufträge aktualisiert`,
      updates: updates.length
    }
  } catch (error) {
    console.error('Simulationsfehler:', error)
    return { success: false, error: 'Fehler bei der Simulation' }
  }
}

/**
 * Erstellt automatisch neue Aufträge um mindestens X in Auftragsannahme zu haben
 * 
 * Neue Logik:
 * - Ziel: Mindestens minThreshold Aufträge in AUFTRAGSANNAHME Phase
 * - Wenn < minThreshold: Erstelle batchSize neue Aufträge
 */
export async function createAutoOrders(
  factoryId: string,
  minThreshold: number = 30,
  batchSize: number = 20
) {
  try {
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId },
      include: {
        auftraege: true
      }
    })
    
    if (!factory) {
      return { success: false, error: 'Factory nicht gefunden' }
    }
    
    // Zähle Aufträge in AUFTRAGSANNAHME
    const auftragsannahmeCount = factory.auftraege.filter(
      a => a.phase === AuftragsPhase.AUFTRAGSANNAHME
    ).length
    
    // Wenn weniger als minThreshold Aufträge in Auftragsannahme, erstelle batchSize neue
    if (auftragsannahmeCount < minThreshold) {
      const { generateOrders } = await import('./auftrag.actions')
      const result = await generateOrders(factoryId, batchSize)
      
      if (result.success) {
        console.log(`Auto-Aufträge: ${auftragsannahmeCount} -> ${auftragsannahmeCount + (result.created || 0)} Aufträge in Auftragsannahme`)
      }
      
      return result
    }
    
    return { success: true, message: `Genug Aufträge in Auftragsannahme (${auftragsannahmeCount})` }
  } catch (error) {
    console.error('Fehler beim Erstellen von Auto-Aufträgen:', error)
    return { success: false, error: 'Fehler beim Erstellen von Auto-Aufträgen' }
  }
}

/**
 * Holt den Simulationsstatus
 */
export async function getSimulationStatus(factoryId: string) {
  try {
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId },
      include: {
        auftraege: true,
        baugruppen: true
      }
    })
    
    if (!factory) {
      return { success: false, error: 'Factory nicht gefunden' }
    }
    
    const phasenCount = {
      AUFTRAGSANNAHME: 0,
      INSPEKTION: 0,
      REASSEMBLY_START: 0,
      REASSEMBLY_ENDE: 0,
      QUALITAETSPRUEFUNG: 0,
      AUFTRAGSABSCHLUSS: 0
    }
    
    factory.auftraege.forEach(a => {
      if (a.phase in phasenCount) {
        phasenCount[a.phase as keyof typeof phasenCount]++
      }
    })
    
    return {
      success: true,
      data: {
        totalAuftraege: factory.auftraege.length,
        phasenCount,
        kapazitaet: factory.kapazität,
        schichtmodell: factory.schichtmodell,
        verfuegbareBaugruppen: factory.baugruppen.map(bg => ({
          id: bg.id,
          bezeichnung: bg.bezeichnung,
          verfuegbar: bg.verfuegbar
        }))
      }
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Simulationsstatus:', error)
    return { success: false, error: 'Fehler beim Abrufen des Status' }
  }
}