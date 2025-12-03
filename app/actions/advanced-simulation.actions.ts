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

    // DEBUG: Check if baugruppenInstances are loaded
    const firstOrder = factory.auftraege[0]
    console.log('🔍 [API] First order in DB:', firstOrder?.id?.slice(-4))
    console.log('🔍 [API] BaugruppenInstances count:', firstOrder?.baugruppenInstances?.length || 0)
    if (firstOrder?.baugruppenInstances?.length > 0) {
      console.log('🔍 [API] First baugruppe:', {
        id: firstOrder.baugruppenInstances[0].baugruppe?.id,
        name: firstOrder.baugruppenInstances[0].baugruppe?.bezeichnung,
        dem: firstOrder.baugruppenInstances[0].baugruppe?.demontagezeit,
        mon: firstOrder.baugruppenInstances[0].baugruppe?.montagezeit
      })
    }

    // Extract process sequences from each order on the SERVER SIDE (before serialization!)
    // This is CRITICAL because we need the full operation sequences, not just averages
    // Store as a SEPARATE MAP because adding properties to Prisma objects doesn't survive serialization
    const orderProcessSequences: Record<string, any> = {}

    factory.auftraege.forEach(order => {
      // Try to get processSequenceDurations from the order
      const processSequenceDurations = order.processSequenceDurations as any

      if (processSequenceDurations?.baugruppen?.sequences?.[0]) {
        // Use the first sequence from baugruppen level (has individual Baugruppe times)
        const sequence = processSequenceDurations.baugruppen.sequences[0]

        console.log(`✅ [API] Using processSequenceDurations for order ${order.id.slice(-4)}:`, {
          demOps: sequence.demontage?.length || 0,
          monOps: sequence.remontage?.length || 0,
          totals: sequence.totals
        })

        orderProcessSequences[order.id] = {
          demontage: sequence.demontage || [],
          remontage: sequence.remontage || [],
          totals: sequence.totals || { demontage: 0, montage: 0 }
        }
      } else {
        console.error(`❌ [API] No processSequenceDurations for order ${order.id.slice(-4)} - order may not have been created with sequences`)

        // No fallback - expose the problem
        orderProcessSequences[order.id] = {
          demontage: [],
          remontage: [],
          totals: { demontage: 0, montage: 0 }
        }
      }
    })

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
        orderProcessSequences, // NEW: Separate map of process sequences with operations
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

export async function getDeliveryDeviationMetrics(factoryId: string, since?: Date | null, simulationStartTime?: number | null) {
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

    const baseTime = simulationStartTime ?? 0
    const toIso = (value: number | null | undefined) =>
      typeof value === 'number' ? new Date(baseTime + value * 60000).toISOString() : null

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
