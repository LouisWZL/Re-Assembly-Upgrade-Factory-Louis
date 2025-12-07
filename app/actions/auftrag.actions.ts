'use server'

import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

// Define types as constants for SQLite compatibility  
type AuftragsPhase = 
  | 'AUFTRAGSANNAHME'
  | 'INSPEKTION' 
  | 'REASSEMBLY_START'
  | 'REASSEMBLY_ENDE'
  | 'QUALITAETSPRUEFUNG'
  | 'AUFTRAGSABSCHLUSS'

type ReAssemblyTyp = 'PFLICHT' | 'UPGRADE'
type VariantenTyp = 'basic' | 'premium'
import { initializeCustomers, getRandomKunde } from './kunde.actions'
import { createOrderGraphFromProduct, getConstrainedZustand, findCompatibleReplacementBaugruppe, transformProcessGraphToOrderGraph, generateProcessSequences } from '@/lib/order-graph-utils'

type SequenceDefinition = {
  id: string
  steps: string[]
  totalSteps: number
  demontageSteps: number
  remontageSteps: number
}

type SequenceCollection = {
  sequences: SequenceDefinition[]
}

type BaugruppeInstanceWithDurations = {
  id: string
  baugruppeId: string
  austauschBaugruppeId?: string | null
  baugruppe: {
    id: string
    bezeichnung: string
    demontagezeit?: number | null
    montagezeit?: number | null
    baugruppentyp?: { bezeichnung: string } | null
  }
  austauschBaugruppe?: {
    id: string
    bezeichnung: string
    demontagezeit?: number | null
    montagezeit?: number | null
    baugruppentyp?: { bezeichnung: string } | null
  } | null
}

type SequenceTimingStep = {
  label: string
  duration: number
  stage: 'demontage' | 'remontage'
  baugruppeId?: string
  baugruppenInstanceId?: string
  baugruppentyp?: string | null
  usesReplacement?: boolean
  fallback: boolean
}

type SequenceTimingEntry = {
  id: string
  demontage: SequenceTimingStep[]
  remontage: SequenceTimingStep[]
  totals: {
    demontage: number
    remontage: number
  }
  meta: {
    totalSteps: number
    demontageSteps: number
    remontageSteps: number
  }
}

type ProcessSequenceDurationsPayload = {
  baugruppen: { sequences: SequenceTimingEntry[] }
  baugruppentypen: { sequences: SequenceTimingEntry[] }
}

type InstanceDurationProfile = {
  keyLabel: string
  typeLabel: string | null
  baugruppeId: string
  baugruppenInstanceId: string
  demDuration: number
  demUsedFallback: boolean
  montageDurationOriginal: number
  montageOriginalUsedFallback: boolean
  montageDurationReplacement: number
  montageReplacementUsedFallback: boolean
  usesReplacement: boolean
}

const STEP_SEPARATOR = '×'
const STEP_INSPECTION = 'I'
const STEP_QUALITY = 'Q'

function resolveDuration(value: number | null | undefined, context: string) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return { duration: value, usedFallback: false }
  }
  throw new Error(`[processSequenceDurations] Missing or invalid duration for ${context}`)
}

function buildInstanceProfiles(
  instances: BaugruppeInstanceWithDurations[]
): InstanceDurationProfile[] {
  return instances.map((instance) => {
    const label = (instance.baugruppe?.bezeichnung ?? '').trim() || instance.id
    const typeLabel = instance.baugruppe?.baugruppentyp?.bezeichnung?.trim() || null
    const dem = resolveDuration(
      instance.baugruppe?.demontagezeit,
      `demontagezeit (${label})`
    )
    const montageOriginal = resolveDuration(
      instance.baugruppe?.montagezeit,
      `montagezeit (${label})`
    )
    const replacementBase = instance.austauschBaugruppe?.montagezeit ?? instance.baugruppe?.montagezeit
    const montageReplacement = resolveDuration(
      replacementBase,
      `montagezeit replacement (${label})`
    )

    return {
      keyLabel: label,
      typeLabel,
      baugruppeId: instance.baugruppe?.id ?? instance.baugruppeId,
      baugruppenInstanceId: instance.id,
      demDuration: dem.duration,
      demUsedFallback: dem.usedFallback,
      montageDurationOriginal: montageOriginal.duration,
      montageOriginalUsedFallback: montageOriginal.usedFallback,
      montageDurationReplacement: montageReplacement.duration,
      montageReplacementUsedFallback: montageReplacement.usedFallback,
      usesReplacement: Boolean(instance.austauschBaugruppeId),
    }
  })
}

