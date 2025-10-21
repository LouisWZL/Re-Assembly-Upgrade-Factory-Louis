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

export async function getDeliveryDeviationMetrics(factoryId: string, since?: Date | null) {
  try {
    const orders = await prisma.auftrag.findMany({
      where: {
        factoryId,
        plannedDeliverySimMinute: {
          not: null,
        },
        ...(since
          ? ({
              updatedAt: {
                gte: since,
              },
            } as const)
          : {}),
      },
      select: {
        id: true,
        plannedDeliverySimMinute: true,
        finalCompletionSimMinute: true,
        updatedAt: true,
        produktvariante: {
          select: {
            bezeichnung: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    const evaluable = orders.filter(
      (order) => typeof order.plannedDeliverySimMinute === 'number'
    )
    const withFinal = evaluable.filter(
      (order) => typeof order.finalCompletionSimMinute === 'number'
    )

    if (withFinal.length === 0) {
      return {
        success: true,
        data: {
          evaluatedCount: evaluable.length,
          completedCount: 0,
          averageDeviationMinutes: 0,
          averageAbsoluteDeviationMinutes: 0,
          lateCount: 0,
          earlyCount: 0,
          onTimeCount: 0,
          pendingCount: evaluable.length,
          sample: [],
          lastUpdated: new Date().toISOString(),
        },
      }
    }

    const diffs = withFinal.map((order) => {
      const planned = Number(order.plannedDeliverySimMinute)
      const final = Number(order.finalCompletionSimMinute)
      return final - planned
    })

    const sum = diffs.reduce((acc, value) => acc + value, 0)
    const sumAbs = diffs.reduce((acc, value) => acc + Math.abs(value), 0)
    const averageDeviationMinutes = sum / diffs.length
    const averageAbsoluteDeviationMinutes = sumAbs / diffs.length

    const lateCount = diffs.filter((diff) => diff > 0.5).length
    const earlyCount = diffs.filter((diff) => diff < -0.5).length
    const onTimeCount = diffs.length - lateCount - earlyCount

    const toIso = (value: number | null | undefined) =>
      typeof value === 'number' ? new Date(value * 60000).toISOString() : null

    const sample = [...withFinal]
      .sort((a, b) => {
        const diffA = Math.abs(Number(a.finalCompletionSimMinute) - Number(a.plannedDeliverySimMinute))
        const diffB = Math.abs(Number(b.finalCompletionSimMinute) - Number(b.plannedDeliverySimMinute))
        return diffB - diffA
      })
      .slice(0, 6)
      .map((order) => {
        const planned = Number(order.plannedDeliverySimMinute)
        const final = Number(order.finalCompletionSimMinute)
        const deviation = final - planned
        return {
          orderId: order.id,
          productVariant: order.produktvariante?.bezeichnung ?? null,
          deviationMinutes: deviation,
          plannedIso: toIso(planned),
          finalIso: toIso(final),
        }
      })

    return {
      success: true,
      data: {
        evaluatedCount: evaluable.length,
        completedCount: withFinal.length,
        averageDeviationMinutes,
        averageAbsoluteDeviationMinutes,
        lateCount,
        earlyCount,
        onTimeCount,
        pendingCount: evaluable.length - withFinal.length,
        sample,
        lastUpdated: new Date().toISOString(),
      },
    }
  } catch (error) {
    console.error('Error building delivery deviation metrics:', error)
    return {
      success: false,
      error: 'Fehler beim Laden der Liefertermin-Analysen',
    }
  }
}

export async function setOrderCompletionSimMinute(orderId: string, simMinute: number) {
  try {
    await prisma.auftrag.update({
      where: { id: orderId },
      data: {
        finalCompletionSimMinute: simMinute,
      },
    })
    return { success: true }
  } catch (error) {
    console.error('Error updating final completion sim minute:', error)
    return { success: false, error: 'Fehler beim Aktualisieren des Abschlusszeitpunkts' }
  }
}
