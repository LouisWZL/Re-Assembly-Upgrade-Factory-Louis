'use server'

import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { AuftragsPhase, ReAssemblyTyp, VariantenTyp, Prisma } from '@prisma/client'
import { initializeCustomers, getRandomKunde } from './kunde.actions'
import { createOrderGraphFromProduct, getConstrainedZustand, findCompatibleReplacementBaugruppe, transformProcessGraphToOrderGraph, generateProcessSequences } from '@/lib/order-graph-utils'

/**
 * Get all orders for a factory (optimized for sidebar display)
 */
export async function getAuftraege(factoryId: string) {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized()
    
    // Optimiert: Lade nur notwendige Daten für die Sidebar-Tabellen
    const auftraege = await prisma.auftrag.findMany({
      where: { factoryId },
      select: {
        id: true,
        phase: true,
        createdAt: true,
        terminierung: true,
        kunde: {
          select: {
            vorname: true,
            nachname: true
          }
        },
        produktvariante: {
          select: {
            bezeichnung: true,
            typ: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500 // Limitiere auf max. 500 Aufträge für bessere Performance
    })

    return { success: true, data: auftraege }
  } catch (error) {
    console.error('Error fetching orders:', error)
    return { success: false, error: 'Fehler beim Abrufen der Aufträge' }
  }
}

/**
 * Get full order details for a single order
 */
export async function getAuftragDetails(auftragId: string) {
  try {
    const auftrag = await prisma.auftrag.findUnique({
      where: { id: auftragId },
      include: {
        kunde: true,
        factory: {
          select: {
            pflichtUpgradeSchwelle: true
          }
        },
        produktvariante: {
          include: {
            produkt: true
          }
        },
        liefertermine: {
          where: { istAktuell: true }
        },
        baugruppenInstances: {
          include: {
            baugruppe: {
              include: {
                baugruppentyp: true
              }
            },
            austauschBaugruppe: {
              include: {
                baugruppentyp: true
              }
            }
          }
        }
      }
    })

    return { success: true, data: auftrag }
  } catch (error) {
    console.error('Error fetching order details:', error)
    return { success: false, error: 'Fehler beim Abrufen der Auftragsdetails' }
  }
}

/**
 * Create a single order with optional constrained zustand values
 * @param factoryId The factory ID
 * @param constrainedZustandValues Optional array of zustand values to use
 */
async function createSingleOrder(
  factoryId: string, 
  constrainedZustandValues?: number[]
) {
  try {
    // Get factory with product and variants
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId },
      include: {
        produkte: {
          include: {
            varianten: true,
            baugruppentypen: true
          }
        },
        baugruppen: {
          include: {
            baugruppentyp: true
          }
        },
        auftraege: true
      }
    })

    if (!factory) {
      return { success: false, error: 'Factory nicht gefunden' }
    }

    // Check if factory has a product
    if (factory.produkte.length === 0) {
      return { success: false, error: 'Factory hat kein Produkt konfiguriert' }
    }

    // Capacity check removed - we can have more orders than capacity
    // Capacity now only limits Re-Assembly phase (see simulation.actions.ts)

    const produkt = factory.produkte[0] // Factory has only one product

    // Check if product has variants
    if (produkt.varianten.length === 0) {
      return { success: false, error: 'Produkt hat keine Varianten' }
    }

    // Get random customer
    const kundeResult = await getRandomKunde()
    if (!kundeResult.success || !kundeResult.data) {
      return { success: false, error: 'Kein Kunde verfügbar' }
    }

    // Select random variant (Basic or Premium)
    const randomVariante = produkt.varianten[Math.floor(Math.random() * produkt.varianten.length)]
    
    // Transform product graph to order graph
    let graphData = null
    let baugruppenInstances: Array<{ 
      baugruppeId: string; 
      zustand: number; 
      reAssemblyTyp?: ReAssemblyTyp;
      austauschBaugruppeId?: string 
    }> = []

    if (produkt.graphData) {
      const transformation = createOrderGraphFromProduct(
        produkt,
        factory.baugruppen,
        randomVariante.typ as VariantenTyp,
        constrainedZustandValues
      )
      graphData = transformation.graphData
      
      // Assign reassembly types based on pflichtUpgradeSchwelle
      const pflichtUpgradeSchwelle = factory.pflichtUpgradeSchwelle || 30
      baugruppenInstances = transformation.baugruppenInstances.map(bi => ({
        baugruppeId: bi.baugruppeId,
        zustand: bi.zustand,
        reAssemblyTyp: bi.zustand < pflichtUpgradeSchwelle ? ReAssemblyTyp.PFLICHT : undefined,
        austauschBaugruppeId: undefined
      }))
      
      // Check if we have at least one PFLICHT reassembly
      const hasPflichtReAssembly = baugruppenInstances.some(bi => bi.reAssemblyTyp === ReAssemblyTyp.PFLICHT)
      
      // Randomly select assemblies for UPGRADE reassembly (from those without PFLICHT)
      const eligibleForReAssembly = baugruppenInstances.filter(bi => !bi.reAssemblyTyp)
      
      // WICHTIG: Jeder Auftrag muss mindestens eine ReAssembly haben (PFLICHT oder UPGRADE)
      // - Wenn es bereits PFLICHT-ReAssemblies gibt (Baugruppen < pflichtUpgradeSchwelle%), können zusätzlich 0-2 UPGRADE-ReAssemblies hinzugefügt werden
      // - Wenn es keine PFLICHT-ReAssemblies gibt, MUSS mindestens 1 UPGRADE-ReAssembly hinzugefügt werden
      let reAssemblyCount: number
      if (!hasPflichtReAssembly && eligibleForReAssembly.length > 0) {
        // Keine PFLICHT-ReAssembly vorhanden -> MUSS mindestens 1 UPGRADE-ReAssembly haben
        reAssemblyCount = Math.floor(Math.random() * 2) + 1 // 1 oder 2
      } else {
        // PFLICHT-ReAssembly(s) vorhanden -> kann zusätzlich 0-2 UPGRADE-ReAssemblies haben
        reAssemblyCount = Math.floor(Math.random() * 3) // 0, 1, oder 2
      }
      
      for (let i = 0; i < Math.min(reAssemblyCount, eligibleForReAssembly.length); i++) {
        const randomIndex = Math.floor(Math.random() * eligibleForReAssembly.length)
        const selected = eligibleForReAssembly.splice(randomIndex, 1)[0]
        const index = baugruppenInstances.findIndex(bi => bi.baugruppeId === selected.baugruppeId)
        if (index !== -1) {
          baugruppenInstances[index].reAssemblyTyp = ReAssemblyTyp.UPGRADE
        }
      }
      
      // Assign replacement Baugruppen for all reassemblies
      for (let i = 0; i < baugruppenInstances.length; i++) {
        if (baugruppenInstances[i].reAssemblyTyp) {
          // Find the current Baugruppe
          const currentBaugruppe = factory.baugruppen.find(bg => bg.id === baugruppenInstances[i].baugruppeId)
          
          if (currentBaugruppe) {
            if (baugruppenInstances[i].reAssemblyTyp === ReAssemblyTyp.PFLICHT) {
              // For PFLICHT: Use the same Baugruppe as replacement
              baugruppenInstances[i].austauschBaugruppeId = currentBaugruppe.id
            } else {
              // For UPGRADE: Find a compatible replacement Baugruppe
              const replacementBaugruppe = findCompatibleReplacementBaugruppe(
                currentBaugruppe,
                factory.baugruppen,
                randomVariante.typ as VariantenTyp
              )
              
              if (replacementBaugruppe) {
                baugruppenInstances[i].austauschBaugruppeId = replacementBaugruppe.id
              }
            }
          }
        }
      }
    }

    // Initialize phase history for new order
    const initialPhaseHistory = [{
      fromPhase: null,
      toPhase: AuftragsPhase.AUFTRAGSANNAHME,
      timestamp: new Date().toISOString(),
      simulationTime: new Date().toISOString()
    }]
    
    // Create order with transaction
    const auftrag = await prisma.$transaction(async (tx) => {
      // First create the order with baugruppenInstances
      const newAuftrag = await tx.auftrag.create({
        data: {
          kundeId: kundeResult.data.id,
          produktvarianteId: randomVariante.id,
          factoryId: factoryId,
          phase: AuftragsPhase.AUFTRAGSANNAHME,
          phaseHistory: initialPhaseHistory,
          graphData: graphData as any,
          processGraphDataBg: null as any, // Will be updated after creation
          processGraphDataBgt: null as any, // Will be updated after creation
          // Create assembly instances
          baugruppenInstances: {
            create: baugruppenInstances.map(bi => ({
              baugruppeId: bi.baugruppeId,
              zustand: bi.zustand,
              reAssemblyTyp: bi.reAssemblyTyp || null,
              austauschBaugruppeId: bi.austauschBaugruppeId || null
            }))
          },
          // Create initial delivery date
          liefertermine: {
            create: {
              typ: 'GROB_ZEITSCHIENE',
              datum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
              istAktuell: true,
              bemerkung: 'Initiale Zeitschätzung'
            }
          }
        },
        include: {
          kunde: true,
          produktvariante: {
            include: {
              produkt: true
            }
          },
          baugruppenInstances: {
            include: {
              baugruppe: true,
              austauschBaugruppe: true
            }
          },
          liefertermine: true
        }
      })

      // Now generate process graphs with the created baugruppenInstances
      if (produkt.processGraphData && newAuftrag.baugruppenInstances) {
        // Get the baugruppenInstances with full relations
        const fullBaugruppenInstances = await tx.baugruppeInstance.findMany({
          where: { auftragId: newAuftrag.id },
          include: {
            baugruppe: {
              include: {
                baugruppentyp: true
              }
            },
            austauschBaugruppe: {
              include: {
                baugruppentyp: true
              }
            }
          }
        })

        // 1. Transform process graph for Baugruppen-Ebene
        const processGraphDataBg = transformProcessGraphToOrderGraph(
          produkt.processGraphData as any,
          fullBaugruppenInstances as any,
          'baugruppen'
        )

        // 2. Transform process graph for Baugruppentyp-Ebene (keeps types but adds coloring info)
        const processGraphDataBgt = transformProcessGraphToOrderGraph(
          produkt.processGraphData as any,
          fullBaugruppenInstances as any,
          'baugruppentypen'
        )

        // 3. Generate process sequences for both levels
        const baugruppenSequences = generateProcessSequences(
          processGraphDataBg,
          fullBaugruppenInstances as any,
          'baugruppen'
        )

        const baugruppentypSequences = generateProcessSequences(
          processGraphDataBgt,
          fullBaugruppenInstances as any,
          'baugruppentypen'
        )

        // Combine sequences into one JSON structure
        const processSequences = {
          baugruppen: baugruppenSequences,
          baugruppentypen: baugruppentypSequences
        }

        // Update the order with both process graphs and sequences
        await tx.auftrag.update({
          where: { id: newAuftrag.id },
          data: { 
            processGraphDataBg: processGraphDataBg as any,
            processGraphDataBgt: processGraphDataBgt as any,
            processSequences: processSequences as any
          }
        })
      }

      // Store the transformed graph in the produktvariante links field if not already done
      if (graphData && !randomVariante.links) {
        await tx.produktvariante.update({
          where: { id: randomVariante.id },
          data: { links: graphData as any }
        })
      }

      // Return the updated order
      return await tx.auftrag.findUnique({
        where: { id: newAuftrag.id },
        include: {
          kunde: true,
          produktvariante: {
            include: {
              produkt: true
            }
          },
          baugruppenInstances: {
            include: {
              baugruppe: true,
              austauschBaugruppe: true
            }
          },
          liefertermine: true
        }
      })
    })

    return { success: true, data: auftrag }
  } catch (error) {
    console.error('Error creating order:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { success: false, error: `Datenbankfehler: ${error.message}` }
    }
    return { success: false, error: 'Fehler beim Erstellen des Auftrags' }
  }
}

