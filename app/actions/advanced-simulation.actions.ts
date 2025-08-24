"use server"

import { prisma } from '@/lib/prisma'

export async function getAdvancedSimulationData(factoryId: string) {
  try {
    // Fetch factory with all related data
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId },
      include: {
        auftraege: {
          include: {
            kunde: true,
            produktvariante: {
              include: {
                produkt: {
                  include: {
                    baugruppentypen: true
                  }
                }
              }
            },
            baugruppenInstances: {
              include: {
                baugruppe: {
                  include: {
                    baugruppentyp: true,
                    prozesse: true
                  }
                },
                austauschBaugruppe: {
                  include: {
                    baugruppentyp: true,
                    prozesse: true
                  }
                }
              }
            }
          }
        },
        baugruppentypen: true,
        baugruppen: {
          include: {
            baugruppentyp: true,
            prozesse: true
          }
        },
        produkte: {
          include: {
            baugruppentypen: true,
            varianten: true
          }
        }
      }
    })

    if (!factory) {
      return {
        success: false,
        error: 'Factory nicht gefunden'
      }
    }

    // Get process sequences from products
    const processSequences = factory.produkte.map(product => ({
      productId: product.id,
      productName: product.bezeichnung,
      processGraphData: product.processGraphData as any,
      graphData: product.graphData as any
    }))

    // Get unique Baugruppentypen used in products
    const usedBaugruppentypen = new Set<string>()
    factory.produkte.forEach(product => {
      product.baugruppentypen.forEach(bgt => {
        usedBaugruppentypen.add(bgt.bezeichnung)
      })
    })

    return {
      success: true,
      data: {
        factory,
        orders: factory.auftraege,
        baugruppentypen: Array.from(usedBaugruppentypen),
        processSequences,
        stations: {
          mainStations: [
            'AUFTRAGSANNAHME',
            'INSPEKTION', 
            'DEMONTAGE',
            'REASSEMBLY',
            'QUALITAETSPRUEFUNG',
            'VERSAND'
          ],
          demontageSubStations: factory.baugruppentypen.map(bgt => ({
            id: bgt.id,
            name: `Demontage ${bgt.bezeichnung}`,
            baugruppentypId: bgt.id,
            type: 'DEMONTAGE'
          })),
          reassemblySubStations: factory.baugruppentypen.map(bgt => ({
            id: bgt.id,
            name: `Montage ${bgt.bezeichnung}`,
            baugruppentypId: bgt.id,
            type: 'REASSEMBLY'
          }))
        }
      }
    }
  } catch (error) {
    console.error('Error fetching advanced simulation data:', error)
    return {
      success: false,
      error: 'Fehler beim Laden der Simulationsdaten'
    }
  }
}

export async function updateStationProcessingTime(
  stationId: string,
  processingTime: number
) {
  try {
    // This would update the processing time for a specific station
    // For now, we'll store this in the component state
    return {
      success: true,
      data: { stationId, processingTime }
    }
  } catch (error) {
    console.error('Error updating station processing time:', error)
    return {
      success: false,
      error: 'Fehler beim Aktualisieren der Bearbeitungszeit'
    }
  }
}