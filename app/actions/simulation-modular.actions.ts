'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Schichtmodell } from '@/types/enums'
import { addTerminierung, addBeschaffung, createAutoOrders } from './simulation.actions'
import { updateAuftragPhaseWithHistory } from './auftrag.actions'
import { auftragsabwicklungAlgorithmen, terminierungAlgorithmen, beschaffungAlgorithmen } from '@/components/simulation/registry'

/**
 * Führt einen modularen Simulationsschritt aus
 */
export async function processModularSimulation(
  factoryId: string,
  simulationTime: Date,
  autoOrders: boolean,
  minThreshold: number,
  batchSize: number,
  auftragsabwicklungIndex: number,
  terminierungIndex: number,
  beschaffungIndex: number,
  demSlots?: number,
  monSlots?: number,
  flexShare?: number,
  setupTimeHours?: number
) {
  try {
    // 1. Factory-Daten laden
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
      throw new Error('Factory nicht gefunden')
    }
    
    // Prüfe ob wir in der Schichtzeit sind
    const hour = simulationTime.getHours()
    const isInShift = factory.schichtmodell === Schichtmodell.DREISCHICHT ||
      (factory.schichtmodell === Schichtmodell.ZWEISCHICHT && hour < 16) ||
      (factory.schichtmodell === Schichtmodell.EINSCHICHT && hour >= 8 && hour < 16)
    
    if (!isInShift) {
      return { success: true, updates: 0, message: 'Außerhalb der Schichtzeit' }
    }
    
    // 2. Auftragsabwicklung ausführen
    const auftragsabwicklung = auftragsabwicklungAlgorithmen[auftragsabwicklungIndex]
    const { updates } = await auftragsabwicklung.process(factory, simulationTime, factoryId, {
      demSlots,
      monSlots,
      flexShare,
      setupTimeHours
    })
    
    // 3. Updates in Datenbank speichern mit History
    for (const update of updates) {
      await updateAuftragPhaseWithHistory(
        update.id,
        update.phase,
        simulationTime
      )
    }
    
    // 4. Terminierung ausführen
    const terminierung = terminierungAlgorithmen[terminierungIndex]
    const { terminierungen } = await terminierung.process(updates, simulationTime)
    
    // 5. Terminierungen speichern
    for (const term of terminierungen) {
      await addTerminierung(
        term.auftragId,
        term.typ,
        term.datum,
        term.bemerkung
      )
    }
    
    // 6. Beschaffung ausführen
    const beschaffung = beschaffungAlgorithmen[beschaffungIndex]
    const { beschaffungen } = await beschaffung.process(factory, simulationTime, factoryId)
    
    // 7. Beschaffungen speichern
    for (const besch of beschaffungen) {
      await addBeschaffung(
        factoryId,
        besch.baugruppen,
        besch.typ,
        besch.lieferant
      )
    }
    
    // 8. Auto-Aufträge erstellen wenn aktiviert
    if (autoOrders) {
      await createAutoOrders(factoryId, minThreshold, batchSize)
    }
    
    // 9. Path revalidieren
    revalidatePath('/')
    
    return { 
      success: true, 
      updates: updates.length,
      message: `${updates.length} Aufträge aktualisiert`
    }
  } catch (error) {
    console.error('Fehler in modularer Simulation:', error)
    return { 
      success: false, 
      updates: 0,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    }
  }
}
