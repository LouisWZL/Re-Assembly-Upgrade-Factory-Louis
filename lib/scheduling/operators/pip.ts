import path from 'path'
import type {
  Batch,
  FactoryEnv,
  PriorityEntry,
  RoutePlan,
  SchedulingConfig,
} from '../types'
import { runPythonOperator } from '../python-runner'
import type { Pools } from '../pools'

interface PythonPipOrder {
  orderId: string
  dueDate?: number
  readyAt?: number
  productGroup?: string
  productVariant?: string
  demOps?: RoutePlan['operations']
  monOps?: RoutePlan['operations']
  routeCandidates?: Array<{ id: string; operations: RoutePlan['operations'] }>
}

interface PythonPipPayload {
  now: number
  orders: PythonPipOrder[]
  config: Record<string, unknown>
}

interface PythonPipResult {
  priorities: PriorityEntry[]
  routes: RoutePlan[]
  batches: Batch[]
  releaseList: string[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'pip.py')

function buildPayload(pools: Pools, now: number, config: SchedulingConfig): PythonPipPayload {
  const records = pools.getSnapshot('pip')
  const orders: PythonPipOrder[] = records.map((record) => ({
    orderId: record.oid,
    dueDate: record.meta?.dueDate ? Number(record.meta.dueDate) : undefined,
    readyAt: record.meta?.readyAt ? Number(record.meta.readyAt) : undefined,
    productGroup: record.meta?.productGroup ? String(record.meta.productGroup) : undefined,
    productVariant: record.meta?.productVariant ? String(record.meta.productVariant) : undefined,
    demOps: record.demOps,
    monOps: record.monOps,
    routeCandidates: record.meta?.routeCandidates as any,
  }))

  return {
    now,
    orders,
    config: {
      qMin: config.batchPolicy?.qMin ?? 3,
      qMax: config.batchPolicy?.qMax ?? 6,
      horizonMinutes: config.batchPolicy?.horizonMinutes ?? 240,
      tardinessWeight: config.tardinessWeight ?? 1.0,
      varianceWeight: config.varianceWeight ?? 0.1,
    },
  }
}

export async function runPIPIntegrated(
  pools: Pools,
  factory: FactoryEnv,
  config: SchedulingConfig
): Promise<PythonPipResult & { _scriptExecution?: { scriptPath: string; startTime: number; endTime: number; status: string } }> {
  const payload = buildPayload(pools, factory.simTime, config)

  const scriptPath = config.meta?.pipScriptPath
    ? String(config.meta.pipScriptPath)
    : DEFAULT_SCRIPT

  const startTime = Date.now()
  console.log(`[scheduling][pip] 🐍 Running Python script: ${scriptPath}`)
  console.log(`[scheduling][pip] ⏰ Start time: ${new Date(startTime).toISOString()}`)
  console.log(`[scheduling][pip] Payload:`, JSON.stringify(payload, null, 2))

  try {
    const result = await runPythonOperator<PythonPipPayload, PythonPipResult>({
      script: scriptPath,
      payload,
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[scheduling][pip] ✅ Python script completed successfully`)
    console.log(`[scheduling][pip] ⏱️  Duration: ${duration}ms`)
    console.log(`[scheduling][pip] Result:`, JSON.stringify(result, null, 2))

    return {
      ...result,
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
