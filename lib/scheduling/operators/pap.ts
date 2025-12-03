import path from 'path'
import type { Pools } from '../pools'
import type { Batch, EtaPrediction, SchedulingConfig, FactoryCapacity } from '../types'
import { runPythonOperator } from '../python-runner'
import type { ReassemblyFactory } from '@prisma/client'

interface PythonPapOrder {
  orderId: string
  createdAt?: number
  dueDate?: number
  demOps?: Array<{ id: string; stationId: string; expectedDuration: number; label?: string }>
  monOps?: Array<{ id: string; stationId: string; expectedDuration: number; label?: string }>
  processTimeDem?: number  // Deprecated: sum of demOps, for backward compatibility
  processTimeMon?: number  // Deprecated: sum of monOps, for backward compatibility
  priorityHint?: number
  baugruppen?: unknown  // Process sequences for components
  baugruppentypen?: unknown  // Process sequences for component types
}

interface PythonPapPayload {
  now: number
  orders: PythonPapOrder[]
  config: Record<string, unknown> & {
    factoryCapacity?: FactoryCapacity
  }
  processSequences?: Record<string, unknown>
}

interface PythonPapResult {
  batches: Batch[]
  etaList: EtaPrediction[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'pap.py')

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

function buildPayload(pools: Pools, now: number, config: SchedulingConfig, factory: ReassemblyFactory): PythonPapPayload {
  const records = pools.getSnapshot('pap')
  const processSequencesMap: Record<string, unknown> = {}

  // Find simulation start: earliest createdAt timestamp (in ms)
  const createdAtValues = records
    .map(r => r.meta?.createdAt ? Number(r.meta.createdAt) : null)
    .filter((v): v is number => v !== null && !isNaN(v))
  const simStartMs = createdAtValues.length > 0 ? Math.min(...createdAtValues) : Date.now()

  const orders: PythonPapOrder[] = records.map((record) => {
    const processSeqs = record.processSequences as any
    if (record.oid && processSeqs) {
      processSequencesMap[record.oid] = processSeqs
    }
    const baugruppen = processSeqs?.baugruppen
    const baugruppentypen = processSeqs?.baugruppentypen

    const rawDueDate = record.meta?.dueDate ? Number(record.meta.dueDate) : undefined

    return {
      orderId: record.oid,
      createdAt: record.meta?.createdAt ? Number(record.meta.createdAt) : undefined,
      dueDate: convertDueDateToSimMinutes(rawDueDate, simStartMs),
      demOps: record.demOps || [],  // Pass actual operations array
      monOps: record.monOps || [],  // Pass actual operations array
      processTimeDem: record.demOps?.reduce((sum, op) => sum + op.expectedDuration, 0) ?? 0,  // For backward compatibility
      processTimeMon: record.monOps?.reduce((sum, op) => sum + op.expectedDuration, 0) ?? 0,  // For backward compatibility
      priorityHint: record.priorityScore,
      baugruppen,
      baugruppentypen,
    }
  })

  return {
    now,
    orders,
    config: {
      qMin: config.batchPolicy?.qMin ?? 3,
      qMax: config.batchPolicy?.qMax ?? 7,
      intervalMinutes: config.schedIntervalMinutes,
      lambda: config.meta?.poissonLambda ?? 4,
      factoryCapacity: {
        montageStationen: factory.anzahlMontagestationen,
        demontageStationen: 5, // Not yet stored in DB - using default
        flexibel: false, // Not yet stored in DB - using default
        defaultDemontagezeit: factory.defaultDemontagezeit,
        defaultMontagezeit: factory.defaultMontagezeit,
        schichtmodell: factory.schichtmodell,
        kapazitaet: factory.kapazität,
      },
    },
    processSequences: Object.keys(processSequencesMap).length ? processSequencesMap : undefined,
  }
}

export async function runPAPForecastAndBatch(
  pools: Pools,
  now: number,
  config: SchedulingConfig,
  factory: ReassemblyFactory
): Promise<PythonPapResult & { _scriptExecution?: { scriptPath: string; startTime: number; endTime: number; status: string } }> {
  const payload = buildPayload(pools, now, config, factory)

  const scriptPath = config.meta?.papScriptPath
    ? String(config.meta.papScriptPath)
    : DEFAULT_SCRIPT

  const startTime = Date.now()
  console.log(`[scheduling][pap] 🐍 Running Python script: ${scriptPath}`)
  console.log(`[scheduling][pap] ⏰ Start time: ${new Date(startTime).toISOString()}`)
  console.log(`[scheduling][pap] Payload:`, JSON.stringify(payload, null, 2))

  try {
    const { result, stderr } = await runPythonOperator<PythonPapPayload, PythonPapResult>({
      script: scriptPath,
      payload,
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[scheduling][pap] ✅ Python script completed successfully`)
    console.log(`[scheduling][pap] ⏱️  Duration: ${duration}ms`)
    console.log(`[scheduling][pap] Result:`, JSON.stringify(result, null, 2))

    // Add stderr logs to debug output
    const debugWithLogs = [
      ...(result.debug || []),
      {
        stage: 'PAP_PYTHON_LOGS',
        logs: stderr || 'No logs available'
      }
    ]

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

    console.error(`[scheduling][pap] ❌ Python script failed`)
    console.error(`[scheduling][pap] ⏱️  Duration: ${duration}ms`)
    console.error(`[scheduling][pap] Error:`, error)

    throw error
  }
}
