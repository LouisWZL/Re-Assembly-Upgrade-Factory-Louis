import path from 'path'
import type {
  FactoryCapacity,
  FactoryEnv,
  OperationBlock,
  Plan,
  SchedulingConfig,
} from '../types'
import { runPythonOperator } from '../python-runner'
import type { Pools } from '../pools'
import type { ReassemblyFactory } from '@prisma/client'

interface PythonPipoOrder {
  orderId: string
  dueDate?: number
  operations: OperationBlock[]
  processSequences?: unknown
}

interface PythonPipoPayload {
  startTime: number
  orders: PythonPipoOrder[]
  config: Record<string, unknown> & {
    factoryCapacity?: FactoryCapacity
    demFlexSharePct?: number
    monFlexSharePct?: number
    setupMinutes?: number
    setupWeight?: number
  }
}

interface PythonPipoResult {
  paretoSet: Plan[]
  selectedPlanId: string | null
  releasedOps: OperationBlock[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'Becker_Feinterminierung_v2.py')

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

function buildPayload(pools: Pools, factoryEnv: FactoryEnv, config: SchedulingConfig, factory: ReassemblyFactory): PythonPipoPayload {
  const records = pools.getSnapshot('pipo')

  // Find simulation start: earliest createdAt timestamp (in ms)
  const createdAtValues = records
    .map(r => r.meta?.createdAt ? Number(r.meta.createdAt) : null)
    .filter((v): v is number => v !== null && !isNaN(v))
  const simStartMs = createdAtValues.length > 0 ? Math.min(...createdAtValues) : Date.now()

  const orders = records.map((record) => {
    const rawDueDate = record.meta?.dueDate ? Number(record.meta.dueDate) : undefined

    return {
      orderId: record.oid,
      dueDate: convertDueDateToSimMinutes(rawDueDate, simStartMs),
      operations: [
        ...(record.demOps ?? []),
        ...(record.monOps ?? []),
      ].map((op) => ({
        ...op,
        orderId: record.oid,
      })),
      processSequences: record.processSequences,
    }
  })

  return {
    startTime: factoryEnv.simTime,
    orders,
    config: {
      weights: config.meta?.pipoWeights ?? {
        makespan: 0.4,
        tardiness: 0.4,
        setupPenalty: 0.2,
      },
      factoryCapacity: {
        montageStationen: factory.anzahlMontagestationen,
        demontageStationen: factory.anzahlDemontagestationen,
        flexibel: false, // Computed from flex percentages in Python
        defaultDemontagezeit: factory.defaultDemontagezeit,
        defaultMontagezeit: factory.defaultMontagezeit,
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

export async function runPIPoFineTermMOAHS(
  pools: Pools,
  factoryEnv: FactoryEnv,
  config: SchedulingConfig,
  factory: ReassemblyFactory
): Promise<PythonPipoResult & { _scriptExecution?: { scriptPath: string; startTime: number; endTime: number; status: string } }> {
  const payload = buildPayload(pools, factoryEnv, config, factory)

  // Debug logging for PIPO payload
  console.log('🔍 [PIPO] Payload sent to Python:')
  console.log(`  Orders: ${payload.orders.length}`)
  payload.orders.forEach((order, idx) => {
    const durations = order.operations.map(op => op.expectedDuration).join(', ')
    console.log(`  [${idx}] Order ${order.orderId.slice(-4)}: ${order.operations.length} ops, durations=[${durations}]`)
  })
  console.log(`  Factory defaults: dem=${payload.config.factoryCapacity?.defaultDemontagezeit}, mon=${payload.config.factoryCapacity?.defaultMontagezeit}`)

  const scriptPath = config.meta?.pipoScriptPath
    ? String(config.meta.pipoScriptPath)
    : DEFAULT_SCRIPT

  const startTime = Date.now()
  console.log(`[scheduling][pipo] 🐍 Running Python script: ${scriptPath}`)
  console.log(`[scheduling][pipo] ⏰ Start time: ${new Date(startTime).toISOString()}`)
  console.log('\n' + '='.repeat(80))
  console.log('📤 [PIPO] FULL PAYLOAD TO PYTHON SCRIPT:')
  console.log('='.repeat(80))
  console.log(JSON.stringify(payload, null, 2))
  console.log('='.repeat(80) + '\n')

  try {
    const { result, stderr } = await runPythonOperator<PythonPipoPayload, PythonPipoResult>({
      script: scriptPath,
      payload,
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[scheduling][pipo] ✅ Python script completed successfully`)
    console.log(`[scheduling][pipo] ⏱️  Duration: ${duration}ms`)
    console.log(`[scheduling][pipo] Result:`, JSON.stringify(result, null, 2))

    // Add stderr logs to debug output
    const debugWithLogs = [
      ...(result.debug || []),
      {
        stage: 'PIPO_PYTHON_LOGS',
        logs: stderr || 'No logs available'
      }
    ]

    console.log(`[scheduling][pipo] 🔍 stderr length: ${stderr ? stderr.length : 0}`)
    console.log(`[scheduling][pipo] 🔍 debugWithLogs length: ${debugWithLogs.length}`)
    console.log(`[scheduling][pipo] 🔍 Last debug entry:`, JSON.stringify(debugWithLogs[debugWithLogs.length - 1], null, 2))

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

    console.error(`[scheduling][pipo] ❌ Python script failed`)
    console.error(`[scheduling][pipo] ⏱️  Duration: ${duration}ms`)
    console.error(`[scheduling][pipo] Error:`, error)

    throw error
  }
}
