/**
 * Mitarbeiter: 
 * Beschreibung: 
 */

import { AuftragsPhase } from '@prisma/client'
import { AuftragsabwicklungAlgorithmus } from '../types'

const auftragsabwicklung3: AuftragsabwicklungAlgorithmus = {
  name: 'Auftragsabwicklung 3',
  description: 'Platzhalter für Algorithmus 3',
  
  process: async (factory, simulationTime, factoryId) => {
    // TODO: Implementierung
    return { updates: [] }
  }
}

export default auftragsabwicklung3
