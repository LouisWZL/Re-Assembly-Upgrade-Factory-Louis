/**
 * Mitarbeiter: 
 * Beschreibung: 
 */

import { AuftragsPhase } from '@prisma/client'
import { AuftragsabwicklungAlgorithmus } from '../types'

const auftragsabwicklung2: AuftragsabwicklungAlgorithmus = {
  name: 'Auftragsabwicklung 2',
  description: 'Platzhalter für Algorithmus 2',
  
  process: async (factory, simulationTime, factoryId) => {
    // TODO: Implementierung
    return { updates: [] }
  }
}

export default auftragsabwicklung2
