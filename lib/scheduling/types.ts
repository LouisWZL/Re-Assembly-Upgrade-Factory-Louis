import type { Prisma } from '@prisma/client'

export type PoolName = 'pap' | 'pip' | 'pipo'

export interface TriangularFuzzyNumber {
  a: number
  m: number
  b: number
}

export interface OperationBlock {
  id: string
  stationId: string
  stationName?: string
  orderId?: string
  expectedDuration: number
  startTime?: number
  endTime?: number
  resources?: string[]
}

export interface PoolRecord {
  oid: string
  etaDeliveryPred?: number
  stateTfn?: Record<string, TriangularFuzzyNumber>
  routeCandidates?: string[]
  selectedRouteId?: string | null
  demOps?: OperationBlock[]
  monOps?: OperationBlock[]
  priorityScore?: number
  batchId?: string | null
  planWindow?: { start: number; end: number }
  fineStartTimes?: Record<string, number>
  fineEndTimes?: Record<string, number>
  meta?: Record<string, unknown>
  processSequences?: unknown
}

export interface PoolsSnapshot {
  pap: PoolRecord[]
  pip: PoolRecord[]
  pipo: PoolRecord[]
  generatedAt: number
  version: number
}

export interface SchedulingConfig {
  mode: 'FCFS' | 'INTEGRATED'
  seed?: string | number
  schedIntervalMinutes: number
  batchPolicy?: {
    qMin: number
    qMax: number
    horizonMinutes: number
  }
  tardinessWeight?: number
  varianceWeight?: number
  cvarAlpha?: number
  storageKey?: string
  meta?: SchedulingConfigMeta
}

export interface SchedulingConfigMeta {
  papScriptPath?: string
  pipScriptPath?: string
  pipoScriptPath?: string
  poissonLambda?: number
  pipoWeights?: Record<string, number>
  [key: string]: unknown
}

export interface FactoryEnv {
  factoryId: string
  simTime: number
  config: SchedulingConfig
  pools: PoolsLike
}

export interface Batch {
  id: string
  orderIds: string[]
  releaseAt: number
  score?: number
  meta?: Record<string, unknown>
}

export interface EtaPrediction {
  orderId: string
  eta: number
  lower?: number
  upper?: number
  confidence?: number
}

export interface PriorityEntry {
  orderId: string
  priority: number
  dueDate?: number
  expectedCompletion?: number
}

export interface RoutePlan {
  orderId: string
  routeId: string
  operations: OperationBlock[]
  expectedStart: number
  expectedEnd: number
  meta?: Record<string, unknown>
}

export interface Plan {
  id: string
  objectiveValues: Record<string, number>
  operations: OperationBlock[]
  meta?: Record<string, unknown>
}

export interface PoolsLike {
  upsertPAP(record: PoolRecord): void
  moveToPIP(orderId: string, updates?: Partial<PoolRecord>): void
  moveToPIPo(orderId: string, updates?: Partial<PoolRecord>): void
  getSnapshot(pool: PoolName): PoolRecord[]
}

export interface SchedulingLogEntryInput {
  factoryId: string
  stage: 'PAP' | 'PIP' | 'PIPO'
  mode: string
  details: Prisma.InputJsonValue
}

/**
 * Factory capacity information passed to Python scheduling scripts
 */
export interface FactoryCapacity {
  montageStationen: number       // Number of assembly stations
  demontageStationen: number      // Number of disassembly stations (default: 5 if not stored)
  flexibel: boolean               // Whether stations are flexible (default: false if not stored)
  defaultDemontagezeit: number    // Default disassembly time in minutes
  defaultMontagezeit: number      // Default assembly time in minutes
  schichtmodell: string           // Shift model (e.g., "EINSCHICHT", "ZWEISCHICHT")
  kapazitaet: number              // Overall factory capacity
}
