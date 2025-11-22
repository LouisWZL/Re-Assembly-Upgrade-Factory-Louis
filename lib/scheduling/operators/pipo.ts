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
}

interface PythonPipoPayload {
  startTime: number
  orders: PythonPipoOrder[]
  config: Record<string, unknown> & {
    factoryCapacity?: FactoryCapacity
  }
}

interface PythonPipoResult {
  paretoSet: Plan[]
  selectedPlanId: string | null
  releasedOps: OperationBlock[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'Ansatz_Becker_Feinterminierung.py')

function buildPayload(pools: Pools, factoryEnv: FactoryEnv, config: SchedulingConfig, factory: ReassemblyFactory): PythonPipoPayload {
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
        demontageStationen: 5, // Not yet stored in DB - using default
        flexibel: false, // Not yet stored in DB - using default
        defaultDemontagezeit: factory.defaultDemontagezeit,
        defaultMontagezeit: factory.defaultMontagezeit,
        schichtmodell: factory.schichtmodell,
        kapazitaet: factory.kapazität,
      },
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