function groupProfilesByKey(
  profiles: InstanceDurationProfile[],
  selector: (profile: InstanceDurationProfile) => string | null
) {
  const map = new Map<string, InstanceDurationProfile[]>()
  profiles.forEach((profile) => {
    const key = selector(profile)
    if (!key) return
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)!.push(profile)
  })

  map.forEach((list) => list.sort((a, b) => a.baugruppenInstanceId.localeCompare(b.baugruppenInstanceId)))
  return map
}

function clonePool(base: Map<string, InstanceDurationProfile[]>) {
  const pool = new Map<string, InstanceDurationProfile[]>()
  base.forEach((list, key) => {
    pool.set(key, [...list])
  })
  return pool
}

function takeProfileForStep(pool: Map<string, InstanceDurationProfile[]>, label: string) {
  const bucket = pool.get(label)
  if (bucket && bucket.length > 0) {
    return bucket.shift() ?? null
  }
  return null
}

function pushAssignedProfile(
  target: Map<string, InstanceDurationProfile[]>,
  label: string,
  profile: InstanceDurationProfile | null
) {
  if (!profile) return
  if (!target.has(label)) {
    target.set(label, [])
  }
  target.get(label)!.push(profile)
}

function popAssignedProfile(target: Map<string, InstanceDurationProfile[]>, label: string) {
  const stack = target.get(label)
  if (!stack || stack.length === 0) return null
  return stack.pop() ?? null
}

function buildStepPayload(
  label: string,
  stage: 'demontage' | 'remontage',
  profile: InstanceDurationProfile | null
): SequenceTimingStep {
  if (!profile) {
    throw new Error(`[processSequenceDurations] Missing duration profile for step "${label}" in stage "${stage}"`)
  }

  const usesReplacement = stage === 'remontage' && profile.usesReplacement
  const duration =
    stage === 'demontage'
      ? profile.demDuration
      : usesReplacement
      ? profile.montageDurationReplacement
      : profile.montageDurationOriginal
  const fallback =
    stage === 'demontage'
      ? profile.demUsedFallback
      : usesReplacement
      ? profile.montageReplacementUsedFallback
      : profile.montageOriginalUsedFallback

  return {
    label,
    duration,
    stage,
    baugruppeId: profile.baugruppeId,
    baugruppenInstanceId: profile.baugruppenInstanceId,
    baugruppentyp: profile.typeLabel,
    usesReplacement,
    fallback,
  }
}

function buildSequenceTimingEntries(
  sequences: SequenceDefinition[],
  baseMap: Map<string, InstanceDurationProfile[]>
): SequenceTimingEntry[] {
  return sequences.map((sequence) => {
    const pool = clonePool(baseMap)
    const assigned = new Map<string, InstanceDurationProfile[]>()
    const demontageSteps: SequenceTimingStep[] = []
    const remontageSteps: SequenceTimingStep[] = []
    let stage: 'demontage' | 'remontage' = 'demontage'

    sequence.steps.forEach((rawStep) => {
      const trimmed = rawStep?.trim()
      if (!trimmed) {
        return
      }
      if (trimmed === STEP_INSPECTION || trimmed === STEP_QUALITY) {
        return
      }
      if (trimmed === STEP_SEPARATOR) {
        stage = 'remontage'
        return
      }

      if (stage === 'demontage') {
        const profile = takeProfileForStep(pool, trimmed) ?? null
        if (profile) {
          pushAssignedProfile(assigned, trimmed, profile)
        }
        demontageSteps.push(buildStepPayload(trimmed, 'demontage', profile))
      } else {
        let profile = popAssignedProfile(assigned, trimmed)
        if (!profile) {
          profile = takeProfileForStep(pool, trimmed)
        }
        remontageSteps.push(buildStepPayload(trimmed, 'remontage', profile))
      }
    })

    const demTotal = demontageSteps.reduce((sum, step) => sum + step.duration, 0)
    const remTotal = remontageSteps.reduce((sum, step) => sum + step.duration, 0)

    return {
      id: sequence.id,
      demontage: demontageSteps,
      remontage: remontageSteps,
      totals: {
        demontage: demTotal,
        remontage: remTotal,
      },
      meta: {
        totalSteps: sequence.totalSteps,
        demontageSteps: sequence.demontageSteps,
        remontageSteps: sequence.remontageSteps,
      },
    }
  })
}

