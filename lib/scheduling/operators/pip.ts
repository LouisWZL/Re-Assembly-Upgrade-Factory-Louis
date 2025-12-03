import path from 'path'
import type {
  Batch,
  FactoryCapacity,
  FactoryEnv,
  PriorityEntry,
  RoutePlan,
  SchedulingConfig,
} from '../types'
import { runPythonOperator } from '../python-runner'
import type { Pools } from '../pools'
import type { ReassemblyFactory } from '@prisma/client'

interface PythonPipOrder {
  orderId: string
  dueDate?: number
  readyAt?: number
  productGroup?: string
  productVariant?: string
  demOps?: RoutePlan['operations']
  monOps?: RoutePlan['operations']
  routeCandidates?: Array<{ id: string; operations: RoutePlan['operations'] }>
  processSequences?: unknown
}

interface PythonPipPayload {
  now: number
  orders: PythonPipOrder[]
  config: Record<string, unknown> & {
    factoryCapacity?: FactoryCapacity
    demFlexSharePct?: number
    monFlexSharePct?: number
    setupMinutes?: number
    setupWeight?: number
  }
}

interface PythonPipResult {
  priorities: PriorityEntry[]
  routes: RoutePlan[]
  batches: Batch[]
  releaseList: string[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'Becker_Mittelfristige_Terminierung_v2.py')

/**
 * Converts dueDate from absolute timestamp (ms) to simulation minutes.
 * Uses the earliest createdAt as the simulation start reference.
 */
function convertDueDateToSimMinutes(dueDateMs: number | undefined, simStartMs: number): number | undefined {
  if (dueDateMs === undefined || dueDateMs === null) return undefined
  // Convert from absolute ms timestamp to minutes relative to simulation start
  const diffMs = dueDateMs - simStartMs
  return diffMs / 60000  // ms to minutes
}

function buildPayload(pools: Pools, now: number, config: SchedulingConfig, factory: ReassemblyFactory): PythonPipPayload {
  const records = pools.getSnapshot('pip')

  // Find simulation start: earliest createdAt timestamp (in ms)
  const createdAtValues = records
    .map(r => r.meta?.createdAt ? Number(r.meta.createdAt) : null)
    .filter((v): v is number => v !== null && !isNaN(v))
  const simStartMs = createdAtValues.length > 0 ? Math.min(...createdAtValues) : Date.now()

  const orders: PythonPipOrder[] = records.map((record) => {
    const rawDueDate = record.meta?.dueDate ? Number(record.meta.dueDate) : undefined

    return {
      orderId: record.oid,
      dueDate: convertDueDateToSimMinutes(rawDueDate, simStartMs),
      readyAt: record.meta?.readyAt ? Number(record.meta.readyAt) : undefined,
      productGroup: record.meta?.productGroup ? String(record.meta.productGroup) : undefined,
      productVariant: record.meta?.productVariant ? String(record.meta.productVariant) : undefined,
      demOps: record.demOps,
      monOps: record.monOps,
      routeCandidates: record.meta?.routeCandidates as any,
      processSequences: record.processSequences,
    }
  })

  const demStations = factory.anzahlDemontagestationen
  const monStations = factory.anzahlMontagestationen

  console.log(`[PIP][buildPayload] Factory object received: id=${factory.id}, demStations=${demStations}, monStations=${monStations}`)
  console.log(`[PIP][buildPayload] Factory name: ${factory.name}`)
  console.log(`[PIP][buildPayload] All factory capacity fields:`, {
    anzahlDemontagestationen: factory.anzahlDemontagestationen,
    anzahlMontagestationen: factory.anzahlMontagestationen,
    demFlexSharePct: factory.demFlexSharePct,
    monFlexSharePct: factory.monFlexSharePct,
    setupTimeMinutes: factory.setupTimeMinutes,
  })

  if (!demStations || !monStations) {
    throw new Error(`[PIP] Missing factory station counts (demontage/montage) for factory ${factory.id} - no defaults allowed`)
  }

  return {
    now,
    orders,
    config: {
      qMin: config.batchPolicy?.qMin ?? 3,
      qMax: config.batchPolicy?.qMax ?? 6,
      horizonMinutes: config.batchPolicy?.horizonMinutes ?? 240,
      tardinessWeight: config.tardinessWeight ?? 1.0,
      varianceWeight: config.varianceWeight ?? 0.1,
      factoryCapacity: {
        montageStationen: monStations,
        demontageStationen: demStations,
        defaultDemontagezeit: factory.defaultDemontagezeit,
        defaultMontagezeit: factory.defaultMontagezeit,
        flexibel: false, // Computed from flex percentages in Python
        schichtmodell: factory.schichtmodell,
        kapazitaet: factory.kapazität,
      },
      demFlexSharePct: factory.demFlexSharePct ?? 50,
      monFlexSharePct: factory.monFlexSharePct ?? 50,
      setupMinutes: factory.setupTimeMinutes ?? 0,
      setupWeight: config.setupWeight ?? 0.01,
    },
  }
}

export async function runPIPIntegrated(
  pools: Pools,
  factoryEnv: FactoryEnv,
  config: SchedulingConfig,
  factory: ReassemblyFactory
): Promise<PythonPipResult & { _scriptExecution?: { scriptPath: string; startTime: number; endTime: number; status: string } }> {
  const payload = buildPayload(pools, factoryEnv.simTime, config, factory)

  // Debug logging for PIP payload
  console.log('🔍 [PIP] Payload sent to Python:')
  console.log(`  Orders: ${payload.orders.length}`)
  console.log(`  Kapazitäten: dem=${payload.config.factoryCapacity?.demontageStationen}, mon=${payload.config.factoryCapacity?.montageStationen}, demFlex=${payload.config.demFlexSharePct}%, monFlex=${payload.config.monFlexSharePct}%, setup=${payload.config.setupMinutes}min`)
  console.log(`  Weights: setupWeight=${payload.config.setupWeight}, tardiness=${payload.config.tardinessWeight}, variance=${payload.config.varianceWeight}`)
  console.log(`  Factory defaults: dem=${payload.config.factoryCapacity?.defaultDemontagezeit}min, mon=${payload.config.factoryCapacity?.defaultMontagezeit}min`)
  payload.orders.forEach((order, idx) => {
    const demOps = order.demOps ?? []
    const monOps = order.monOps ?? []
    const demDur = demOps.map(op => op.expectedDuration).join(', ')
    const monDur = monOps.map(op => op.expectedDuration).join(', ')
    console.log(`  [${idx}] ${order.orderId.slice(-4)} demOps(${demOps.length})=[${demDur}] monOps(${monOps.length})=[${monDur}]`)
    if (demOps.length === 0 || monOps.length === 0) {
      console.error(`❌ [PIP] missing ${demOps.length === 0 ? 'demOps ' : ''}${monOps.length === 0 ? 'monOps' : ''}`)
    }
  })

  const scriptPath = config.meta?.pipScriptPath
    ? String(config.meta.pipScriptPath)
    : DEFAULT_SCRIPT

  const startTime = Date.now()
  console.log(`[scheduling][pip] 🐍 Running Python script: ${scriptPath}`)
  console.log(`[scheduling][pip] ⏰ Start time: ${new Date(startTime).toISOString()}`)
  console.log('\n' + '='.repeat(80))
  console.log('📤 [PIP] FULL PAYLOAD TO PYTHON SCRIPT:')
  console.log('='.repeat(80))
  console.log(JSON.stringify(payload, null, 2))
  console.log('='.repeat(80) + '\n')

  try {
    const { result, stderr } = await runPythonOperator<PythonPipPayload, PythonPipResult>({
      script: scriptPath,
      payload,
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[scheduling][pip] ✅ Python script completed successfully`)
    console.log(`[scheduling][pip] ⏱️  Duration: ${duration}ms`)
    console.log(`[scheduling][pip] Result:`, JSON.stringify(result, null, 2))

    // Add stderr logs to debug output
    const debugWithLogs = [
      ...(result.debug || []),
      {
        stage: 'PIP_PYTHON_LOGS',
        logs: stderr || 'No logs available'
      }
    ]

    console.log(`[scheduling][pip] 🔍 stderr length: ${stderr ? stderr.length : 0}`)
    console.log(`[scheduling][pip] 🔍 debugWithLogs length: ${debugWithLogs.length}`)
    console.log(`[scheduling][pip] 🔍 Last debug entry:`, JSON.stringify(debugWithLogs[debugWithLogs.length - 1], null, 2))

    return {
      ...result,
      debug: debugWithLogs,
      _scriptExecution: {
        scriptPath,
        startTime,
        endTime,
        status: 'success',
      },
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime

    console.error(`[scheduling][pip] ❌ Python script failed`)
    console.error(`[scheduling][pip] ⏱️  Duration: ${duration}ms`)
    console.error(`[scheduling][pip] Error:`, error)

    throw error
  }
}