/**
 * Generate multiple orders for a factory with batch average zustand of 65%
 */
export async function generateOrders(factoryId: string, count: number = 10) {
  try {
    // Ensure database is initialized
    await ensureDatabaseInitialized()
    
    // Ensure customers are initialized
    const initResult = await initializeCustomers()
    if (!initResult.success) {
      return { success: false, error: 'Fehler beim Initialisieren der Kunden' }
    }

    // Get factory info to know how many Baugruppen per order
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id: factoryId },
      include: {
        produkte: {
          include: {
            baugruppentypen: true
          }
        }
      }
    })

    if (!factory || factory.produkte.length === 0) {
      return { success: false, error: 'Factory oder Produkt nicht gefunden' }
    }

    const avgBaugruppen = factory.produkte[0].baugruppentypen.length || 5
    const targetBatchAverage = factory.targetBatchAverage || 65
    const totalBaugruppenCount = count * avgBaugruppen
    
    // Pre-generate all zustand values to achieve target batch average
    const allZustandValues: number[] = []
    let currentSum = 0
    
    for (let i = 0; i < totalBaugruppenCount; i++) {
      const remaining = totalBaugruppenCount - i - 1
      const zustand = getConstrainedZustand(currentSum, targetBatchAverage, i, remaining)
      allZustandValues.push(zustand)
      currentSum += zustand
    }
    
    // Shuffle the values to distribute them randomly across orders
    for (let i = allZustandValues.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allZustandValues[i], allZustandValues[j]] = [allZustandValues[j], allZustandValues[i]]
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [] as string[],
      totalZustand: 0,
      totalBaugruppen: 0
    }

    // Create orders one by one with pre-calculated zustand values
    for (let i = 0; i < count; i++) {
      // Extract zustand values for this order
      const orderZustandValues = allZustandValues.slice(
        i * avgBaugruppen, 
        (i + 1) * avgBaugruppen
      )
      
      const result = await createSingleOrder(factoryId, orderZustandValues)
      if (result.success && result.data) {
        results.created++
        // Track actual zustand values for reporting
        const orderBaugruppen = (result.data as any).baugruppenInstances || []
        orderBaugruppen.forEach((bi: any) => {
          results.totalZustand += bi.zustand
          results.totalBaugruppen++
        })
      } else {
        results.failed++
        if (result.error && !results.errors.includes(result.error)) {
          results.errors.push(result.error)
        }
      }
    }
    
    const actualAverage = results.totalBaugruppen > 0 
      ? Math.round(results.totalZustand / results.totalBaugruppen)
      : 0

    revalidatePath('/')
    revalidatePath(`/factory-configurator/${factoryId}`)

    return {
      success: true,
      message: `${results.created} Aufträge erstellt (Ø ${actualAverage}% Zustand), ${results.failed} fehlgeschlagen`,
      created: results.created,
      failed: results.failed,
      errors: results.errors,
      averageZustand: actualAverage
    }
  } catch (error) {
    console.error('Error generating orders:', error)
    return { success: false, error: 'Fehler beim Generieren der Aufträge' }
  }
}

