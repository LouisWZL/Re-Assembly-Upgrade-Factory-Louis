import path from 'path'
import type {
  FactoryEnv,
  OperationBlock,
  Plan,
  SchedulingConfig,
} from '../types'
import { runPythonOperator } from '../python-runner'
import type { Pools } from '../pools'

interface PythonPipoOrder {
  orderId: string
  dueDate?: number
  operations: OperationBlock[]
}

interface PythonPipoPayload {
  startTime: number
  orders: PythonPipoOrder[]
  config: Record<string, unknown>
}

interface PythonPipoResult {
  paretoSet: Plan[]
  selectedPlanId: string
  releasedOps: OperationBlock[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'pipo.py')

function buildPayload(pools: Pools, factory: FactoryEnv, config: SchedulingConfig): PythonPipoPayload {
  const orders = pools.getSnapshot('pipo').map((record) => ({
    orderId: record.oid,
    dueDate: record.meta?.dueDate ? Number(record.meta.dueDate) : undefined,
    operations: [
      ...(record.demOps ?? []),
      ...(record.monOps ?? []),
    ].map((op) => ({
      ...op,
      orderId: record.oid,
    })),
  }))

  return {
    startTime: factory.simTime,
    orders,
    config: {
      weights: config.meta?.pipoWeights ?? {
        makespan: 0.4,
        tardiness: 0.4,
        setupPenalty: 0.2,
      },
    },
  }
}

export async function runPIPoFineTermMOAHS(
  pools: Pools,
  factory: FactoryEnv,
  config: SchedulingConfig
): Promise<PythonPipoResult & { _scriptExecution?: { scriptPath: string; startTime: number; endTime: number; status: string } }> {
  const payload = buildPayload(pools, factory, config)

  const scriptPath = config.meta?.pipoScriptPath
    ? String(config.meta.pipoScriptPath)
    : DEFAULT_SCRIPT

  const startTime = Date.now()
  console.log(`[scheduling][pipo] 🐍 Running Python script: ${scriptPath}`)
  console.log(`[scheduling][pipo] ⏰ Start time: ${new Date(startTime).toISOString()}`)
  console.log(`[scheduling][pipo] Payload:`, JSON.stringify(payload, null, 2))

  try {
    const result = await runPythonOperator<PythonPipoPayload, PythonPipoResult>({
      script: scriptPath,
      payload,
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[scheduling][pipo] ✅ Python script completed successfully`)
    console.log(`[scheduling][pipo] ⏱️  Duration: ${duration}ms`)
    console.log(`[scheduling][pipo] Result:`, JSON.stringify(result, null, 2))

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

    console.error(`[scheduling][pipo] ❌ Python script failed`)
    console.error(`[scheduling][pipo] ⏱️  Duration: ${duration}ms`)
    console.error(`[scheduling][pipo] Error:`, error)

    throw error
  }
}
