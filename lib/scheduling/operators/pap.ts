import path from 'path'
import type { Pools } from '../pools'
import type { Batch, EtaPrediction, SchedulingConfig } from '../types'
import { runPythonOperator } from '../python-runner'

interface PythonPapOrder {
  orderId: string
  createdAt?: number
  dueDate?: number
  processTimeDem?: number
  processTimeMon?: number
  priorityHint?: number
}

interface PythonPapPayload {
  now: number
  orders: PythonPapOrder[]
  config: Record<string, unknown>
}

interface PythonPapResult {
  batches: Batch[]
  etaList: EtaPrediction[]
  debug?: Array<Record<string, unknown>>
}

const DEFAULT_SCRIPT = path.join('python', 'terminierung', 'pap.py')

function buildPayload(pools: Pools, now: number, config: SchedulingConfig): PythonPapPayload {
  const records = pools.getSnapshot('pap')
  const orders: PythonPapOrder[] = records.map((record) => ({
    orderId: record.oid,
    createdAt: record.meta?.createdAt ? Number(record.meta.createdAt) : undefined,
    dueDate: record.meta?.dueDate ? Number(record.meta.dueDate) : undefined,
    processTimeDem: record.demOps?.reduce((sum, op) => sum + op.expectedDuration, 0) ?? 0,
    processTimeMon: record.monOps?.reduce((sum, op) => sum + op.expectedDuration, 0) ?? 0,
    priorityHint: record.priorityScore,
  }))

  return {
    now,
    orders,
    config: {
      qMin: config.batchPolicy?.qMin ?? 3,
      qMax: config.batchPolicy?.qMax ?? 7,
      intervalMinutes: config.schedIntervalMinutes,
      lambda: config.meta?.poissonLambda ?? 4,
    },
  }
}

export async function runPAPForecastAndBatch(
  pools: Pools,
  now: number,
  config: SchedulingConfig
): Promise<PythonPapResult & { _scriptExecution?: { scriptPath: string; startTime: number; endTime: number; status: string } }> {
  const payload = buildPayload(pools, now, config)

  const scriptPath = config.meta?.papScriptPath
    ? String(config.meta.papScriptPath)
    : DEFAULT_SCRIPT

  const startTime = Date.now()
  console.log(`[scheduling][pap] 🐍 Running Python script: ${scriptPath}`)
  console.log(`[scheduling][pap] ⏰ Start time: ${new Date(startTime).toISOString()}`)
  console.log(`[scheduling][pap] Payload:`, JSON.stringify(payload, null, 2))

  try {
    const result = await runPythonOperator<PythonPapPayload, PythonPapResult>({
      script: scriptPath,
      payload,
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[scheduling][pap] ✅ Python script completed successfully`)
    console.log(`[scheduling][pap] ⏱️  Duration: ${duration}ms`)
    console.log(`[scheduling][pap] Result:`, JSON.stringify(result, null, 2))

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

    console.error(`[scheduling][pap] ❌ Python script failed`)
    console.error(`[scheduling][pap] ⏱️  Duration: ${duration}ms`)
    console.error(`[scheduling][pap] Error:`, error)

    throw error
  }
}