/**
 * Get order statistics for a factory
 */
export async function getAuftragStatistics(factoryId: string) {
  try {
    const stats = await prisma.auftrag.groupBy({
      by: ['phase'],
      where: { factoryId },
      _count: {
        phase: true
      }
    })

    const totalOrders = await prisma.auftrag.count({
      where: { factoryId }
    })

    const variantStats = await prisma.auftrag.groupBy({
      by: ['produktvarianteId'],
      where: { factoryId },
      _count: {
        produktvarianteId: true
      }
    })

    // Get variant details
    const variantDetails = await prisma.produktvariante.findMany({
      where: {
        id: {
          in: variantStats.map(v => v.produktvarianteId)
        }
      },
      select: {
        id: true,
        bezeichnung: true,
        typ: true
      }
    })

    const variantMap = new Map(variantDetails.map(v => [v.id, v]))
    const variantCounts = variantStats.map(stat => ({
      variant: variantMap.get(stat.produktvarianteId),
      count: stat._count.produktvarianteId
    }))

    return {
      success: true,
      data: {
        totalOrders,
        byPhase: stats,
        byVariant: variantCounts
      }
    }
  } catch (error) {
    console.error('Error fetching order statistics:', error)
    return { success: false, error: 'Fehler beim Abrufen der Auftragsstatistiken' }
  }
}