function buildProcessSequenceDurationsPayload(
  sequences: {
    baugruppen?: SequenceCollection
    baugruppentypen?: SequenceCollection
  },
  instances: BaugruppeInstanceWithDurations[]
): ProcessSequenceDurationsPayload {
  const profiles = buildInstanceProfiles(instances)
  const labelMap = groupProfilesByKey(profiles, (profile) => profile.keyLabel)
  const typeMap = groupProfilesByKey(profiles, (profile) => profile.typeLabel ?? profile.keyLabel)

  return {
    baugruppen: {
      sequences: buildSequenceTimingEntries(sequences.baugruppen?.sequences ?? [], labelMap),
    },
    baugruppentypen: {
      sequences: buildSequenceTimingEntries(sequences.baugruppentypen?.sequences ?? [], typeMap),
    },
  }
}

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
        reAssemblyTyp: bi.zustand < pflichtUpgradeSchwelle ? 'PFLICHT' : undefined,
        austauschBaugruppeId: undefined
      }))
      
      // Check if we have at least one PFLICHT reassembly
      const hasPflichtReAssembly = baugruppenInstances.some(bi => bi.reAssemblyTyp === 'PFLICHT')
      
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
          baugruppenInstances[index].reAssemblyTyp = 'UPGRADE'
        }
      }
      
      // Assign replacement Baugruppen for all reassemblies
      for (let i = 0; i < baugruppenInstances.length; i++) {
        if (baugruppenInstances[i].reAssemblyTyp) {
          // Find the current Baugruppe
          const currentBaugruppe = factory.baugruppen.find(bg => bg.id === baugruppenInstances[i].baugruppeId)
          
          if (currentBaugruppe) {
            if (baugruppenInstances[i].reAssemblyTyp === 'PFLICHT') {
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
      toPhase: 'AUFTRAGSANNAHME' as AuftragsPhase,
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
          phase: 'AUFTRAGSANNAHME' as AuftragsPhase,
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

        const processSequenceDurations = buildProcessSequenceDurationsPayload(
          {
            baugruppen: baugruppenSequences,
            baugruppentypen: baugruppentypSequences
          },
          fullBaugruppenInstances as unknown as BaugruppeInstanceWithDurations[]
        )

        // Update the order with both process graphs and sequences
        await tx.auftrag.update({
          where: { id: newAuftrag.id },
          data: { 
            processGraphDataBg: processGraphDataBg as any,
            processGraphDataBgt: processGraphDataBgt as any,
            processSequences: processSequences as any,
            processSequenceDurations: processSequenceDurations as any
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
 * Generate a single order with full relations for simulation
 */
export async function generateSingleOrderForSimulation(factoryId: string) {
  try {
    // Create the order
    const result = await createSingleOrder(factoryId);

    if (!result.success || !result.data) {
      return result;
    }

    // Fetch the order with all required relations for simulation
    const orderId = result.data.id;
    const fullOrder = await prisma.auftrag.findUnique({
      where: { id: orderId },
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
    });

    return { success: true, data: fullOrder };
  } catch (error) {
    console.error('Error generating single order for simulation:', error);
    return { success: false, error: 'Fehler beim Generieren des Auftrags' };
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

/**
 * Apply inspection deterioration: with a given probability, one component's condition
 * worsens to just below the pflichtUpgradeSchwelle, making it a PFLICHT reassembly.
 * This simulates discovering hidden damage during inspection.
 *
 * @param orderId - The order to potentially deteriorate
 * @param deteriorationProbability - Probability (0-100) that deterioration occurs
 * @returns Updated order data or null if no deterioration occurred
 */
export async function applyInspectionDeterioration(
  orderId: string,
  deteriorationProbability: number
): Promise<{
  success: boolean
  deteriorated: boolean
  deterioratedComponent?: {
    id: string
    name: string
    oldZustand: number
    newZustand: number
  }
  updatedProcessSequences?: any
  updatedProcessSequenceDurations?: {
    demontage: any[]
    remontage: any[]
    totals: { demontage: number; montage: number }
  }
  error?: string
}> {
  try {
    // Roll the dice: does deterioration happen?
    const roll = Math.random() * 100
    if (roll >= deteriorationProbability) {
      console.log(`🎲 [Inspection] Order ${orderId.slice(-4)}: No deterioration (roll ${roll.toFixed(1)} >= ${deteriorationProbability}%)`)
      return { success: true, deteriorated: false }
    }

    console.log(`🎲 [Inspection] Order ${orderId.slice(-4)}: Deterioration triggered! (roll ${roll.toFixed(1)} < ${deteriorationProbability}%)`)

    // Fetch order with all necessary data
    const order = await prisma.auftrag.findUnique({
      where: { id: orderId },
      include: {
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

    if (!order) {
      return { success: false, deteriorated: false, error: 'Order not found' }
    }

    const pflichtSchwelle = order.factory.pflichtUpgradeSchwelle ?? 30

    // Find eligible components: those WITHOUT existing reAssemblyTyp
    const eligibleComponents = order.baugruppenInstances.filter(
      bi => !bi.reAssemblyTyp
    )

    if (eligibleComponents.length === 0) {
      console.log(`🔍 [Inspection] Order ${orderId.slice(-4)}: No eligible components for deterioration (all already have reAssemblyTyp)`)
      return { success: true, deteriorated: false }
    }

    // Pick a random component to deteriorate
    const randomIndex = Math.floor(Math.random() * eligibleComponents.length)
    const targetComponent = eligibleComponents[randomIndex]
    const oldZustand = targetComponent.zustand
    const newZustand = pflichtSchwelle - 1 // Just below threshold

    console.log(`⚠️ [Inspection] Order ${orderId.slice(-4)}: Component "${targetComponent.baugruppe.bezeichnung}" deteriorates from ${oldZustand}% to ${newZustand}% (< ${pflichtSchwelle}% threshold) → PFLICHT`)

    // Update component in database within transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update the BaugruppeInstance
      await tx.baugruppeInstance.update({
        where: { id: targetComponent.id },
        data: {
          zustand: newZustand,
          reAssemblyTyp: 'PFLICHT',
          // Also assign itself as replacement (same as PFLICHT logic in createSingleOrder)
          austauschBaugruppeId: targetComponent.baugruppeId
        }
      })

      // 2. Re-fetch all baugruppenInstances with updated data
      const updatedInstances = await tx.baugruppeInstance.findMany({
        where: { auftragId: orderId },
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

      // 3. Get product processGraphData for regeneration
      const produkt = order.produktvariante.produkt
      if (!produkt.processGraphData) {
        throw new Error('Product has no processGraphData')
      }

      // 4. Regenerate process graphs with updated instances
      const processGraphDataBg = transformProcessGraphToOrderGraph(
        produkt.processGraphData as any,
        updatedInstances as any,
        'baugruppen'
      )

      const processGraphDataBgt = transformProcessGraphToOrderGraph(
        produkt.processGraphData as any,
        updatedInstances as any,
        'baugruppentypen'
      )

      // 5. Regenerate process sequences
      const baugruppenSequences = generateProcessSequences(
        processGraphDataBg,
        updatedInstances as any,
        'baugruppen'
      )

      const baugruppentypSequences = generateProcessSequences(
        processGraphDataBgt,
        updatedInstances as any,
        'baugruppentypen'
      )

      const processSequences = {
        baugruppen: baugruppenSequences,
        baugruppentypen: baugruppentypSequences
      }

      // 6. Regenerate durations
      const processSequenceDurations = buildProcessSequenceDurationsPayload(
        {
          baugruppen: baugruppenSequences,
          baugruppentypen: baugruppentypSequences
        },
        updatedInstances as unknown as BaugruppeInstanceWithDurations[]
      )

      // 7. Update order with new process data
      await tx.auftrag.update({
        where: { id: orderId },
        data: {
          processGraphDataBg: processGraphDataBg as any,
          processGraphDataBgt: processGraphDataBgt as any,
          processSequences: processSequences as any,
          processSequenceDurations: processSequenceDurations as any
        }
      })

      // Extract the first sequence in the format expected by the client
      // (same transformation as in advanced-simulation.actions.ts)
      const firstSequence = processSequenceDurations.baugruppen.sequences[0]
      const clientProcessTimes = firstSequence ? {
        demontage: firstSequence.demontage || [],
        remontage: firstSequence.remontage || [],
        totals: {
          demontage: firstSequence.totals?.demontage || 0,
          montage: firstSequence.totals?.remontage || 0 // Note: DB uses "remontage", client uses "montage"
        }
      } : null

      return { processSequences, processSequenceDurations, clientProcessTimes }
    })

    return {
      success: true,
      deteriorated: true,
      deterioratedComponent: {
        id: targetComponent.id,
        name: targetComponent.baugruppe.bezeichnung,
        oldZustand,
        newZustand
      },
      updatedProcessSequences: result.processSequences,
      updatedProcessSequenceDurations: result.clientProcessTimes || undefined
    }

  } catch (error) {
    console.error('Error applying inspection deterioration:', error)
    return {
      success: false,
      deteriorated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
