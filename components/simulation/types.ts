import { ReassemblyFactory, Auftrag } from '@prisma/client'
import { AuftragsPhase } from '@/types/enums'

// Interface für Auftragsabwicklungs-Algorithmus
export interface AuftragsabwicklungAlgorithmus {
  name: string
  description: string
  process: (
    factory: any,
    simulationTime: Date,
    factoryId: string
  ) => Promise<{
    updates: Array<{
      id: string
      phase: AuftragsPhase
    }>
  }>
}

// Interface für Terminierungs-Algorithmus  
export interface TerminierungAlgorithmus {
  name: string
  description: string
  process: (
    updates: Array<{
      id: string
      phase: AuftragsPhase
    }>,
    simulationTime: Date
  ) => Promise<{
    terminierungen: Array<{
      auftragId: string
      typ: 'GROB_ZEITSCHIENE' | 'GROBTERMIN' | 'FEINTERMIN'
      datum: string | { von: string; bis: string }
      bemerkung?: string
    }>
  }>
}

// Interface für Beschaffungs-Algorithmus
export interface BeschaffungAlgorithmus {
  name: string
  description: string
  process: (
    factory: any,
    simulationTime: Date,
    factoryId: string
  ) => Promise<{
    beschaffungen: Array<{
      baugruppen: Array<{ id: string; anzahl: number }>
      typ: 'EINZEL' | 'BUENDEL'
      lieferant?: string
    }>
  }>
}
