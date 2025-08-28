'use server'

import { prisma } from '@/lib/prisma'
// Define types as constants for SQLite compatibility
type AuftragsPhase = 
  | 'AUFTRAGSANNAHME'
  | 'INSPEKTION' 
  | 'REASSEMBLY_START'
  | 'REASSEMBLY_ENDE'
  | 'QUALITAETSPRUEFUNG'
  | 'AUFTRAGSABSCHLUSS'

interface PhaseTransition {
  auftragId: string
  fromPhase: AuftragsPhase | null
  toPhase: AuftragsPhase
  simulationTime: string
}

interface PhaseCount {
  phase: AuftragsPhase
  count: number
}

interface TransitionSummary {
  from: AuftragsPhase | null
  to: AuftragsPhase
  count: number
  auftraege: string[]
}

/**
 * Get phase transitions for a factory within a time range
 */
export async function getPhaseTransitions(
  factoryId: string,
  fromTime?: string,
  toTime?: string
) {
  try {
    // Get all orders for the factory with phase history
    const auftraege = await prisma.auftrag.findMany({
      where: { factoryId },
      select: {
        id: true,
        phase: true,
        phaseHistory: true
      }
    })

    const transitions: PhaseTransition[] = []
    
    // Extract transitions from phase history
    for (const auftrag of auftraege) {
      const history = (auftrag.phaseHistory as any[]) || []
      
      for (const entry of history) {
        // Filter by time range if provided
        if (fromTime && entry.simulationTime < fromTime) continue
        if (toTime && entry.simulationTime > toTime) continue
        
        transitions.push({
          auftragId: auftrag.id,
          fromPhase: entry.fromPhase,
          toPhase: entry.toPhase,
          simulationTime: entry.simulationTime
        })
      }
    }

    // Sort transitions by simulation time
    transitions.sort((a, b) => 
      new Date(a.simulationTime).getTime() - new Date(b.simulationTime).getTime()
    )

    return { 
      success: true, 
      data: transitions 
    }
  } catch (error) {
    console.error('Error fetching phase transitions:', error)
    return { 
      success: false, 
      error: 'Fehler beim Abrufen der Phasenübergänge' 
    }
  }
}

/**
 * Get current phase counts for a factory
 */
export async function getPhaseCounts(factoryId: string) {
  try {
    const stats = await prisma.auftrag.groupBy({
      by: ['phase'],
      where: { factoryId },
      _count: {
        phase: true
      }
    })

    const phaseCounts: PhaseCount[] = stats.map(stat => ({
      phase: stat.phase,
      count: stat._count.phase
    }))

    // Ensure all phases are represented
    const allPhases = Object.values(AuftragsPhase)
    for (const phase of allPhases) {
      if (!phaseCounts.find(pc => pc.phase === phase)) {
        phaseCounts.push({ phase: phase as AuftragsPhase, count: 0 })
      }
    }

    // Sort by phase order
    const phaseOrder = [
      AuftragsPhase.AUFTRAGSANNAHME,
      AuftragsPhase.INSPEKTION,
      AuftragsPhase.REASSEMBLY_START,
      AuftragsPhase.REASSEMBLY_ENDE,
      AuftragsPhase.QUALITAETSPRUEFUNG,
      AuftragsPhase.AUFTRAGSABSCHLUSS
    ]
    
    phaseCounts.sort((a, b) => 
      phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase)
    )

    return { 
      success: true, 
      data: phaseCounts 
    }
  } catch (error) {
    console.error('Error fetching phase counts:', error)
    return { 
      success: false, 
      error: 'Fehler beim Abrufen der Phasenstatistiken' 
    }
  }
}

/**
 * Get phase transitions grouped by from->to phases
 */
export async function getTransitionSummary(
  factoryId: string,
  fromTime?: string,
  toTime?: string
) {
  try {
    const transitionsResult = await getPhaseTransitions(factoryId, fromTime, toTime)
    
    if (!transitionsResult.success || !transitionsResult.data) {
      return { success: false, error: transitionsResult.error }
    }

    const transitions = transitionsResult.data
    const summaryMap = new Map<string, TransitionSummary>()

    // Group transitions
    for (const transition of transitions) {
      const key = `${transition.fromPhase || 'NEW'}->${transition.toPhase}`
      
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          from: transition.fromPhase,
          to: transition.toPhase,
          count: 0,
          auftraege: []
        })
      }
      
      const summary = summaryMap.get(key)!
      summary.count++
      if (!summary.auftraege.includes(transition.auftragId)) {
        summary.auftraege.push(transition.auftragId)
      }
    }

    return { 
      success: true, 
      data: Array.from(summaryMap.values()) 
    }
  } catch (error) {
    console.error('Error fetching transition summary:', error)
    return { 
      success: false, 
      error: 'Fehler beim Abrufen der Übergangsstatistiken' 
    }
  }
}

/**
 * Get all orders with their current phases for the timeline
 */
export async function getTimelineData(factoryId: string) {
  try {
    const [phaseCountsResult, auftraege] = await Promise.all([
      getPhaseCounts(factoryId),
      prisma.auftrag.findMany({
        where: { factoryId },
        select: {
          id: true,
          phase: true,
          phaseHistory: true,
          produktvariante: {
            select: {
              bezeichnung: true
            }
          },
          kunde: {
            select: {
              vorname: true,
              nachname: true
            }
          }
        }
      })
    ])

    if (!phaseCountsResult.success) {
      return { success: false, error: phaseCountsResult.error }
    }

    return {
      success: true,
      data: {
        phaseCounts: phaseCountsResult.data,
        auftraege: auftraege.map(a => ({
          id: a.id,
          phase: a.phase,
          phaseHistory: a.phaseHistory,
          label: `${a.kunde.vorname} ${a.kunde.nachname} - ${a.produktvariante.bezeichnung}`
        }))
      }
    }
  } catch (error) {
    console.error('Error fetching timeline data:', error)
    return { 
      success: false, 
      error: 'Fehler beim Abrufen der Timeline-Daten' 
    }
  }
}