import { AuftragsabwicklungAlgorithmus } from '../types'
import { AuftragsPhase } from '@/types/enums'

// FCFS + flexible/rigid slots approximation on phase level
// - Uses MON slots as concurrent capacity in REASSEMBLY (START/ENDE)
// - Uses DEM slots as admission limit per tick from INSPEKTION -> REASSEMBLY_START
// - Flex share allocates portion of MON slots as flexible; rigid slots prioritize most frequent variant types in queue
// - Completion: orders in REASSEMBLY_START finish when their expected duration has elapsed relative to updatedAt

function getOrderExpectedHours(order: any): number {
  // Estimate from baugruppenInstances demontage+montage times; fallback 4h
  const totalMinutes = (order.baugruppenInstances || []).reduce((sum: number, bi: any) => {
    const d = bi.baugruppe?.demontagezeit ?? 60
    const m = bi.baugruppe?.montagezeit ?? 60
    return sum + d + m
  }, 0)
  const hours = totalMinutes > 0 ? totalMinutes / 60 : 4
  // Clamp to sensible bounds
  return Math.max(1, Math.min(48, hours))
}

const auftragsabwicklung9: AuftragsabwicklungAlgorithmus = {
  name: 'FCFS Flex Slots (Phase)',
  description: 'FCFS auf Auftragsebene mit starren und flexiblen Slots; Kapazität und Flex-Anteil konfigurierbar',
  
  process: async (factory, simulationTime, factoryId, options) => {
    const updates: Array<{ id: string; phase: any }> = []

    const monSlots = Math.max(1, Math.floor(options?.monSlots ?? 6))
    const demSlots = Math.max(0, Math.floor(options?.demSlots ?? 4))
    const flexShare = Math.max(0, Math.min(1, options?.flexShare ?? 0.5))
    const setupTimeHours = Math.max(0, options?.setupTimeHours ?? 2)

    // Build queues
    const queueInspection: any[] = factory.auftraege
      .filter((a: any) => a.phase === AuftragsPhase.INSPEKTION)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    const inReassembly: any[] = factory.auftraege.filter((a: any) => 
      a.phase === AuftragsPhase.REASSEMBLY_START || a.phase === AuftragsPhase.REASSEMBLY_ENDE
    )

    // 1) Complete some orders in REASSEMBLY_START if their expected duration elapsed
    const now = simulationTime.getTime()
    for (const a of factory.auftraege) {
      if (a.phase === AuftragsPhase.REASSEMBLY_START) {
        const expectedHours = getOrderExpectedHours(a)
        const startedAt = new Date(a.updatedAt || a.createdAt).getTime()
        if (startedAt + expectedHours * 60 * 60 * 1000 <= now) {
          updates.push({ id: a.id, phase: AuftragsPhase.REASSEMBLY_ENDE })
        }
      }
    }

    // 2) Determine available MON capacity for new starts
    const activeCount = inReassembly.length
    const freeMon = Math.max(0, monSlots - activeCount)
    if (freeMon <= 0) {
      return { updates }
    }

    // Admission limit per tick from INSPEKTION
    const admission = Math.min(freeMon, demSlots, queueInspection.length)
    if (admission <= 0) {
      return { updates }
    }

    // Compute type frequencies in queue (use produktvariante.typ as proxy)
    const freq = new Map<string, number>()
    for (const a of queueInspection) {
      const t = a.produktvariante?.typ || 'basic'
      freq.set(t, (freq.get(t) || 0) + 1)
    }
    const topTypes = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t)

    // Split capacity into rigid vs flexible
    const rigidCapacity = Math.floor((1 - flexShare) * admission)
    const flexCapacity = admission - rigidCapacity

    // 2a) Fill rigid slots: FCFS but prefer top types
    let started = 0
    const pickedIds = new Set<string>()
    if (rigidCapacity > 0) {
      for (const type of topTypes) {
        if (started >= rigidCapacity) break
        for (const a of queueInspection) {
          if (started >= rigidCapacity) break
          if (pickedIds.has(a.id)) continue
          if ((a.produktvariante?.typ || 'basic') === type) {
            updates.push({ id: a.id, phase: AuftragsPhase.REASSEMBLY_START })
            pickedIds.add(a.id)
            started++
          }
        }
      }
    }

    // 2b) Fill flexible slots: FCFS any type
    if (flexCapacity > 0) {
      for (const a of queueInspection) {
        if (updates.length >= admission) break
        if (pickedIds.has(a.id)) continue
        // Setup/idle approximation: only allow switch frequently if order waited enough
        const waitedHours = (now - new Date(a.createdAt).getTime()) / (60 * 60 * 1000)
        if (waitedHours < setupTimeHours) continue
        updates.push({ id: a.id, phase: AuftragsPhase.REASSEMBLY_START })
        pickedIds.add(a.id)
      }
      // If not enough with wait condition, fill remaining FCFS without constraint
      for (const a of queueInspection) {
        if (updates.length >= admission) break
        if (pickedIds.has(a.id)) continue
        updates.push({ id: a.id, phase: AuftragsPhase.REASSEMBLY_START })
        pickedIds.add(a.id)
      }
    }

    return { updates }
  }
}

export default auftragsabwicklung9

