/**
 * Mitarbeiter: Standard
 * Beschreibung: Demo-Beschaffungsalgorithmus (aktuell ohne Implementierung)
 */

import { BeschaffungAlgorithmus } from '../types'

const beschaffung1: BeschaffungAlgorithmus = {
  name: 'Demo Beschaffung',
  description: 'Keine automatische Beschaffung',
  
  process: async (factory, simulationTime, factoryId) => {
    // Aktuell keine Beschaffungslogik implementiert
    return { beschaffungen: [] }
  }
}

export default beschaffung1