/**
 * Delete a single order
 */
export async function deleteSingleOrder(orderId: string) {
  try {
    // Delete all related data in correct order to avoid foreign key constraint violations
    
    // 1. Delete Liefertermin records
    await prisma.liefertermin.deleteMany({
      where: {
        auftragId: orderId
      }
    });

    // 2. Delete BaugruppeInstance records  
    await prisma.baugruppeInstance.deleteMany({
      where: {
        auftragId: orderId
      }
    });

    // 3. Delete StationDuration records (these have onDelete: Cascade, but delete explicitly for safety)
    await prisma.stationDuration.deleteMany({
      where: {
        auftragId: orderId
      }
    });

    // 4. Finally, delete the order
    const deleteResult = await prisma.auftrag.delete({
      where: {
        id: orderId
      }
    });

    revalidatePath('/');
    revalidatePath(`/factory-configurator/${deleteResult.factoryId}`);

    return {
      success: true,
      message: `Auftrag erfolgreich gelöscht`,
      deletedOrder: deleteResult
    };
  } catch (error) {
    console.error('Error deleting order:', error);
    return { 
      success: false, 
      error: 'Fehler beim Löschen des Auftrags' 
    };
  }
}

/**
 * Delete all orders for a factory
 */
export async function deleteAllOrdersForFactory(factoryId: string) {
  try {
    // Delete all related data in correct order to avoid foreign key constraint violations
    
    // 1. Delete Liefertermin records for all orders in this factory
    await prisma.liefertermin.deleteMany({
      where: {
        auftrag: {
          factoryId: factoryId
        }
      }
    });

    // 2. Delete BaugruppeInstance records for all orders in this factory
    await prisma.baugruppeInstance.deleteMany({
      where: {
        auftrag: {
          factoryId: factoryId
        }
      }
    });

    // 3. Delete StationDuration records (these have onDelete: Cascade, but delete explicitly for safety)
    await prisma.stationDuration.deleteMany({
      where: {
        auftrag: {
          factoryId: factoryId
        }
      }
    });

    // 4. Finally, delete all orders for this factory
    const deleteResult = await prisma.auftrag.deleteMany({
      where: {
        factoryId: factoryId
      }
    });

    revalidatePath('/');
    revalidatePath(`/factory-configurator/${factoryId}`);

    return {
      success: true,
      message: `${deleteResult.count} Aufträge erfolgreich gelöscht`,
      deletedCount: deleteResult.count
    };
  } catch (error) {
    console.error('Error deleting orders:', error);
    return { 
      success: false, 
      error: 'Fehler beim Löschen der Aufträge' 
    };
  }
}

/**
 * Update order phase with history tracking
 */
export async function updateAuftragPhaseWithHistory(
  auftragId: string, 
  newPhase: AuftragsPhase,
  simulationTime: Date
) {
  try {
    // Get current order to access existing history
    const currentAuftrag = await prisma.auftrag.findUnique({
      where: { id: auftragId },
      select: { 
        phase: true,
        phaseHistory: true 
      }
    })
    
    if (!currentAuftrag) {
      return { success: false, error: 'Auftrag nicht gefunden' }
    }
    
    // Build phase history
    const existingHistory = (currentAuftrag.phaseHistory as any[]) || []
    const historyEntry = {
      fromPhase: currentAuftrag.phase,
      toPhase: newPhase,
      timestamp: new Date().toISOString(),
      simulationTime: simulationTime.toISOString()
    }
    
    const updatedHistory = [...existingHistory, historyEntry]
    
    // Update order with new phase and history
    const updatedAuftrag = await prisma.auftrag.update({
      where: { id: auftragId },
      data: { 
        phase: newPhase,
        phaseHistory: updatedHistory
      }
    })
    
    return { success: true, data: updatedAuftrag }
  } catch (error) {
    console.error('Error updating order phase with history:', error)
    return { success: false, error: 'Fehler beim Aktualisieren der Auftragsphase' }
  }
}

/**
 * Update order phase
 */
export async function updateAuftragPhase(auftragId: string, phase: AuftragsPhase) {
  try {
    const updatedAuftrag = await prisma.auftrag.update({
      where: { id: auftragId },
      data: { phase },
      include: {
        kunde: true,
        produktvariante: {
          include: {
            produkt: true
          }
        }
      }
    })

    revalidatePath('/')
    
    return {
      success: true,
      data: updatedAuftrag,
      message: `Auftragsphase auf ${phase} aktualisiert`
    }
  } catch (error) {
    console.error('Error updating order phase:', error)
    return { success: false, error: 'Fehler beim Aktualisieren der Auftragsphase' }
  }
}

/**
 * Delete an order
 */
export async function deleteAuftrag(auftragId: string) {
  try {
    // Delete with cascade (delivery dates and assembly instances)
    await prisma.$transaction(async (tx) => {
      // Delete delivery dates
      await tx.liefertermin.deleteMany({
        where: { auftragId }
      })

      // Delete assembly instances
      await tx.baugruppeInstance.deleteMany({
        where: { auftragId }
      })

      // Delete order
      await tx.auftrag.delete({
        where: { id: auftragId }
      })
    })

    revalidatePath('/')
    
    return {
      success: true,
      message: 'Auftrag erfolgreich gelöscht'
    }
  } catch (error) {
    console.error('Error deleting order:', error)
    return { success: false, error: 'Fehler beim Löschen des Auftrags' }
  }
}

/**
 * Delete all orders for a factory
 */
export async function deleteAllAuftraege(factoryId: string) {
  try {
    // Delete all orders with their related data
    await prisma.$transaction(async (tx) => {
      // Get all order IDs for this factory
      const auftraege = await tx.auftrag.findMany({
        where: { factoryId },
        select: { id: true }
      })
      
      const auftragIds = auftraege.map(a => a.id)
      
      if (auftragIds.length > 0) {
        // Delete all delivery dates
        await tx.liefertermin.deleteMany({
          where: { auftragId: { in: auftragIds } }
        })

        // Delete all assembly instances
        await tx.baugruppeInstance.deleteMany({
          where: { auftragId: { in: auftragIds } }
        })

        // Delete all orders
        await tx.auftrag.deleteMany({
          where: { factoryId }
        })
      }
    })

    revalidatePath('/')
    
    return {
      success: true,
      message: 'Alle Aufträge erfolgreich gelöscht'
    }
  } catch (error) {
    console.error('Error deleting all orders:', error)
    return { success: false, error: 'Fehler beim Löschen aller Aufträge' }
  }
}