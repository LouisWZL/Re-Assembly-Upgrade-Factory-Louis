// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFactory } from '@/contexts/factory-context';
import { useSimulation } from '@/contexts/simulation-context';
import { useRouter } from 'next/navigation';
import { getAdvancedSimulationData } from '@/app/actions/advanced-simulation.actions';
import { getAllAlgorithmBundles, setActiveAlgorithmBundle } from '@/app/actions/algorithm-bundle.actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Pause, Square, RefreshCw, Settings, Plus, Clock, Trash2, BarChart3, ArrowLeft, Info, ChevronDown, ChevronUp, Database } from 'lucide-react';
import { toast } from 'sonner';
import {
  ReactFlow,
  Node, 
  Edge, 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  Position
} from '@xyflow/react';
import { PhaseNode } from './nodes/PhaseNode'
import { QueueCircleNode } from './QueueCircleNode'
import '@xyflow/react/dist/style.css';
import { getSimulationBuffer } from '@/lib/simulation-buffer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface SimulationStation {
  id: string;
  name: string;
  type: 'MAIN' | 'SUB';
  phase?: string;
  processingTime: number; // in minutes
  stochasticVariation: number; // percentage (0-1)
  currentOrder: SimulationOrder | null; // Only one order at a time
  waitingQueue: SimulationOrder[]; // Orders waiting for this station
  baugruppentypId?: string;
  parent?: string;
  capacity: number; // Maximum 1 for realistic simulation
}

interface SimulationOrder {
  id: string;
  kundeId: string;
  kundeName: string;
  produktvariante: string;
  currentStation: string;
  progress: number;
  startTime: Date;
  stationStartTime?: Date;
  processSequence: string[];
  requiredBaugruppentypen: string[];
  requiredUpgrades: { [baugruppentypId: string]: 'PFLICHT' | 'WUNSCH' };
  stationDurations: { [stationId: string]: { expected: number; actual?: number; startTime?: Date; completed?: boolean; waitingTime?: number } };
  isWaiting: boolean;
  completedAt?: Date;
  processSequences?: any; // JSON data from database containing all possible sequences
  selectedSequence?: any; // The randomly selected sequence for this order
  currentSequenceStep?: number; // Current step index in the selected sequence
  plannedDeliverySimMinute?: number | null;
  finalCompletionSimMinute?: number | null;
}

// Scheduling algorithms enum and interface
enum SchedulingAlgorithm {
  FIFO = 'FIFO',
  SJF = 'SJF', // Shortest Job First
  LJF = 'LJF', // Longest Job First  
  PRIORITY = 'PRIORITY',
  EDD = 'EDD', // Earliest Due Date
  RANDOM = 'RANDOM'
}

interface SchedulingStrategy {
  name: string;
  description: string;
  selectNext: (waitingQueue: SimulationOrder[], currentTime: Date) => SimulationOrder | null;
}

import { AdvancedKPIDashboard } from './AdvancedKPIDashboard';

// Helper function to calculate process times from baugruppen
function calculateProcessTimesFromBaugruppen(order: any, factory: any) {
  const baugruppen = order.baugruppenInstances || []
  console.log(`🔍 [calculateProcessTimesFromBaugruppen] Order ${order.id?.slice(-4)}: ${baugruppen.length} Baugruppen-Instanzen`)

  if (baugruppen.length === 0) {
    console.log(`⚠️ [calculateProcessTimesFromBaugruppen] No Baugruppen, using factory defaults: dem=${factory.defaultDemontagezeit}, mon=${factory.defaultMontagezeit}`)
    return {
      demontage: factory.defaultDemontagezeit || 30,
      montage: factory.defaultMontagezeit || 45
    }
  }

  let totalDemontage = 0
  let totalMontage = 0
  let countDem = 0
  let countMon = 0

  baugruppen.forEach((bg: any, idx: number) => {
    const demZeit = bg.baugruppe?.demontagezeit
    const monZeit = bg.baugruppe?.montagezeit
    const bgName = bg.baugruppe?.bezeichnung || 'Unknown'

    console.log(`  [${idx}] ${bgName}: demontagezeit=${demZeit}, montagezeit=${monZeit}`)

    if (demZeit != null && demZeit > 0) {
      totalDemontage += demZeit
      countDem++
    }
    if (monZeit != null && monZeit > 0) {
      totalMontage += monZeit
      countMon++
    }
  })

  const finalDem = countDem > 0 ? Math.round(totalDemontage / countDem) : (factory.defaultDemontagezeit || 30)
  const finalMon = countMon > 0 ? Math.round(totalMontage / countMon) : (factory.defaultMontagezeit || 45)

  console.log(`✅ [calculateProcessTimesFromBaugruppen] Final: dem=${finalDem} (${countDem} values, fallback=${factory.defaultDemontagezeit}), mon=${finalMon} (${countMon} values, fallback=${factory.defaultMontagezeit})`)

  return {
    demontage: finalDem,
    montage: finalMon
  }
}

type QueueStage = 'preAcceptance' | 'preInspection' | 'postInspection'
type SchedulingStageKey = 'pap' | 'pip' | 'pipo'

type SchedulingStageStats = {
  runs: number
  lastRun: number | null
  lastReleased: number
  totalReleased: number
  lastReorder: number
  totalReorder: number
  lastQueueSize: number
  lastBatches: number
  lastPythonDiff: number
  totalPythonDiff: number
}

type SchedulingStats = Record<SchedulingStageKey, SchedulingStageStats>

type SchedulingSummaryPayload = {
  stage: QueueStage
  queueSize?: number
  releasedCount?: number
  reorderCount?: number
  batchCount?: number
  releaseListCount?: number
  simMinute?: number
  timestamp?: number
  orderSequence?: string[]
  pythonReleaseList?: string[]
  pythonEtaList?: Array<{ orderId: string; eta: number }>
  pythonPriorities?: Array<{ orderId: string; priority: number }>
  pythonBatches?: Array<{ id: string; size: number }>
  pythonAssignments?: Array<{ orderId: string; eta: number | null; priorityScore: number | null }>
  pythonDebug?: Array<Record<string, unknown>>
  pythonDiffCount?: number
}

const createInitialSchedulingStats = (): SchedulingStats => ({
  pap: {
    runs: 0,
    lastRun: null,
    lastReleased: 0,
    totalReleased: 0,
    lastReorder: 0,
    totalReorder: 0,
    lastQueueSize: 0,
    lastBatches: 0,
    lastPythonDiff: 0,
    totalPythonDiff: 0,
  },
  pip: {
    runs: 0,
    lastRun: null,
    lastReleased: 0,
    totalReleased: 0,
    lastReorder: 0,
    totalReorder: 0,
    lastQueueSize: 0,
    lastBatches: 0,
    lastPythonDiff: 0,
    totalPythonDiff: 0,
  },
  pipo: {
    runs: 0,
    lastRun: null,
    lastReleased: 0,
    totalReleased: 0,
    lastReorder: 0,
    totalReorder: 0,
    lastQueueSize: 0,
    lastBatches: 0,
    lastPythonDiff: 0,
    totalPythonDiff: 0,
  },
})

const schedulingStageLabels: Record<SchedulingStageKey, string> = {
  pap: 'Pre-Acceptance (PAP)',
  pip: 'Pre-Inspection (PIP)',
  pipo: 'Post-Inspection (PIPo)',
}

type SchedulingHistory = Record<SchedulingStageKey, SchedulingSummaryPayload[]>
const createInitialSchedulingHistory = (): SchedulingHistory => ({
  pap: [],
  pip: [],
  pipo: [],
})

export function RealDataFactorySimulation() {
  const { activeFactory } = useFactory();
  const { 
    addCompletedOrder, 
    activeOrders,
    setActiveOrders, 
    stations,
    setStations: setContextStations, 
    setSimulationStartTime,
    simulationStartTime,
    isRunning,
    setIsRunning,
    speed,
    setSpeed,
    simulationTime,
    setSimulationTime,
    completedOrders,
    waitingOrders,
    setWaitingOrders,
    currentSchedulingAlgorithm,
    setCurrentSchedulingAlgorithm
  } = useSimulation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const lastRealTimeRef = useRef(Date.now());
  const simulationStartTimeRef = useRef<Date | null>(simulationStartTime);
  const simulationTimeRef = useRef<Date>(simulationTime);

  // Keep refs in sync with state
  useEffect(() => {
    simulationStartTimeRef.current = simulationStartTime;
  }, [simulationStartTime]);

  useEffect(() => {
    simulationTimeRef.current = simulationTime;
  }, [simulationTime]);

  useEffect(() => {
    setSchedulingStats(createInitialSchedulingStats())
    setSchedulingHistory(createInitialSchedulingHistory())
    setDeliveryMetrics(null)
    setDeliveryMetricsError(null)
    // Set to 0 to load ALL orders on first load, not just recent ones
    deliveryMetricsSinceRef.current = 0
  }, [activeFactory?.id])
  
  // Local simulation data
  const [localStations, setLocalStations] = useState<SimulationStation[]>([]);
  const [factoryData, setFactoryData] = useState<any>(null);

  // Simulation buffer for batched DB writes
  const bufferRef = useRef(getSimulationBuffer());

  // Phase capacity & flexibility controls
  const [demSlots, setDemSlots] = useState<number>(4)
  const [monSlots, setMonSlots] = useState<number>(6)
  const [demFlexSharePct, setDemFlexSharePct] = useState<number>(50)
  const [monFlexSharePct, setMonFlexSharePct] = useState<number>(50)
  const [setupTimeHours, setSetupTimeHours] = useState<number>(0)
  const [aggregateView] = useState<boolean>(true)
  const [initDebugLogs, setInitDebugLogs] = useState<string[]>([])
  const [initError, setInitError] = useState<string | null>(null)
  const [dispatcherLogs, setDispatcherLogs] = useState<string[]>([])
  const dispatcherLogsRef = useRef<string[]>([])
  const [pickSlotDebugLogs, setPickSlotDebugLogs] = useState<string[]>([])
  const pickSlotDebugLogsRef = useRef<string[]>([])
  const [deliveryMetrics, setDeliveryMetrics] = useState<any>(null)
  const [deliveryMetricsError, setDeliveryMetricsError] = useState<string | null>(null)
  const deliveryMetricsSinceRef = useRef<number>(Date.now())

  // Gantt chart hover states
  const [hoveredOrderRow, setHoveredOrderRow] = useState<string | null>(null)
  const [hoveredDemSlot, setHoveredDemSlot] = useState<number | null>(null)
  const [hoveredMonSlot, setHoveredMonSlot] = useState<number | null>(null)

  // Collapsible sections state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)

  // Terminierung modal state
  const [terminierungModalOpen, setTerminierungModalOpen] = useState(false)
  const [selectedBundleId, setSelectedBundleId] = useState<string>('')
  const [algorithmBundles, setAlgorithmBundles] = useState<any[]>([])
  const [loadingBundles, setLoadingBundles] = useState(false)

  // Phase slot state (approximation of rigid/flexible slots)
  type SlotState = { flex: boolean; specialization?: string | null; currentType?: string | null; idleSince?: number | null; busy?: boolean }
  const demSlotsRef = useRef<SlotState[]>([])
  const monSlotsRef = useRef<SlotState[]>([])
  // Map orderId+phase -> slot index
  const orderPhaseSlotMapRef = useRef<Record<string, number>>({})

  const normalizeOperationKey = (value?: string | null) => {
  if (!value) return ''
  const str = value
    .toString()
    .replace(/^demontage[-\s]+/i, '')
    .replace(/^montage[-\s]+/i, '')
    .replace(/^bgt-(?:ps|au|vw)-/i, '')
    .replace(/^bgt-/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (str.includes(':')) {
    const parts = str.split(':')
    return parts[parts.length - 1].trim()
  }
  if (str.includes('-')) {
    const parts = str.split('-')
    return parts[parts.length - 1].trim()
  }
  return str
}

  // Helper: minutes since simulation start
  const getSimMinutes = useCallback(() => {
    if (!simulationStartTimeRef.current) return 0
    const diffMs = simulationTimeRef.current.getTime() - simulationStartTimeRef.current.getTime()
    return Math.max(0, Math.floor(diffMs / 60000))
  }, [])

  // Initialize slots based on current used types
  const initPhaseSlots = useCallback((usedDemTypes: string[], usedMonTypes: string[]) => {
    const makeSlots = (total: number, flexSharePct: number, usedTypes: string[]) => {
      const flexCount = Math.max(0, Math.round((flexSharePct / 100) * total))
      const rigidCount = Math.max(0, total - flexCount)
      // Determine rigid specializations from top types
      const counts: Record<string, number> = {}
      usedTypes.forEach(t => { counts[t] = (counts[t] || 0) + 1 })
      const topTypes = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([t])=>t)
      const slots: SlotState[] = []
      for (let i=0;i<rigidCount;i++) {
        const specRaw = topTypes.length ? topTypes[i % topTypes.length] : (usedTypes[0] || null)
        const spec = specRaw ? normalizeOperationKey(specRaw) : null
        slots.push({ flex: false, specialization: spec, currentType: null, idleSince: 0, busy: false })
      }
      for (let i=0;i<flexCount;i++) {
        slots.push({ flex: true, specialization: null, currentType: null, idleSince: null, busy: false })
      }
      return slots
    }
    demSlotsRef.current = makeSlots(demSlots, demFlexSharePct, usedDemTypes)
    monSlotsRef.current = makeSlots(monSlots, monFlexSharePct, usedMonTypes)
    orderPhaseSlotMapRef.current = {}
  }, [demSlots, monSlots, demFlexSharePct, monFlexSharePct])

  // Pick a slot for a given phase and op type (returns slot index or -1)
  const pickSlot = useCallback((phase: 'DEMONTAGE'|'REASSEMBLY', opType: string) => {
    const slots = phase === 'DEMONTAGE' ? demSlotsRef.current : monSlotsRef.current
    const nowMin = getSimMinutes()
    const setupMinutes = Math.max(0, Math.round(setupTimeHours * 60))
    const desiredKey = normalizeOperationKey(opType)

    pickSlotDebugLogsRef.current = []
    pickSlotDebugLogsRef.current.push(`🎯 pickSlot: phase=${phase} opType=${opType} desiredKey=${desiredKey} setupMin=${setupMinutes} nowMin=${nowMin}`)

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      pickSlotDebugLogsRef.current.push(`  S${i}: busy=${slot.busy} flex=${slot.flex} spec=${slot.specialization} currType=${slot.currentType} idleSince=${slot.idleSince}`)

      if (slot.busy) {
        pickSlotDebugLogsRef.current.push(`    ❌ skip: busy`)
        continue
      }

      const slotSpecKey = normalizeOperationKey(slot.specialization)
      const slotCurrentKey = normalizeOperationKey(slot.currentType)
      pickSlotDebugLogsRef.current.push(`    specKey=${slotSpecKey} currentKey=${slotCurrentKey}`)

      if (!slot.flex) {
        pickSlotDebugLogsRef.current.push(`    rigid slot`)
        if (desiredKey && slotSpecKey !== desiredKey) {
          pickSlotDebugLogsRef.current.push(`    ❌ skip: rigid mismatch (${slotSpecKey} !== ${desiredKey})`)
          continue
        }
        pickSlotDebugLogsRef.current.push(`    ✅ MATCH rigid slot!`)
        slot.busy = true
        slot.currentType = opType
        slot.idleSince = null
        return i
      }

      const sameOrUnassigned = !slot.currentType || slotCurrentKey === desiredKey || !desiredKey
      pickSlotDebugLogsRef.current.push(`    flex slot: sameOrUnassigned=${sameOrUnassigned} (!currType=${!slot.currentType} || match=${slotCurrentKey === desiredKey} || !desired=${!desiredKey})`)
      if (sameOrUnassigned) {
        pickSlotDebugLogsRef.current.push(`    ✅ MATCH flex slot (same/unassigned)!`)
        slot.busy = true
        slot.currentType = opType
        slot.idleSince = null
        return i
      }

      const idleSince = slot.idleSince == null ? nowMin : slot.idleSince
      const idleDuration = Math.max(0, nowMin - idleSince)
      pickSlotDebugLogsRef.current.push(`    idleSince=${idleSince} idleDuration=${idleDuration} setupMinutes=${setupMinutes}`)

      if (idleDuration >= setupMinutes) {
        pickSlotDebugLogsRef.current.push(`    ✅ MATCH flex slot (setup elapsed)!`)
        slot.busy = true
        slot.currentType = opType
        slot.idleSince = null
        return i
      }
      pickSlotDebugLogsRef.current.push(`    ❌ skip: setup not elapsed (${idleDuration} < ${setupMinutes})`)
    }

    pickSlotDebugLogsRef.current.push(`  ❌ NO SLOT FOUND`)
    return -1
  }, [getSimMinutes, setupTimeHours])

  const releaseSlot = useCallback((phase: 'DEMONTAGE'|'REASSEMBLY', slotIdx: number) => {
    const slots = phase === 'DEMONTAGE' ? demSlotsRef.current : monSlotsRef.current
    const s = slots[slotIdx]
    if (!s) return
    s.busy = false
    s.idleSince = getSimMinutes()
  }, [getSimMinutes])
  
  
  // View state for simulation vs data dashboard
  const [currentView, setCurrentView] = useState<'simulation' | 'kpi'>('simulation');
  
  // No local scheduling configuration - using context
  
  
  // Scheduling strategies implementation
  const schedulingStrategies: { [key in SchedulingAlgorithm]: SchedulingStrategy } = {
    [SchedulingAlgorithm.FIFO]: {
      name: 'First In First Out',
      description: 'Ordnung nach Ankunftsreihenfolge',
      selectNext: (waitingQueue: SimulationOrder[]) => waitingQueue.length > 0 ? waitingQueue[0] : null
    },
    [SchedulingAlgorithm.SJF]: {
      name: 'Shortest Job First',
      description: 'Kürzeste Bearbeitungszeit zuerst',
      selectNext: (waitingQueue: SimulationOrder[], currentTime: Date) => {
        if (waitingQueue.length === 0) return null;
        return waitingQueue.reduce((shortest, order) => {
          const shortestTime = Object.values(shortest.stationDurations).reduce((sum, d) => sum + d.expected, 0);
          const orderTime = Object.values(order.stationDurations).reduce((sum, d) => sum + d.expected, 0);
          return orderTime < shortestTime ? order : shortest;
        });
      }
    },
    [SchedulingAlgorithm.LJF]: {
      name: 'Longest Job First',
      description: 'Längste Bearbeitungszeit zuerst',
      selectNext: (waitingQueue: SimulationOrder[], currentTime: Date) => {
        if (waitingQueue.length === 0) return null;
        return waitingQueue.reduce((longest, order) => {
          const longestTime = Object.values(longest.stationDurations).reduce((sum, d) => sum + d.expected, 0);
          const orderTime = Object.values(order.stationDurations).reduce((sum, d) => sum + d.expected, 0);
          return orderTime > longestTime ? order : longest;
        });
      }
    },
    [SchedulingAlgorithm.PRIORITY]: {
      name: 'Priority Scheduling',
      description: 'Priorität basierend auf Kundentyp',
      selectNext: (waitingQueue: SimulationOrder[]) => {
        if (waitingQueue.length === 0) return null;
        // Simple priority based on customer name (Premium customers first)
        return waitingQueue.find(order => order.kundeName.toLowerCase().includes('premium')) || waitingQueue[0];
      }
    },
    [SchedulingAlgorithm.EDD]: {
      name: 'Earliest Due Date',
      description: 'Früheste Liefertermin zuerst',
      selectNext: (waitingQueue: SimulationOrder[]) => {
        if (waitingQueue.length === 0) return null;
        return waitingQueue.reduce((earliest, order) => 
          order.startTime < earliest.startTime ? order : earliest
        );
      }
    },
    [SchedulingAlgorithm.RANDOM]: {
      name: 'Random Selection',
      description: 'Zufällige Auswahl aus Warteschlange',
      selectNext: (waitingQueue: SimulationOrder[]) => {
        if (waitingQueue.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * waitingQueue.length);
        return waitingQueue[randomIndex];
      }
    }
  };
  
  // Flow diagram nodes and edges
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Custom node types for React Flow
  const nodeTypes = useMemo(() => ({
    phaseNode: PhaseNode,
    queueCircle: QueueCircleNode
  }), []);

  // Debug info toggle
  const [showDebugInfo, setShowDebugInfo] = useState(true);

  // Station configuration dialog
  const [selectedStation, setSelectedStation] = useState<SimulationStation | null>(null);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [tempProcessingTime, setTempProcessingTime] = useState(0);

  // Phase variation dialog (for Demontage/Montage)
  const [selectedPhase, setSelectedPhase] = useState<'demontage' | 'montage' | null>(null);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [tempPhaseVariation, setTempPhaseVariation] = useState(0.3);

  // Inspection settings
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [reassemblyPercentage, setReassemblyPercentage] = useState(25); // Default 25% need reassembly

  // Local event log for Gantt (START/END of sub-ops)
  const simEventsRef = useRef<Array<{ t:number; order_id:string; activity:string; slot?: number | null }>>([])
  const pushEvent = useCallback((activity: string, orderId: string, slot?: number | null) => {
    simEventsRef.current.push({ t: getSimMinutes(), order_id: orderId, activity, slot: (slot ?? null) })
  }, [getSimMinutes])

  // Main phase active trackers to enforce capacity=1
  const mainActiveRef = useRef<{ [stationId: string]: { orderId: string; remaining: number; total: number } | null }>({})

  // Gantt refresh gating: re-render every 10 minutes of simulation time
  const [ganttRefreshKey, setGanttRefreshKey] = useState(0)
  const lastGanttBucketRef = useRef<number>(-1)
  const [debugRefreshKey, setDebugRefreshKey] = useState(0)
  const [queueDebugInfo, setQueueDebugInfo] = useState<{
    preAcceptanceCount: number
    preInspectionCount: number
    postInspectionCount: number
    preAcceptanceReady: number
    preInspectionReady: number
    postInspectionReady: number
    lastCheck: number
    config: any
    lastRelease?: {
      queue: string
      count: number
      simTime: number
    }
    scheduling?: SchedulingStats
    schedulingHistory?: SchedulingHistory
  } | null>(null)
  const [schedulingStats, setSchedulingStats] = useState<SchedulingStats>(() => createInitialSchedulingStats())
  const [schedulingHistory, setSchedulingHistory] = useState<SchedulingHistory>(
    () => createInitialSchedulingHistory()
  )
  useEffect(() => {
    setQueueDebugInfo(prev => (prev ? { ...prev, scheduling: schedulingStats } : prev))
  }, [schedulingStats])
  useEffect(() => {
    setQueueDebugInfo(prev => (prev ? { ...prev, schedulingHistory } : prev))
  }, [schedulingHistory])
  useEffect(() => {
    const min = getSimMinutes()
    const bucket = Math.floor(min / 10)
    if (bucket !== lastGanttBucketRef.current) {
      lastGanttBucketRef.current = bucket
      setGanttRefreshKey(k => k + 1)
    }
    // Refresh debug panel every second (in real time)
    const debugInterval = setInterval(() => {
      if (isRunning) {
        setDebugRefreshKey(k => k + 1)
      }
    }, 1000)
    return () => clearInterval(debugInterval)
  }, [simulationTime, getSimMinutes, isRunning])

  // Main phase queues and DEM ready gating
  const mainQueuesRef = useRef<{ acceptance: string[]; inspection: string[]; qualityShipping: string[] }>({ acceptance: [], inspection: [], qualityShipping: [] })
  const demReadySetRef = useRef<Set<string>>(new Set())

  // Keep a ref mirror of activeOrders to avoid stale closures inside tight loops
  const activeOrdersRef = useRef(activeOrders)
  useEffect(() => { activeOrdersRef.current = activeOrders }, [activeOrders])

  // Manage simulation buffer lifecycle
  useEffect(() => {
    if (isRunning) {
      console.log('[RealDataFactorySimulation] Starting simulation buffer');
      bufferRef.current.start();
    } else {
      console.log('[RealDataFactorySimulation] Stopping simulation buffer');
      bufferRef.current.stop();
    }
  }, [isRunning]);

  // Cleanup buffer on unmount
  useEffect(() => {
    return () => {
      console.log('[RealDataFactorySimulation] Component unmounting, stopping buffer');
      bufferRef.current.stop();
    };
  }, []);

  // FCFS dispatcher data structures (aggregate mode)
  type OpItem = { label: string; duration: number; display?: string; typeKey?: string }
  type Bundle = { orderId: string; ops: OpItem[]; locked?: boolean }
  const demQueueRef = useRef<Bundle[]>([])
  const monQueueRef = useRef<Bundle[]>([])
  const demActivesRef = useRef<Array<{ orderId: string; label: string; slotIdx: number; remaining: number; total: number }>>([])
  const monActivesRef = useRef<Array<{ orderId: string; label: string; slotIdx: number; remaining: number; total: number }>>([])
  const monBundlesMapRef = useRef<Record<string, OpItem[]>>({})
  const simulationOrdersRef = useRef<SimulationOrder[]>([])

  // Load factory data
  useEffect(() => {
    if (activeFactory) {
      loadSimulationData();
      loadAlgorithmBundles();
    }
  }, [activeFactory]);

  // Load algorithm bundles
  const loadAlgorithmBundles = async () => {
    if (!activeFactory) return;
    setLoadingBundles(true);
    try {
      const result = await getAllAlgorithmBundles(activeFactory.id);
      if (result.success && result.data) {
        setAlgorithmBundles(result.data);
        // Set the active bundle as selected
        const activeBundle = result.data.find((b: any) => b.isActive);
        if (activeBundle) {
          setSelectedBundleId(activeBundle.id);
        }
      }
    } catch (error) {
      console.error('Failed to load algorithm bundles:', error);
    } finally {
      setLoadingBundles(false);
    }
  };

  // Scheduling algorithms run server-side during queue release events (PAP/PIP/PIPo)

  const loadSimulationData = async () => {
    if (!activeFactory) return;
    
    setLoading(true);
    try {
      deliveryMetricsSinceRef.current = Date.now();
      setDeliveryMetrics(null);
      setDeliveryMetricsError(null);

      const result = await getAdvancedSimulationData(activeFactory.id);
      
      if (result.success && result.data) {
        setFactoryData(result.data);
        await refreshDeliveryMetrics();
        
        // Initialize stations with stochastic variations and capacity limits
        // Stochastic Variation = Schwankung der Bearbeitungszeiten (z.B. 0.3 = ±30%)
        // - Auftragsannahme: ±20%
        // - Inspektion: ±30%
        // - Demontage: ±30%
        // - Montage: ±25%
        // - Quality-Shipping: ±30%
        const mainStations: SimulationStation[] = [
          { id: 'order-acceptance', name: 'Auftragsannahme', type: 'MAIN', phase: 'AUFTRAGSANNAHME', processingTime: 5, stochasticVariation: 0.2, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'inspection', name: 'Inspektion', type: 'MAIN', phase: 'INSPEKTION', processingTime: 15, stochasticVariation: 0.3, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'demontage', name: 'Demontage', type: 'MAIN', phase: 'DEMONTAGE', processingTime: 0, stochasticVariation: 0.25, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'reassembly', name: 'Re-Assembly', type: 'MAIN', phase: 'REASSEMBLY', processingTime: 0, stochasticVariation: 0.25, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'quality-shipping', name: 'Qualitätsprüfung und Versand', type: 'MAIN', phase: 'QUALITAETSPRUEFUNG_VERSAND', processingTime: 30, stochasticVariation: 0.3, currentOrder: null, waitingQueue: [], capacity: 1 }
        ];
        
        // Filter Baugruppentypen to only include those that are actually used in the process graph
        const getUsedBaugruppentypen = () => {
          if (!result.data.processSequences || result.data.processSequences.length === 0) {
            // Fallback: use all baugruppentypen if no process data
            return result.data.stations.demontageSubStations;
          }
          
          const processGraphData = result.data.processSequences[0]?.processGraphData;
          if (!processGraphData || !processGraphData.cells) {
            return result.data.stations.demontageSubStations;
          }
          
          // Find all connected nodes in the process graph
          const connectedNodeIds = new Set<string>();
          const links = processGraphData.cells.filter((cell: any) => cell.type === 'standard.Link');
          
          links.forEach((link: any) => {
            if (link.source && link.target) {
              connectedNodeIds.add(link.source.id);
              connectedNodeIds.add(link.target.id);
            }
          });
          
          // Filter nodes to only include those that are connected and have baugruppentyp
          const connectedNodes = processGraphData.cells.filter((cell: any) => 
            cell.type !== 'standard.Link' && 
            connectedNodeIds.has(cell.id) &&
            cell.baugruppentyp
          );
          
          const usedBaugruppentypIds = new Set(
            connectedNodes.map((node: any) => node.baugruppentyp.id)
          );
          
          // Filter the original sub-stations to only include used ones
          return result.data.stations.demontageSubStations.filter((sub: any) => 
            usedBaugruppentypIds.has(sub.baugruppentypId)
          );
        };
        
        const usedBaugruppentypen = getUsedBaugruppentypen();
        console.log('🏭 Factory Settings:');
        console.log('  - Default Demontagezeit:', result.data.factory?.defaultDemontagezeit, 'min');
        console.log('  - Default Montagezeit:', result.data.factory?.defaultMontagezeit, 'min');
        console.log('  - Total Baugruppen in Factory:', result.data.factory?.baugruppen?.length || 0);
        console.log('📋 Used Baugruppentypen:', usedBaugruppentypen.map(b => b.name));

        // Helper function to get average processing times for a Baugruppentyp from factory baugruppen
        const getProcessingTimesForBaugruppentyp = (baugruppentypId: string) => {
          const factoryBaugruppen = result.data.factory?.baugruppen || [];

          // Find all Baugruppen that belong to this Baugruppentyp
          const baugruppenOfType = factoryBaugruppen.filter(
            (bg: any) => bg.baugruppentypId === baugruppentypId
          );

          if (baugruppenOfType.length === 0) {
            console.warn(`⚠️ No Baugruppen found for Baugruppentyp ${baugruppentypId}, using factory defaults`);
            return {
              demontage: result.data.factory?.defaultDemontagezeit || 30,
              montage: result.data.factory?.defaultMontagezeit || 45
            };
          }

          // Calculate average demontage and montage times
          let totalDem = 0, totalMon = 0, countDem = 0, countMon = 0;

          baugruppenOfType.forEach((bg: any) => {
            if (bg.demontagezeit != null && bg.demontagezeit > 0) {
              totalDem += bg.demontagezeit;
              countDem++;
            }
            if (bg.montagezeit != null && bg.montagezeit > 0) {
              totalMon += bg.montagezeit;
              countMon++;
            }
          });

          const avgDem = countDem > 0
            ? Math.round(totalDem / countDem)
            : (result.data.factory?.defaultDemontagezeit || 30);
          const avgMon = countMon > 0
            ? Math.round(totalMon / countMon)
            : (result.data.factory?.defaultMontagezeit || 45);

          console.log(`📊 Baugruppentyp ${baugruppentypId}: ${baugruppenOfType.length} Baugruppen, avgDem=${avgDem}min (${countDem} values), avgMon=${avgMon}min (${countMon} values)`);

          return {
            demontage: avgDem,
            montage: avgMon
          };
        };

        // Add sub-stations for Demontage and Re-Assembly based on actually used Baugruppentypen
        const demontageSubStations: SimulationStation[] = usedBaugruppentypen.map((sub: any) => {
          const times = getProcessingTimesForBaugruppentyp(sub.baugruppentypId);
          return {
            id: `demontage-${sub.id}`,
            name: sub.name,
            type: 'SUB' as const,
            parent: 'demontage',
            baugruppentypId: sub.baugruppentypId,
            processingTime: times.demontage,
            stochasticVariation: 0.3,
            currentOrder: null,
            waitingQueue: [],
            capacity: 1
          };
        });

        const reassemblySubStations: SimulationStation[] = usedBaugruppentypen.map((sub: any) => {
          const times = getProcessingTimesForBaugruppentyp(sub.baugruppentypId);
          return {
            id: `reassembly-${sub.id}`,
            name: sub.name.replace('Demontage', 'Montage'), // Convert Demontage to Montage for reassembly stations
            type: 'SUB' as const,
            parent: 'reassembly',
            baugruppentypId: sub.baugruppentypId,
            processingTime: times.montage,
            stochasticVariation: 0.25,
            currentOrder: null,
            waitingQueue: [],
            capacity: 1
          };
        });
        
        const allStations = [...mainStations, ...demontageSubStations, ...reassemblySubStations];
        setLocalStations(allStations);
        setContextStations(allStations);
        
        // Convert existing active orders to simulation format and assign to Auftragsannahme
        const activeOrders = result.data.orders.filter((order: any) => 
          order.phase !== 'AUFTRAGSABSCHLUSS'
        );
        
        const simulationOrders: SimulationOrder[] = activeOrders.map((order: any) => {
          const requiredBgt = extractRequiredBaugruppentypen(order);
          const requiredUpgrades = extractRequiredUpgrades(order);

          // Use the new function to select a random sequence and convert it
          const { processSequence: processSeq, selectedSequence } = selectRandomSequenceAndConvert(
            order,
            [...mainStations, ...demontageSubStations, ...reassemblySubStations]
          );

          // Calculate individual process times for this order based on its Baugruppen
          const orderProcessTimes = calculateProcessTimesFromBaugruppen(order, result.data.factory);
          console.log(`⏱️ [Order Init] ${order.kunde.vorname} ${order.kunde.nachname}: demontage=${orderProcessTimes.demontage}min, montage=${orderProcessTimes.montage}min`);

          // Pre-initialize stationDurations with order-specific times
          const initialStationDurations: { [stationId: string]: { expected: number; actual?: number; startTime?: Date; completed?: boolean; waitingTime?: number } } = {};

          // Set expected times for all stations in the process sequence
          processSeq.forEach(stationId => {
            const station = [...mainStations, ...demontageSubStations, ...reassemblySubStations].find(s => s.id === stationId);
            let expectedTime = station?.processingTime || 30; // fallback

            // Use order-specific times for demontage/montage stations
            if (station?.type === 'SUB') {
              if (station.phase === 'DEMONTAGE') {
                expectedTime = orderProcessTimes.demontage;
              } else if (station.phase === 'REASSEMBLY') {
                expectedTime = orderProcessTimes.montage;
              }
            }

            initialStationDurations[stationId] = {
              expected: expectedTime,
              completed: false,
              waitingTime: 0
            };
          });

          return {
            id: order.id,
            kundeId: order.kundeId,
            kundeName: `${order.kunde.vorname} ${order.kunde.nachname}`,
            produktvariante: order.produktvariante.bezeichnung,
            currentStation: 'order-acceptance', // All active orders start at Auftragsannahme
            progress: 0,
            startTime: new Date(order.createdAt),
            stationStartTime: new Date(),
            processSequence: processSeq,
            requiredBaugruppentypen: requiredBgt,
            requiredUpgrades: requiredUpgrades,
            stationDurations: initialStationDurations,
            isWaiting: false,
            processSequences: order.processSequences, // Include the JSON data from database
            selectedSequence: selectedSequence, // Store the selected sequence
            currentSequenceStep: 0, // Start at beginning of sequence
            plannedDeliverySimMinute: order.plannedDeliverySimMinute ?? null,
            finalCompletionSimMinute: null,
          };
        });

        // DON'T set active orders yet! They will be activated when released from PreAcceptanceQueue
        // Store simulation orders in a ref for later use
        simulationOrdersRef.current = simulationOrders
        setActiveOrders([]);

        // Don't set simulation start time here - wait for user to press Start
        // setSimulationStartTime(new Date());
        
        // Create flow diagram after state is set
        setTimeout(() => {
          createFlowDiagram(mainStations, demontageSubStations, reassemblySubStations);
        }, 100);

        // Build FCFS queues (aggregate mode)
        try {
          // Initialize phase slots based on used types
          // Use station names instead of IDs for proper matching
          initPhaseSlots(
            demontageSubStations.map(s => normalizeOperationKey(s.name || s.baugruppentypId || '')),
            reassemblySubStations.map(s => normalizeOperationKey(s.name || s.baugruppentypId || ''))
          )
          const makeOps = (steps: string[], which: 'DEM'|'MON'): OpItem[] => {
            const ops: OpItem[] = []
            const crossIdx = steps.indexOf('×')
            const slice = which === 'DEM' ? (crossIdx >= 0 ? steps.slice(0, crossIdx) : steps) : (crossIdx >= 0 ? steps.slice(crossIdx + 1) : [])

            const findStationForStep = (collection: SimulationStation[], step: string) => {
              const normalizedStep = normalizeOperationKey(step)
              return collection.find(station => {
                const candidates = [
                  station.name,
                  station.name?.replace(/^Demontage\s+/i, '').replace(/^Montage\s+/i, ''),
                  station.baugruppentypId,
                  station.id
                ].filter(Boolean) as string[]

                return candidates.some(candidate => {
                  const normalizedCandidate = normalizeOperationKey(candidate)
                  return candidate === step || normalizedCandidate === normalizedStep
                })
              })
            }

            slice.forEach(step => {
              if (!step || step === 'I' || step === 'Q' || step === '×') return

              const station = which === 'DEM'
                ? findStationForStep(demontageSubStations, step)
                : findStationForStep(reassemblySubStations, step)

              const durationFallback = which === 'DEM' ? 30 : 45
              const baseDuration = station?.processingTime ?? durationFallback
              const variation = station?.stochasticVariation ?? 0.3
              // Apply stochastic variation
              const randomFactor = (Math.random() - 0.5) * 2 // -1 to 1
              const variationAmount = baseDuration * variation * randomFactor
              const duration = Math.max(1, Math.round(baseDuration + variationAmount))

              // Use station name for typeKey to match with slot specializations
              const rawTypeKey =
                station?.name ||
                step
              const typeKey = normalizeOperationKey(rawTypeKey)
              const displayLabel = station?.name || step

              ops.push({
                label: displayLabel,
                duration,
                display: displayLabel,
                typeKey
              })
            })

            return ops
          }

          demQueueRef.current = []
          monQueueRef.current = []
          monBundlesMapRef.current = {}

          // IMPORTANT: Release all slots before clearing actives
          demActivesRef.current.forEach(a => {
            releaseSlot('DEMONTAGE', a.slotIdx)
          })
          monActivesRef.current.forEach(a => {
            releaseSlot('REASSEMBLY', a.slotIdx)
          })

          demActivesRef.current = []
          monActivesRef.current = []

          // Clear slot tracking map
          orderPhaseSlotMapRef.current = {}

          const debugLogs: string[] = []
          console.log('=== SIMULATION INIT START ===')
          console.log('demontageSubStations:', demontageSubStations.length)
          console.log('reassemblySubStations:', reassemblySubStations.length)

          simulationOrders.forEach((simOrder: any) => {
            // prefer selectedSequence from processSequences
            let steps: string[] = []
            try {
              const ps = typeof simOrder.processSequences === 'string' ? JSON.parse(simOrder.processSequences) : simOrder.processSequences
              const seqs = ps?.baugruppentypen?.sequences
              if (Array.isArray(seqs) && seqs.length > 0) {
                // RANDOMLY select one sequence instead of always taking the first
                const randomIndex = Math.floor(Math.random() * seqs.length)
                const pick = seqs[randomIndex]
                steps = Array.isArray(pick?.steps) ? pick.steps.map((s:any)=>String(s)) : []
                console.log(`📋 Order ${simOrder.kundeName}: Randomly selected sequence ${randomIndex + 1}/${seqs.length} (${pick.id || 'no-id'}) with steps: ${steps.join(',')}`)
              }
            } catch {}
            if (steps.length === 0 && Array.isArray(simOrder.selectedSequence?.steps)) {
              steps = simOrder.selectedSequence.steps.map((s:any)=>String(s))
            }
            // FALLBACK: If no steps, create a realistic sequence from available stations
            const needsFallback = steps.length === 0 || (steps.length === 2 && steps[0] === 'I' && steps[1] === 'Q')
            if (needsFallback) {
              console.log(`🔧 FALLBACK for ${simOrder.kundeName}: demSubs=${demontageSubStations.length}, monSubs=${reassemblySubStations.length}`)
              // Use actual baugruppen from the stations
              const demSteps = demontageSubStations.slice(0, 3).map(s => s.baugruppentypId || s.name)
              const monSteps = reassemblySubStations.slice(0, 3).map(s => s.baugruppentypId || s.name)
              steps = ['I', ...demSteps, '×', ...monSteps, 'Q']
              console.log(`🔧 Generated steps:`, steps)
            }

            // Ensure all sequences end with 'Q' (Quality-Shipping station)
            if (steps.length > 0 && steps[steps.length - 1] !== 'Q') {
              console.log(`⚠️ Sequence for ${simOrder.kundeName} missing 'Q', adding it: ${steps.join(',')}`)
              steps.push('Q')
            }

            const demOps = makeOps(steps, 'DEM')
            const monOps = makeOps(steps, 'MON')

            // DEBUG: Log details to understand why demOps is empty
            console.log(`📦 Order ${simOrder.id.slice(-4)} (${simOrder.kundeName}):`)
            console.log('  Original steps:', steps)
            console.log('  DemOps:', demOps)
            console.log('  MonOps:', monOps)

            const stepsStr = steps.length > 5 ? `${steps.slice(0,5).join(',')}...` : steps.join(',')
            const demOpsStr = demOps.length > 0 ? demOps.map(o => o.label).join(', ') : 'NONE'
            const fallbackFlag = needsFallback ? ' [FALLBACK]' : ''
            debugLogs.push(`${simOrder.kundeName.slice(0,15)}${fallbackFlag}: steps=[${stepsStr}] → ${demOps.length} demOps`)

            if (demOps.length > 0) demQueueRef.current.push({ orderId: simOrder.id, ops: demOps })
            if (monOps.length > 0) {
              monBundlesMapRef.current[simOrder.id] = monOps
            }
          })
          setInitDebugLogs(debugLogs)

          // Show alert with summary - AUSKOMMENTIERT
          // const summary = `Simulation Init:\n- Orders: ${simulationOrders.length}\n- DemOps created: ${demQueueRef.current.length}\n- MonOps created: ${Object.keys(monBundlesMapRef.current).length}\n\nFirst 3 logs:\n${debugLogs.slice(0, 3).join('\n')}`
          // console.log(summary)
          // setTimeout(() => alert(summary), 500)

          // Initialize main phase queues: orders will come from database queues
          mainQueuesRef.current = {
            acceptance: [], // Empty - will be filled by checkAndReleaseBatch()
            inspection: [],
            qualityShipping: []
          }
          demReadySetRef.current = new Set()

          // Clear all queues before starting (to avoid unique constraint errors)
          console.log('='*80)
          console.log('🚀🚀🚀 NEUE QUEUE-INTEGRATION WIRD VERWENDET 🚀🚀🚀')
          console.log('='*80)
          console.log('🧹 Clearing all queues...')
          const { clearAllQueues, enqueueOrder } = await import('@/app/actions/queue.actions')
          const clearResult = await clearAllQueues()
          console.log('✅ clearAllQueues result:', clearResult)

          // Wait a bit to ensure database is cleared
          await new Promise(resolve => setTimeout(resolve, 100))

          // Enqueue all orders into PreAcceptanceQueue (database)
          console.log(`📦 Enqueueing ${simulationOrders.length} orders into PreAcceptanceQueue...`)
          for (const order of simulationOrders) {
            try {
              await enqueueOrder(
                'preAcceptance',
                order.id,
                0, // currentSimMinute = 0 at start
                order.processSequences,
                calculateProcessTimesFromBaugruppen(order, result.data.factory)
              )
              console.log(`✅ Enqueued order ${order.id.slice(-4)} into PreAcceptanceQueue`)

              // Add Gantt event for queue waiting start
              pushEvent('QUEUE_WAIT:PRE_ACCEPTANCE_START', order.id, null)
            } catch (error) {
              console.error(`Failed to enqueue order ${order.id}:`, error)
            }
          }
        } catch (e) {
          const errorMsg = `FCFS queue build error: ${e instanceof Error ? e.message : String(e)}`
          console.error(errorMsg, e)
          setInitError(errorMsg)
        }
      } else {
        toast.error(result.error || 'Fehler beim Laden der Simulationsdaten');
      }
    } catch (error) {
      console.error('Error loading simulation data:', error);
      toast.error('Fehler beim Laden der Simulationsdaten');
    } finally {
      setLoading(false);
    }
  };

  // New function to randomly select and convert a JSON sequence to simulation process sequence
  const selectRandomSequenceAndConvert = (order: any, allStations: SimulationStation[]): { processSequence: string[], selectedSequence: any } => {
    const processSequencesData = typeof order.processSequences === 'string' 
      ? JSON.parse(order.processSequences) 
      : order.processSequences;
    
    if (!processSequencesData?.baugruppentypen?.sequences || processSequencesData.baugruppentypen.sequences.length === 0) {
      // Fallback to old method if no sequences
      const requiredBgt = extractRequiredBaugruppentypen(order);
      const requiredUpgrades = extractRequiredUpgrades(order);
      return {
        processSequence: determineProcessSequenceWithUpgrades(order, allStations, requiredBgt, requiredUpgrades),
        selectedSequence: null
      };
    }
    
    // Randomly select one sequence from baugruppentypen sequences
    const sequences = processSequencesData.baugruppentypen.sequences;
    const randomIndex = Math.floor(Math.random() * sequences.length);
    const selectedSequence = sequences[randomIndex];
    
    console.log(`Order ${order.kunde.vorname} ${order.kunde.nachname}: Selected sequence ${selectedSequence.id}:`, selectedSequence.steps);
    
    // Convert the sequence steps to station IDs
    const processSequence: string[] = [];
    
    selectedSequence.steps.forEach((step: string, index: number) => {
      if (step === 'I') {
        // Inspection
        if (index === 0) {
          processSequence.push('order-acceptance', 'inspection');
        }
      } else if (step === '×') {
        // Quality check transition - this separates demontage from reassembly
        // No station added, just a marker in the sequence
      } else if (step === 'Q') {
        // Quality and shipping combined
        processSequence.push('quality-shipping');
      } else {
        // This is a component step - find corresponding station
        const isBeforeQuality = selectedSequence.steps.indexOf('×') > -1 && index < selectedSequence.steps.indexOf('×');
        const isAfterQuality = selectedSequence.steps.indexOf('×') > -1 && index > selectedSequence.steps.indexOf('×');
        
        if (isBeforeQuality) {
          // Demontage station
          const demontageStation = allStations.find(s => 
            s.type === 'SUB' && 
            s.parent === 'demontage' && 
            (s.name.includes(step) || s.name.includes(step.replace('BGT-PS-', '').replace('BGT-', '')))
          );
          if (demontageStation) {
            processSequence.push(demontageStation.id);
          }
        } else if (isAfterQuality) {
          // Reassembly station  
          const reassemblyStation = allStations.find(s => 
            s.type === 'SUB' && 
            s.parent === 'reassembly' && 
            (s.name.includes(step) || s.name.includes(step.replace('BGT-PS-', '').replace('BGT-', '')))
          );
          if (reassemblyStation) {
            processSequence.push(reassemblyStation.id);
          }
        }
      }
    });
    
    console.log(`Converted to process sequence:`, processSequence);
    
    return {
      processSequence,
      selectedSequence
    };
  };

  const determineProcessSequenceWithUpgrades = (order: any, allStations: SimulationStation[], requiredBgt: string[], requiredUpgrades: { [baugruppentypId: string]: 'PFLICHT' | 'WUNSCH' }): string[] => {
    const sequence = ['order-acceptance', 'inspection'];
    
    // Add demontage stations for all required Baugruppentypen (all need disassembly)
    requiredBgt.forEach(bgt => {
      const station = allStations.find(s => 
        s.type === 'SUB' && 
        s.parent === 'demontage' && 
        (s.name.includes(bgt) || s.name.includes(bgt.replace('BGT-PS-', '').replace('BGT-', '')))
      );
      if (station) {
        sequence.push(station.id);
      }
    });
    
    // Add reassembly stations only for Baugruppentypen that need PFLICHT or WUNSCH upgrades
    Object.entries(requiredUpgrades).forEach(([bgt, upgradeType]) => {
      if (upgradeType === 'PFLICHT' || upgradeType === 'WUNSCH') {
        const station = allStations.find(s => 
          s.type === 'SUB' && 
          s.parent === 'reassembly' && 
          (s.name.includes(bgt) || s.name.includes(bgt.replace('BGT-PS-', '').replace('BGT-', '')))
        );
        if (station) {
          sequence.push(station.id);
        }
      }
    });
    
    sequence.push('quality-shipping');

    return sequence;
  };

  // Keep old function for backward compatibility but mark as deprecated
  const determineProcessSequence = (order: any, allStations: SimulationStation[], requiredBgt: string[]): string[] => {
    console.warn('Using deprecated determineProcessSequence, should use determineProcessSequenceWithUpgrades');
    return determineProcessSequenceWithUpgrades(order, allStations, requiredBgt, {});
  };

  const extractRequiredBaugruppentypen = (order: any): string[] => {
    const bgtSet = new Set<string>();
    order.baugruppenInstances?.forEach((instance: any) => {
      if (instance.baugruppe?.baugruppentyp?.bezeichnung) {
        bgtSet.add(instance.baugruppe.baugruppentyp.bezeichnung);
      }
    });
    return Array.from(bgtSet);
  };

  const extractRequiredUpgrades = (order: any): { [baugruppentypId: string]: 'PFLICHT' | 'WUNSCH' } => {
    const upgrades: { [baugruppentypId: string]: 'PFLICHT' | 'WUNSCH' } = {};
    order.baugruppenInstances?.forEach((instance: any) => {
      if (instance.reAssemblyTyp && instance.baugruppe?.baugruppentyp?.bezeichnung) {
        upgrades[instance.baugruppe.baugruppentyp.bezeichnung] = instance.reAssemblyTyp;
      }
    });
    return upgrades;
  };

  const createFlowDiagram = (
    mainStations: SimulationStation[],
    demontageSubStations: SimulationStation[],
    reassemblySubStations: SimulationStation[]
  ) => {
    console.log('🎨 createFlowDiagram called with:', {
      mainStations: mainStations.length,
      demontageSubStations: demontageSubStations.length,
      reassemblySubStations: reassemblySubStations.length
    });

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Calculate dynamic heights based on number of sub-stations (vertical layout)
    const demontageHeight = Math.max(350, 120 + demontageSubStations.length * 80 + 40);
    const reassemblyHeight = Math.max(350, 120 + reassemblySubStations.length * 80 + 40);
    
    // Equal spacing for all nodes
    const SPACING = 280; // Consistent spacing between all elements
    const Y = 100; // All nodes at same Y position (top-aligned)
    const indexById: Record<string, number> = {
      'order-acceptance': 0,
      'inspection': 1,
      'demontage-phase': 2,
      'reassembly-phase': 3,
      'quality-shipping': 4,
    };
    mainStations.forEach((station) => {
      const isParent = station.id === 'demontage' || station.id === 'reassembly';
      if (isParent) return;
      const idx = indexById[station.id] ?? 0;
      flowNodes.push({
        id: station.id,
        type: 'default',
        position: { x: idx * SPACING, y: Y },
        data: {
          label: (
            <div className="text-center">
              <div className="font-bold">{station.name}</div>
              <div className="text-xs text-gray-500">Zeit: {station.processingTime} min (±{Math.round(station.stochasticVariation * 100)}%)</div>
            </div>
          )
        },
        style: {
          background: '#ffffff',
          border: '2px solid #1e40af',
          borderRadius: '8px',
          padding: '10px',
          width: 180,
          height: 80
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      });
    });
    
    // Add sub-stations for Demontage (only if not aggregated)
    if (!aggregateView) demontageSubStations.forEach((subStation, index) => {
      const currentOrderName = subStation.currentOrder?.kundeName || 'Frei';
      const waitingCount = subStation.waitingQueue?.length || 0;
      const isOccupied = subStation.currentOrder !== null;
      
      // Vertical layout for demontage sub-stations
      let position = { 
        x: 20, // Fixed x position (left aligned)
        y: 60 + index * 80 // Vertical stacking with 80px spacing
      };
      
      // Use fixed vertical layout (no process graph positioning)
      
      flowNodes.push({
        id: subStation.id,
        type: 'default',
        position: position,
        parentId: 'demontage',
        data: {
          label: (
            <div className="text-center">
              <div className="text-xs font-bold text-gray-800">
                {subStation.name.replace('Demontage ', '')}
              </div>
              <div className={`text-xs font-medium px-1 py-0.5 rounded mt-1 ${
                isOccupied 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {isOccupied ? currentOrderName : 'Frei'}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {subStation.processingTime}min (±{Math.round(subStation.stochasticVariation * 100)}%)
              </div>
            </div>
          )
        },
        style: {
          background: isOccupied ? '#fef2f2' : '#f0f9ff',
          border: `2px solid ${isOccupied ? '#dc2626' : '#3b82f6'}`,
          borderRadius: '8px',
          padding: '8px',
          width: 180,
          height: waitingCount > 0 ? 80 : 70,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      });
    });
    
    // Add sub-stations for Re-Assembly (only if not aggregated)
    if (!aggregateView) reassemblySubStations.forEach((subStation, index) => {
      const currentOrderName = subStation.currentOrder?.kundeName || 'Frei';
      const waitingCount = subStation.waitingQueue?.length || 0;
      const isOccupied = subStation.currentOrder !== null;
      
      // Vertical layout for reassembly sub-stations
      let position = { 
        x: 20, // Fixed x position (left aligned)
        y: 60 + index * 80 // Vertical stacking with 80px spacing
      };
      
      // Use fixed vertical layout (no process graph positioning)
      
      flowNodes.push({
        id: subStation.id,
        type: 'default',
        position: position,
        parentId: 'reassembly',
        data: {
          label: (
            <div className="text-center">
              <div className="text-xs font-bold text-gray-800">
                {subStation.name.replace('Montage ', '')}
              </div>
              <div className={`text-xs font-medium px-1 py-0.5 rounded mt-1 ${
                isOccupied 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {isOccupied ? currentOrderName : 'Frei'}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {subStation.processingTime}min (±{Math.round(subStation.stochasticVariation * 100)}%)
              </div>
            </div>
          )
        },
        style: {
          background: isOccupied ? '#fef2f2' : '#f0fdf4',
          border: `2px solid ${isOccupied ? '#dc2626' : '#16a34a'}`,
          borderRadius: '8px',
          padding: '8px',
          width: 180,
          height: waitingCount > 0 ? 80 : 70,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      });
    });

    // Replace area titles with custom phase nodes using live stats
    // Place phase nodes using consistent spacing (same as main stations)
    flowNodes.push({
      id: 'demontage-phase',
      type: 'phaseNode',
      position: { x: indexById['demontage-phase'] * SPACING, y: Y },
      data: {
        title: 'Demontage',
          queue: demQueueRef.current.length || 0,
          totalSlots: demSlotsRef.current.length || 0,
          busySlots: (demSlotsRef.current.filter(s => s.busy).length) || 0,
          slots: demSlotsRef.current.map(s => ({ flex: s.flex, specialization: s.specialization || null, busy: s.busy }))
        },
        draggable: false,
        selectable: false
      } as any)

    flowNodes.push({
      id: 'reassembly-phase',
      type: 'phaseNode',
      position: { x: indexById['reassembly-phase'] * SPACING, y: Y },
      data: {
        title: 'Montage',
        queue: monQueueRef.current.length || 0,
        totalSlots: monSlotsRef.current.length || 0,
        busySlots: (monSlotsRef.current.filter(s => s.busy).length) || 0,
        slots: monSlotsRef.current.map(s => ({ flex: s.flex, specialization: s.specialization || null, busy: s.busy }))
      },
      draggable: false,
      selectable: false
    } as any)
    
    // Connect all main stations with proper flow - complete process chain
    // Create connections between all main process boxes
    const mainStationIds = mainStations.map(s => s.id);
    console.log('Creating flow edges for main stations:', mainStationIds);
    
    // Verify that all required station IDs exist in flowNodes
    const existingNodeIds = flowNodes.map(n => n.id);
    console.log('Existing node IDs:', existingNodeIds);
    
    // Check if required nodes exist before creating edges
    const requiredIds = ['order-acceptance', 'inspection', 'demontage-phase', 'reassembly-phase', 'quality-shipping'];
    const missingIds = requiredIds.filter(id => !existingNodeIds.includes(id));
    if (missingIds.length > 0) {
      console.error('Missing node IDs for connections:', missingIds);
    }
    
    // Add scheduling squares (decorative, not affecting flow) - positioned in the process path
    const orderAcceptanceNode = flowNodes.find(n => n.id === 'order-acceptance');
    const inspectionNode = flowNodes.find(n => n.id === 'inspection');

    if (orderAcceptanceNode) {
      // 1. Circle connector between start and Auftragsannahme - PRE-ACCEPTANCE QUEUE
      flowNodes.push({
        id: 'circle-1',
        type: 'queueCircle',
        position: { x: orderAcceptanceNode.position.x - 100, y: orderAcceptanceNode.position.y + 35 },
        data: {
          label: '',
          queueType: 'preAcceptance' as const
        },
        style: {
          background: '#ffffff',
          border: '2px solid #1a48a5',
          borderRadius: '50%',
          width: 30,
          height: 30
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: true
      });
    }
    
    if (orderAcceptanceNode && inspectionNode) {
      // 2. Circle connector between Auftragsannahme and Inspektion - PRE-INSPECTION QUEUE
      const midX = (orderAcceptanceNode.position.x + 180 + inspectionNode.position.x) / 2 - 15; // Center between stations
      flowNodes.push({
        id: 'circle-2',
        type: 'queueCircle',
        position: { x: midX, y: orderAcceptanceNode.position.y + 35 },
        data: {
          label: '',
          queueType: 'preInspection' as const
        },
        style: {
          background: '#ffffff',
          border: '2px solid #1a48a5',
          borderRadius: '50%',
          width: 30,
          height: 30
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: true
      });
    }

    if (inspectionNode) {
      // 3. Circle connector between Inspektion and Demontage Phase - POST-INSPECTION QUEUE
      // Position circle-3 between inspection and demontage-phase
      const demontagePhaseX = indexById['demontage-phase'] * SPACING; // demontage-phase position
      const midX = (inspectionNode.position.x + 180 + demontagePhaseX) / 2 - 15; // Center between stations
      flowNodes.push({
        id: 'circle-3',
        type: 'queueCircle',
        position: { x: midX, y: inspectionNode.position.y + 35 },
        data: {
          label: '',
          queueType: 'postInspection' as const
        },
        style: {
          background: '#ffffff',
          border: '2px solid #1a48a5',
          borderRadius: '50%',
          width: 30,
          height: 30
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: true
      });
    }
    
    // CRITICAL: Create all main process flow connections FIRST
    // Main station connections (must be complete for simulation to work)
    const mainStationEdges = [
      { id: 'circle-1-order-acceptance', source: 'circle-1', target: 'order-acceptance' },
      { id: 'order-acceptance-circle-2', source: 'order-acceptance', target: 'circle-2' },
      { id: 'circle-2-inspection', source: 'circle-2', target: 'inspection' },
      { id: 'inspection-circle-3', source: 'inspection', target: 'circle-3' },
      { id: 'circle-3-demontage-phase', source: 'circle-3', target: 'demontage-phase' },
      { id: 'demontage-phase-reassembly-phase', source: 'demontage-phase', target: 'reassembly-phase', animated: true },
      { id: 'reassembly-phase-quality-shipping', source: 'reassembly-phase', target: 'quality-shipping' }
    ];

    // Get all available node IDs for validation
    const availableNodeIds = flowNodes.map(n => n.id);
    console.log('🔍 All available nodes:', availableNodeIds);
    
    // Add each main station edge with validation
    mainStationEdges.forEach(({ id, source, target, animated }) => {
      if (availableNodeIds.includes(source) && availableNodeIds.includes(target)) {
        flowEdges.push({
          id,
          source,
          target,
          type: 'smoothstep',
          style: { 
            stroke: '#1a48a5', 
            strokeWidth: animated ? 4 : 3, 
            strokeDasharray: '0' 
          },
          ...(animated && { animated: true })
        });
        console.log(`✅ Connection created: ${source} → ${target}`);
      } else {
        console.error(`❌ Missing nodes for connection ${id}: source=${source} (${availableNodeIds.includes(source)}) target=${target} (${availableNodeIds.includes(target)})`);
      }
    });
    

    console.log(`🎯 Final result: ${flowEdges.length} connections created for ${flowNodes.length} nodes`);
    console.log('📊 Nodes to set:', flowNodes.map(n => ({ id: n.id, type: n.type, position: n.position })));
    console.log('🔗 Edges to set:', flowEdges.map(e => ({ id: e.id, source: e.source, target: e.target })));

    setNodes(flowNodes);
    setEdges(flowEdges);

    console.log('✅ setNodes and setEdges called');
  };

  // Simulation engine - now handled in context, but we still need to process orders
  useEffect(() => {
    if (!isRunning) return;

    lastRealTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const realTimeDelta = now - lastRealTimeRef.current;
      lastRealTimeRef.current = now;

      if (realTimeDelta <= 0) {
        return;
      }

      // Base: 60 seconds real time = 1 simulation minute
      // With speed multiplier: faster speeds reduce the real time needed
      const deltaMinutes = (realTimeDelta / 60000) * speed;
      if (deltaMinutes <= 0) {
        return;
      }

      processOrders(deltaMinutes);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, speed]);

  const calculateStochasticProcessingTime = (baseTime: number, variation: number): number => {
    // Apply stochastic variation using normal distribution approximation
    const randomFactor = (Math.random() - 0.5) * 2; // -1 to 1
    const variationAmount = baseTime * variation * randomFactor;
    return Math.max(1, baseTime + variationAmount); // Minimum 1 minute
  };

  const saveStationDuration = async (orderId: string, stationId: string, stationName: string, stationType: string, expectedDuration: number, actualDuration: number, startTime: Date, endTime: Date) => {
    try {
      await fetch('/api/station-duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auftragId: orderId,
          stationId,
          stationName,
          stationType,
          expectedDuration,
          actualDuration,
          stochasticVariation: (actualDuration - expectedDuration) / expectedDuration,
          startedAt: startTime.toISOString(),
          completedAt: endTime.toISOString()
        })
      });
    } catch (error) {
      console.error('Error saving station duration:', error);
    }
  };

  const refreshDeliveryMetrics = useCallback(async (forceAll = false) => {
    if (!activeFactory?.id) return
    try {
      const params = new URLSearchParams({ factoryId: activeFactory.id })
      // Only add 'since' parameter if not forcing a full reload AND we have a timestamp
      if (!forceAll && deliveryMetricsSinceRef.current) {
        params.append('since', deliveryMetricsSinceRef.current.toString())
      }
      const response = await fetch(`/api/delivery-metrics?${params.toString()}`, {
        cache: 'no-store',
      })
      let result: any = null
      try {
        result = await response.json()
      } catch (parseError) {
        console.warn('Failed to parse delivery metrics response:', parseError)
      }
      if (!response.ok || !(result?.success && result.data)) {
        const errorMessage =
          (result && result.error) || `Keine Liefertermin-Daten verfügbar (Status ${response.status})`
        setDeliveryMetrics(null)
        setDeliveryMetricsError(errorMessage)
        return
      }
      setDeliveryMetrics(result.data)
      setDeliveryMetricsError(null)
    } catch (error) {
      console.error('Delivery metrics refresh failed:', error)
      setDeliveryMetricsError('Fehler beim Laden der Liefertermin-Analysen')
    }
  }, [activeFactory?.id])

  const formatDeviationMinutes = (minutes: number) => {
    if (!Number.isFinite(minutes)) return 'n/a'
    const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : ''
    const absolute = Math.abs(minutes)
    const days = Math.floor(absolute / (60 * 24))
    const hours = Math.floor((absolute % (60 * 24)) / 60)
    const mins = Math.round(absolute % 60)
    const parts: string[] = []
    if (days) parts.push(`${days}d`)
    if (hours) parts.push(`${hours}h`)
    if (mins || parts.length === 0) parts.push(`${mins}m`)
    const magnitude = parts.join(' ')
    return sign ? `${sign}${magnitude}` : magnitude
  }

  const formatIsoDateTime = (iso: string | null | undefined) => {
    if (!iso) return '--'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '--'
    return date.toLocaleString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    })
  }

  const formatSimMinuteDateTime = (simMinute?: number | null) => {
    if (typeof simMinute !== 'number' || Number.isNaN(simMinute)) return '–'
    const date = new Date(simMinute * 60000)
    if (Number.isNaN(date.getTime())) return '–'
    const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
    const day = pad(date.getDate())
    const month = pad(date.getMonth() + 1)
    const year = date.getFullYear()
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    const seconds = pad(date.getSeconds())
    return `${day}.${month}.${year}, ${hours}:${minutes}.${seconds}`
  }

  const updateSchedulingStats = useCallback((summary?: SchedulingSummaryPayload, simMinute?: number) => {
    if (!summary) return
    const stageMap: Record<QueueStage, SchedulingStageKey> = {
      preAcceptance: 'pap',
      preInspection: 'pip',
      postInspection: 'pipo',
    }
    const stageKey = stageMap[summary.stage]
    const effectiveSimMinute = simMinute ?? summary.simMinute ?? getSimMinutes()

    setSchedulingStats(prev => {
      const stageStats = prev[stageKey]
      const released = summary.releasedCount ?? 0
      const reorder = summary.reorderCount ?? 0
      const pythonDiff = summary.pythonDiffCount ?? reorder
      const queueSize = summary.queueSize ?? stageStats.lastQueueSize
      const batches = summary.batchCount ?? stageStats.lastBatches

      return {
        ...prev,
        [stageKey]: {
          runs: stageStats.runs + 1,
          lastRun: effectiveSimMinute,
          lastReleased: released,
          totalReleased: stageStats.totalReleased + released,
          lastReorder: reorder,
          totalReorder: stageStats.totalReorder + reorder,
          lastQueueSize: queueSize,
          lastBatches: batches,
          lastPythonDiff: pythonDiff,
          totalPythonDiff: stageStats.totalPythonDiff + pythonDiff,
        },
      }
    })
    setSchedulingHistory(prev => {
      const stageHistory = prev[stageKey] ?? []
      const nextEntry: SchedulingSummaryPayload = {
        ...summary,
        simMinute: effectiveSimMinute,
      }
      return {
        ...prev,
        [stageKey]: [nextEntry, ...stageHistory].slice(0, 6),
      }
    })
    if (stageKey === 'pap') {
      let assignments: Array<{ orderId: string; eta: number | null }> | null = null
      if (Array.isArray(summary.pythonAssignments) && summary.pythonAssignments.length) {
        assignments = summary.pythonAssignments.map((item) => ({
          orderId: String(item.orderId),
          eta: typeof item.eta === 'number' ? Number(item.eta) : null,
        }))
      } else if (Array.isArray(summary.pythonEtaList) && summary.pythonEtaList.length) {
        assignments = summary.pythonEtaList.map((item) => ({
          orderId: String(item.orderId),
          eta: typeof item.eta === 'number' ? Number(item.eta) : null,
        }))
      }
      if (assignments?.length) {
        const assignmentMap = new Map<string, number | null>()
        assignments.forEach(({ orderId, eta }) => {
          assignmentMap.set(orderId, eta ?? null)
        })
        simulationOrdersRef.current = simulationOrdersRef.current.map((order) =>
          assignmentMap.has(order.id)
            ? {
                ...order,
                plannedDeliverySimMinute: assignmentMap.get(order.id) ?? null,
                finalCompletionSimMinute: null,
              }
            : order
        )
        setActiveOrders((prev) =>
          prev.map((order) =>
            assignmentMap.has(order.id)
              ? {
                  ...order,
                  plannedDeliverySimMinute: assignmentMap.get(order.id) ?? null,
                  finalCompletionSimMinute: null,
                }
              : order
          )
        )
      }
    }
    if (stageKey === 'pap' || stageKey === 'pipo') {
      refreshDeliveryMetrics()
    }
  }, [getSimMinutes, refreshDeliveryMetrics, setActiveOrders])

  const processOrders = async (deltaMinutes: number) => {
    // Check database queues for batch releases
    const currentSimMinute = getSimMinutes()

    // Store current sim time in localStorage for queue viewer
    localStorage.setItem('currentSimMinute', currentSimMinute.toString())

    if (activeFactory) {
      try {
        const { checkAndReleaseBatch, getQueueStatus, getQueueConfig } = await import('@/app/actions/queue.actions')

        // Check PreAcceptanceQueue
        console.log(`⏰ [t=${currentSimMinute}] Checking PreAcceptanceQueue for batch release...`)
        const preAcceptanceResult = await checkAndReleaseBatch('preAcceptance', currentSimMinute, activeFactory.id)
        console.log(`⏰ [t=${currentSimMinute}] checkAndReleaseBatch result:`, {
          batchReleased: preAcceptanceResult.batchReleased,
          count: preAcceptanceResult.count,
          orderIds: preAcceptanceResult.orderIds?.map(id => id.slice(-4))
        })
        updateSchedulingStats(preAcceptanceResult.summary as SchedulingSummaryPayload | undefined, currentSimMinute)
        if (preAcceptanceResult.batchReleased && preAcceptanceResult.orderIds) {
          console.log(`🎉 Released ${preAcceptanceResult.count} orders from PreAcceptanceQueue at sim t=${currentSimMinute}`)

          // Update lastRelease info
          setQueueDebugInfo(prev => prev ? {
            ...prev,
            lastRelease: {
              queue: 'PreAcceptance',
              count: preAcceptanceResult.count || 0,
              simTime: currentSimMinute
            }
          } : null)

          // Add released orders to activeOrders and acceptance queue
          const releasedOrderIds = preAcceptanceResult.orderIds
          const ordersToActivate = simulationOrdersRef.current.filter(order =>
            releasedOrderIds.includes(order.id)
          )

          console.log(`📋 Activating ${ordersToActivate.length} orders:`, ordersToActivate.map(o => `${o.id.slice(-4)}:${(o as any).kundeName}`))

          // Add Gantt events for queue waiting end
          releasedOrderIds.forEach(orderId => {
            pushEvent('QUEUE_WAIT:PRE_ACCEPTANCE_END', orderId, null)
          })

          // Add to activeOrders state
          setActiveOrders(prev => {
            const newOrders = ordersToActivate.filter(order =>
              !prev.some(p => p.id === order.id)
            )
            return [...prev, ...newOrders]
          })

          // Add to acceptance queue
          releasedOrderIds.forEach(orderId => {
            if (!mainQueuesRef.current.acceptance.includes(orderId)) {
              mainQueuesRef.current.acceptance.push(orderId)
            }
          })
        }

        // Update queue debug info every sim minute (for live debug display)
        const [preAccStatus, preInspStatus, postInspStatus, config] = await Promise.all([
          getQueueStatus('preAcceptance', currentSimMinute),
          getQueueStatus('preInspection', currentSimMinute),
          getQueueStatus('postInspection', currentSimMinute),
          getQueueConfig(activeFactory.id)
        ])

        const queueInfo = {
          preAcceptanceCount: preAccStatus.data?.totalCount || 0,
          preInspectionCount: preInspStatus.data?.totalCount || 0,
          postInspectionCount: postInspStatus.data?.totalCount || 0,
          preAcceptanceReady: preAccStatus.data?.readyCount || 0,
          preInspectionReady: preInspStatus.data?.readyCount || 0,
          postInspectionReady: postInspStatus.data?.readyCount || 0,
          lastCheck: currentSimMinute,
          config: config.data || null,
          lastRelease: queueDebugInfo?.lastRelease, // Preserve previous release info
          scheduling: schedulingStats,
          schedulingHistory,
        }

        setQueueDebugInfo(queueInfo)

        // Log queue status for debugging
        console.log(`🔍 [t=${currentSimMinute}] Queue Status:`,
          `PreAcc=${queueInfo.preAcceptanceCount}`,
          `PreInsp=${queueInfo.preInspectionCount}`,
          `PostInsp=${queueInfo.postInspectionCount}`
        )

        // Check PreInspectionQueue
        console.log(`⏰ [t=${currentSimMinute}] Checking PreInspectionQueue for batch release...`)
        const preInspectionResult = await checkAndReleaseBatch('preInspection', currentSimMinute, activeFactory.id)
        updateSchedulingStats(preInspectionResult.summary as SchedulingSummaryPayload | undefined, currentSimMinute)
        if (preInspectionResult.batchReleased && preInspectionResult.orderIds) {
          console.log(`🎉 Released ${preInspectionResult.count} orders from PreInspectionQueue at sim t=${currentSimMinute}`)

          // Update lastRelease info
          setQueueDebugInfo(prev => prev ? {
            ...prev,
            lastRelease: {
              queue: 'PreInspection',
              count: preInspectionResult.count || 0,
              simTime: currentSimMinute
            }
          } : null)

          // Add Gantt events for queue waiting end
          preInspectionResult.orderIds.forEach(orderId => {
            pushEvent('QUEUE_WAIT:PRE_INSPECTION_END', orderId, null)
          })

          // Add released orders to inspection queue and update their status
          preInspectionResult.orderIds.forEach(orderId => {
            if (!mainQueuesRef.current.inspection.includes(orderId)) {
              mainQueuesRef.current.inspection.push(orderId)
              console.log(`✅ Added order ${orderId.slice(-4)} to inspection queue`)
            }
          })
          // Update order status from 'waiting-inspection' to 'inspection'
          setActiveOrders(prev => prev.map(o =>
            preInspectionResult.orderIds?.includes(o.id)
              ? { ...o, currentStation: 'inspection', isWaiting: true, progress: 0 }
              : o
          ))
        }

        // Check PostInspectionQueue
        console.log(`⏰ [t=${currentSimMinute}] Checking PostInspectionQueue for batch release...`)
        const postInspectionResult = await checkAndReleaseBatch('postInspection', currentSimMinute, activeFactory.id)
        updateSchedulingStats(postInspectionResult.summary as SchedulingSummaryPayload | undefined, currentSimMinute)
        if (postInspectionResult.batchReleased && postInspectionResult.orderIds) {
          console.log(`🎉 Released ${postInspectionResult.count} orders from PostInspectionQueue at sim t=${currentSimMinute}`)

          // Update lastRelease info
          setQueueDebugInfo(prev => prev ? {
            ...prev,
            lastRelease: {
              queue: 'PostInspection',
              count: postInspectionResult.count || 0,
              simTime: currentSimMinute
            }
          } : null)

          // Add Gantt events for queue waiting end
          postInspectionResult.orderIds.forEach(orderId => {
            pushEvent('QUEUE_WAIT:POST_INSPECTION_END', orderId, null)
          })

          // Orders from PostInspectionQueue go to demontage phase
          postInspectionResult.orderIds.forEach(orderId => {
            demReadySetRef.current.add(orderId)
            console.log(`✅ Order ${orderId.slice(-4)} ready for demontage phase`)
          })
          // Update order status from 'waiting-demontage' to 'demontage'
          setActiveOrders(prev => prev.map(o =>
            postInspectionResult.orderIds?.includes(o.id)
              ? { ...o, currentStation: 'demontage', isWaiting: true, progress: 0 }
              : o
          ))
        }
      } catch (error) {
        console.error('Error checking queues:', error)
      }
    }

    setContextStations((prevStations: any) => {
      const updatedStations = [...prevStations];
      const newCompletedOrders: SimulationOrder[] = [];
      const updatedOrders: SimulationOrder[] = [];
      const waitingOrdersList: SimulationOrder[] = [];

      // Aggregate dispatcher mode (FCFS sequential per phase)
      if (aggregateView) {
        const queueQualityPhase = (orderId: string) => {
          // Note: demReadySetRef cleanup is now done in the phase completion logic
          const alreadyQueued = mainQueuesRef.current.qualityShipping.includes(orderId);
          const activeAtQuality = mainActiveRef.current['quality-shipping']?.orderId === orderId;
          if (!alreadyQueued && !activeAtQuality) {
            mainQueuesRef.current.qualityShipping.push(orderId);
          }
          setActiveOrders(prev =>
            prev.map(o =>
              o.id === orderId
                ? { ...o, currentStation: 'quality-shipping', isWaiting: true, progress: 0 }
                : o
            )
          );
        };

        const markWaitingForReassembly = (orderId: string) => {
          setActiveOrders(prev =>
            prev.map(o =>
              o.id === orderId
                ? { ...o, currentStation: 'reassembly', isWaiting: true, progress: 0 }
                : o
            )
          );
        };

        // Keep acceptance queue scoped to orders that are actually waiting for this phase
        mainQueuesRef.current.acceptance = mainQueuesRef.current.acceptance.filter(orderId => {
          const order = activeOrdersRef.current.find(o => o.id === orderId)
          return order && !order.completedAt && order.currentStation === 'order-acceptance'
        })
        activeOrdersRef.current.forEach(order => {
          if (order.completedAt) return
          if (order.currentStation !== 'order-acceptance') return
          if (mainActiveRef.current['order-acceptance']?.orderId === order.id) return
          if (!mainQueuesRef.current.acceptance.includes(order.id)) {
            mainQueuesRef.current.acceptance.push(order.id)
          }
        })
        // Capacity=1 for main phases using active tracker per station
        const processMainStation = (stationId: string) => {
          const station = updatedStations.find(s => s.id === stationId)
          if (!station) return
          const active = mainActiveRef.current[stationId]

          if (active) {
            // Get order-specific expected time from stationDurations if available
            const activeOrder = activeOrdersRef.current.find(o => o.id === active.orderId)
            const expected = activeOrder?.stationDurations?.[stationId]?.expected || station.processingTime || 1

            // progress active order
            active.remaining = Math.max(0, active.remaining - deltaMinutes)
            setActiveOrders(prev => prev.map(o => {
              if (o.id !== active.orderId) return o
              const sd = { ...(o.stationDurations || {}) }
              const e = sd[stationId] || {}
              sd[stationId] = { ...e, expected, actual: expected, startTime: e.startTime || new Date(), completed: active.remaining <= 0 }
              return { ...o, currentStation: stationId, progress: Math.max(0, (active.total - active.remaining)), stationDurations: sd }
            }))
            // reflect in flow node (occupancy)
            station.currentOrder = activeOrders.find(o => o.id === active.orderId) as any
            const waiters = activeOrders.filter(o => o.currentStation === stationId && o.id !== active.orderId)
            station.waitingQueue = waiters as any
            if (active.remaining <= 0) {
              // finished
              const finishedOrderId = active.orderId
              mainActiveRef.current[stationId] = null
              // Gantt END
              const phaseLbl = stationId === 'order-acceptance' ? 'ACCEPTANCE' : stationId === 'inspection' ? 'INSPECTION' : stationId === 'quality-shipping' ? 'QA_SHIPPING' : stationId.toUpperCase()
              pushEvent(`${phaseLbl}:${phaseLbl}_END`, finishedOrderId, null)
              // advance order to next logical station
              const enqueueUnique = (queue: string[], orderId: string) => {
                if (!queue.includes(orderId)) {
                  queue.push(orderId)
                }
              }

              // Write to database queues asynchronously
              ;(async () => {
                try {
                  const { enqueueOrder } = await import('@/app/actions/queue.actions')
                  const order = activeOrdersRef.current.find(o => o.id === finishedOrderId)
                  if (!order) return

                  if (stationId === 'order-acceptance') {
                    await enqueueOrder(
                      'preInspection',
                      finishedOrderId,
                      getSimMinutes(),
                      order.processSequences,
                      calculateProcessTimesFromBaugruppen(order, factoryData?.factory)
                    )
                    console.log(`✅ [t=${getSimMinutes()}] Order ${finishedOrderId.slice(-4)} finished acceptance → PreInspectionQueue`)
                    // Add Gantt event for queue waiting start
                    pushEvent('QUEUE_WAIT:PRE_INSPECTION_START', finishedOrderId, null)
                  } else if (stationId === 'inspection') {
                    await enqueueOrder(
                      'postInspection',
                      finishedOrderId,
                      getSimMinutes(),
                      order.processSequences,
                      calculateProcessTimesFromBaugruppen(order, factoryData?.factory)
                    )
                    console.log(`✅ [t=${getSimMinutes()}] Order ${finishedOrderId.slice(-4)} finished inspection → PostInspectionQueue`)
                    // Add Gantt event for queue waiting start
                    pushEvent('QUEUE_WAIT:POST_INSPECTION_START', finishedOrderId, null)
                  }
                } catch (error) {
                  console.error('Failed to enqueue to database queue:', error)
                }
              })()

              const completionSimMinute = getSimMinutes()

              // Convert relative sim minute to absolute timestamp (minutes since Unix epoch)
              // plannedDeliverySimMinute is stored as absolute, so finalCompletionSimMinute should match
              const absoluteCompletionMinutes = simulationStartTimeRef.current
                ? simulationStartTimeRef.current.getTime() / 60000 + completionSimMinute
                : completionSimMinute

              const completedOrderSnapshot =
                stationId === 'quality-shipping'
                  ? activeOrdersRef.current.find(o => o.id === finishedOrderId)
                  : null

              setActiveOrders(prev => {
                let updated: SimulationOrder[];

                // Filter out completed orders from quality-shipping
                if (stationId === 'quality-shipping') {
                  updated = prev.filter(o => o.id !== finishedOrderId)
                } else {
                  updated = prev.map(o => {
                    if (o.id !== finishedOrderId) return o
                    if (stationId === 'order-acceptance') {
                      // DON'T enqueue in inspection yet - wait for PreInspectionQueue release
                      return { ...o, currentStation: 'waiting-inspection', isWaiting: true, progress: 0 }
                    }
                    if (stationId === 'inspection') {
                      // DON'T add to demReadySet yet - wait for PostInspectionQueue release
                      return { ...o, currentStation: 'waiting-demontage', isWaiting: true, progress: 0 }
                    }
                    return { ...o }
                  })
                }

                // Immediately update the ref to prevent stale reads in the same tick
                activeOrdersRef.current = updated
                return updated
              })
              // quality-shipping completion to KPI
              if (stationId === 'quality-shipping') {
                if (completedOrderSnapshot && !completedOrderSnapshot.finalCompletionSimMinute) {
                  simulationOrdersRef.current = simulationOrdersRef.current.map((order) =>
                    order.id === finishedOrderId
                      ? { ...order, finalCompletionSimMinute: absoluteCompletionMinutes }
                      : order
                  )
                  const done = {
                    ...completedOrderSnapshot,
                    completedAt: new Date(),
                    schedulingAlgorithm: currentSchedulingAlgorithm,
                    finalCompletionSimMinute: absoluteCompletionMinutes,
                  }
                  newCompletedOrders.push(done as any)
                  addCompletedOrder(done as any)

                  ;(async () => {
                    try {
                      const { setOrderCompletionSimMinute } = await import(
                        '@/app/actions/advanced-simulation.actions'
                      )
                      await setOrderCompletionSimMinute(finishedOrderId, absoluteCompletionMinutes)
                    } catch (error) {
                      console.error('Failed to persist final completion sim minute:', error)
                    }
                  })()

                  // Buffer completion for potential DB persistence (high priority)
                  bufferRef.current.addCompletionUpdate(finishedOrderId, new Date(), 'high')
                }
              }
            }
            return
          }

          // find next order from queue
          const q = stationId === 'order-acceptance' ? mainQueuesRef.current.acceptance
                    : stationId === 'inspection' ? mainQueuesRef.current.inspection
                    : stationId === 'quality-shipping' ? mainQueuesRef.current.qualityShipping : []
          const nextId = q.shift()
          if (nextId) {
            const next = activeOrdersRef.current.find(o => o.id === nextId)
            if (!next) return
            // Get order-specific expected time
            const expected = next.stationDurations?.[stationId]?.expected || station.processingTime || 1
            // initialize and hold capacity
            mainActiveRef.current[stationId] = { orderId: next.id, remaining: expected, total: expected }
            // ensure stationDurations entry exists
            setActiveOrders(prev => prev.map(o => {
              if (o.id !== next.id) return o
              const sd = { ...(o.stationDurations || {}) }
              sd[stationId] = sd[stationId] || { expected, actual: expected, startTime: new Date(), completed: false }
              return { ...o, currentStation: stationId, progress: 0, stationDurations: sd }
            }))
            // reflect occupancy in flow node
            station.currentOrder = next as any
            station.waitingQueue = [] as any
            // Gantt START
            const phaseLbl = stationId === 'order-acceptance' ? 'ACCEPTANCE' : stationId === 'inspection' ? 'INSPECTION' : stationId === 'quality-shipping' ? 'QA_SHIPPING' : stationId.toUpperCase()
            pushEvent(`${phaseLbl}:${phaseLbl}_START`, next.id, null)
          }
        }

        // process main phases sequentially by station
        ;['order-acceptance','inspection','quality-shipping'].forEach(processMainStation)

        const nowMin = getSimMinutes()
        // helper to update main nodes' queues count
        const setPhaseQueueLen = (phaseId: 'demontage'|'reassembly', len: number) => {
          const node = updatedStations.find(s => s.id === phaseId)
          if (node) node.waitingQueue = Array.from({length: Math.max(0,len)}, ()=>({}))
        }

        const tickPhase = (phase: 'DEM'|'MON') => {
          const queueRef = phase === 'DEM' ? demQueueRef : monQueueRef
          const activesRef = phase === 'DEM' ? demActivesRef : monActivesRef
          const mainId = phase === 'DEM' ? 'demontage' : 'reassembly'

          // DEBUG: Log tickPhase calls
          if (phase === 'DEM') {
            const msg = `🔄 tickPhase ${phase} @t=${getSimMinutes()} queue=${queueRef.current.length} active=${activesRef.current.length} startTimeRef=${simulationStartTimeRef.current ? 'SET' : 'NULL'}`
            console.log(msg)
            dispatcherLogsRef.current.push(msg)
            if (dispatcherLogsRef.current.length > 50) dispatcherLogsRef.current.shift()
          }

          // Progress and sync UI for all actives
          activesRef.current = activesRef.current.map(a => ({ ...a, remaining: Math.max(0, a.remaining - deltaMinutes) }))
          const mainStation = updatedStations.find(s => s.id === mainId)
          activesRef.current.forEach((a, idx) => {
            const progress = Math.max(0, a.total - a.remaining)
            setActiveOrders(prev => prev.map(o => {
              if (o.id !== a.orderId) return o
              const sd = { ...(o.stationDurations || {}) }
              const e = sd[mainId] || {}
              sd[mainId] = { ...e, expected: a.total, actual: a.total, startTime: e.startTime || new Date(), completed: a.remaining <= 0 }
              return { ...o, currentStation: mainId, progress, stationDurations: sd, isWaiting: false }
            }))
            if (idx === 0 && mainStation) {
              mainStation.currentOrder = activeOrdersRef.current.find(o => o.id === a.orderId) as any
            }
          })

          // Complete finished actives
          const finished = activesRef.current.filter(a => a.remaining <= 0)
          if (finished.length) {
            finished.forEach(a => {
              pushEvent(`${phase === 'DEM' ? 'DEMONTAGE' : 'MONTAGE'}:${a.label}_END`, a.orderId, a.slotIdx)
              releaseSlot(phase === 'DEM' ? 'DEMONTAGE' : 'REASSEMBLY', a.slotIdx)
              // Use the same key format as when setting: orderId:phase:label
              const delKey = `${a.orderId}:${phase === 'DEM' ? 'demontage' : 'reassembly'}:${a.label}`
              delete orderPhaseSlotMapRef.current[delKey]
              const idx = queueRef.current.findIndex(b => b.orderId === a.orderId)
              if (idx >= 0) {
                const b = queueRef.current[idx]
                if (b.ops[0]?.label === a.label) b.ops.shift()
                // Only remove from queue and move to next phase when ALL ops are done
                if (b.ops.length === 0) {
                  queueRef.current.splice(idx, 1)
                  if (phase === 'DEM') {
                    // Remove from demReady only when ALL demOps are done
                    demReadySetRef.current.delete(a.orderId)
                    const monOps = monBundlesMapRef.current[a.orderId] || []
                    if (monOps.length) {
                      const alreadyQueued = monQueueRef.current.some(bundle => bundle.orderId === a.orderId)
                      if (!alreadyQueued) {
                        monQueueRef.current.push({ orderId: a.orderId, ops: [...monOps] })
                        markWaitingForReassembly(a.orderId)
                      }
                    } else {
                      queueQualityPhase(a.orderId)
                    }
                    delete monBundlesMapRef.current[a.orderId]
                  } else {
                    queueQualityPhase(a.orderId)
                    delete monBundlesMapRef.current[a.orderId]
                  }
                }
              }
            })
            activesRef.current = activesRef.current.filter(a => a.remaining > 0)
          }

          // Start new ops up to free slots by scanning queue
          for (let i = 0; i < queueRef.current.length; i++) {
            const b = queueRef.current[i]
            if (!b.ops || b.ops.length === 0) continue
            // DEM gating: only start orders that passed inspection
            if (phase === 'DEM' && !demReadySetRef.current.has(b.orderId)) {
              const msg = `⚠️ skip ${b.orderId.slice(-4)} - not in demReadySet`
              console.log(msg)
              dispatcherLogsRef.current.push(msg)
              continue
            }
            const nxt = b.ops[0]
            const displayLabel = nxt.display || nxt.label

            // CRITICAL: Check if this operation is already being processed BEFORE picking a slot
            // This prevents orphan slots (slots marked as busy without active operations)
            const alreadyActive = activesRef.current.some(a =>
              a.orderId === b.orderId && a.label === displayLabel
            )
            if (alreadyActive) {
              const msg = `⚠️ SKIP: Op ${displayLabel} for order ${b.orderId.slice(-4)} already active in slot`
              console.log(msg)
              dispatcherLogsRef.current.push(msg)
              if (dispatcherLogsRef.current.length > 50) dispatcherLogsRef.current.shift()
              continue // Skip this operation before calling pickSlot
            }

            const desiredKey = nxt.typeKey || normalizeOperationKey(nxt.label)
            const msg1 = `🔍 try ${b.orderId.slice(-4)} op=${nxt.label} key=${desiredKey} @t=${getSimMinutes()}`
            console.log(msg1)
            dispatcherLogsRef.current.push(msg1)
            if (dispatcherLogsRef.current.length > 50) dispatcherLogsRef.current.shift()
            const slotIdx = pickSlot(
              phase === 'DEM' ? 'DEMONTAGE' : 'REASSEMBLY',
              desiredKey
            )
            const msg2 = `🎰 pickSlot result: ${slotIdx}`
            console.log(msg2)
            dispatcherLogsRef.current.push(msg2)
            if (slotIdx >= 0) {
              // IMPORTANT: Check if this specific operation already has a slot assigned
              // Use operation label to track slots per operation, not per order
              const opKey = `${b.orderId}:${phase === 'DEM' ? 'demontage' : 'reassembly'}:${nxt.label}`

              const previousSlot = orderPhaseSlotMapRef.current[opKey]
              if (previousSlot !== undefined && previousSlot !== slotIdx) {
                console.log(`🔓 Releasing previous slot ${previousSlot} for order ${b.orderId.slice(-4)} op ${nxt.label} before assigning new slot ${slotIdx}`)
                releaseSlot(phase === 'DEM' ? 'DEMONTAGE' : 'REASSEMBLY', previousSlot)
              }

              pushEvent(
                `${phase === 'DEM' ? 'DEMONTAGE' : 'MONTAGE'}:${displayLabel}_START`,
                b.orderId,
                slotIdx
              )
              activesRef.current.push({
                orderId: b.orderId,
                label: displayLabel,
                slotIdx,
                remaining: nxt.duration,
                total: nxt.duration,
              })
              setActiveOrders(prev => prev.map(o => {
                if (o.id !== b.orderId) return o
                const sd = { ...(o.stationDurations || {}) }
                sd[mainId] = { expected: nxt.duration, actual: nxt.duration, startTime: new Date(), completed: false }
                return { ...o, currentStation: mainId, progress: 0, stationDurations: sd, isWaiting: false }
              }))
              orderPhaseSlotMapRef.current[opKey] = slotIdx
              if (mainStation) {
                mainStation.currentOrder = activeOrdersRef.current.find(o => o.id === b.orderId) as any
              }
            }
          }

          setPhaseQueueLen(mainId as any, queueRef.current.length)

          if (mainStation) {
            if (activesRef.current.length === 0) {
              mainStation.currentOrder = null
            } else {
              const activeOrderId = activesRef.current[0]?.orderId
              const activeOrder = activeOrdersRef.current.find(o => o.id === activeOrderId)
              mainStation.currentOrder = activeOrder ? (activeOrder as any) : null
            }
          }
        }

        const msg0 = `⏰ About to call tickPhase @t=${getSimMinutes()} demQueue=${demQueueRef.current.length}`
        console.log(msg0)
        dispatcherLogsRef.current.push(msg0)
        if (dispatcherLogsRef.current.length > 50) dispatcherLogsRef.current.shift()

        tickPhase('DEM')
        tickPhase('MON')

        // Update phase node live stats (deferred to avoid setState during render)
        setTimeout(() => {
          try {
            setNodes(prev => prev.map(n => {
              if (n.id === 'demontage-phase') {
                return {
                  ...n,
                  data: {
                    ...(n.data || {}),
                    queue: demQueueRef.current.length || 0,
                    totalSlots: demSlotsRef.current.length || 0,
                    busySlots: (demSlotsRef.current.filter(s => s.busy).length) || 0,
                    slots: demSlotsRef.current.map(s => ({ flex: s.flex, specialization: s.specialization || null, busy: s.busy }))
                  }
                } as any
              }
              if (n.id === 'reassembly-phase') {
                return {
                  ...n,
                  data: {
                    ...(n.data || {}),
                    queue: monQueueRef.current.length || 0,
                    totalSlots: monSlotsRef.current.length || 0,
                    busySlots: (monSlotsRef.current.filter(s => s.busy).length) || 0,
                    slots: monSlotsRef.current.map(s => ({ flex: s.flex, specialization: s.specialization || null, busy: s.busy }))
                  }
                } as any
              }
              return n
            }))
          } catch {}
        }, 0)

        // Track waiting times for orders in queue (aggregateView mode)
        activeOrdersRef.current.forEach(order => {
          if (order.isWaiting && !order.completedAt) {
            const stationId = order.currentStation
            if (!order.stationDurations[stationId]) {
              order.stationDurations[stationId] = {
                expected: 0,
                waitingTime: 0,
                startTime: new Date(),
                completed: false
              }
            }
            // Increment waiting time
            order.stationDurations[stationId].waitingTime =
              (order.stationDurations[stationId].waitingTime || 0) + deltaMinutes
          }
        })

        // Sync active orders list (drop completed)
        try {
          setActiveOrders(prev => prev.filter(o => !o.completedAt))
        } catch {}

        // Return without station-level assignment
        return updatedStations
      }
      
      // Phase utilization snapshot
      const getActivePhaseCount = (phasePrefix: 'demontage-' | 'reassembly-') =>
        updatedStations.filter(s => s.id.startsWith(phasePrefix) && s.currentOrder).length
      
      // First, assign unassigned orders to available stations
      activeOrders.forEach(order => {
        const currentStationData = updatedStations.find(s => s.id === order.currentStation);

        // If order is at a station but not assigned to the station, assign it (unless station is busy)
        if (currentStationData && !currentStationData.currentOrder && !order.isWaiting) {
          const isDemSub = currentStationData.id.startsWith('demontage-')
          const isReaSub = currentStationData.id.startsWith('reassembly-')
          const demFull = isDemSub && getActivePhaseCount('demontage-') >= demSlots
          const monFull = isReaSub && getActivePhaseCount('reassembly-') >= monSlots
          if (demFull || monFull) {
            // Gate by phase capacity: keep in queue
            currentStationData.waitingQueue = currentStationData.waitingQueue || []
            if (!currentStationData.waitingQueue.find((o: any) => o.id === order.id)) {
              currentStationData.waitingQueue.push(order)
            }
            order.isWaiting = true
            console.log(`Capacity gating: queuing ${order.kundeName} at ${currentStationData.id}`)
          } else {
            currentStationData.currentOrder = order;
            console.log(`Assigned ${order.kundeName} to ${currentStationData.name}`);
          }
        }
      });
      
      // Process orders currently in stations
      activeOrders.forEach(order => {
        const currentStationData = updatedStations.find(s => s.id === order.currentStation);

        if (currentStationData && currentStationData.currentOrder?.id === order.id) {
          // Initialize station duration tracking if not already done
          if (!order.stationDurations[order.currentStation]) {
            const stochasticTime = calculateStochasticProcessingTime(
              currentStationData.processingTime, 
              currentStationData.stochasticVariation
            );
            order.stationDurations[order.currentStation] = {
              expected: currentStationData.processingTime,
              actual: stochasticTime,
              startTime: new Date(),
              completed: false
            };
            order.stationStartTime = new Date();
            order.progress = 0;
            order.isWaiting = false;
            // Log START for sub-ops
            if (order.currentStation.startsWith('demontage-')) {
              const lbl = currentStationData.name?.replace('Demontage ', '') || order.currentStation
              // Find any slot for this order in demontage phase
              let slotIdx: number | null = null
              Object.keys(orderPhaseSlotMapRef.current).forEach(key => {
                if (key.startsWith(`${order.id}:demontage`)) {
                  slotIdx = orderPhaseSlotMapRef.current[key]
                }
              })
              pushEvent(`DEMONTAGE:${lbl}_START`, order.id, slotIdx)
            } else if (order.currentStation.startsWith('reassembly-')) {
              const lbl = currentStationData.name?.replace('Montage ', '') || order.currentStation
              // Find any slot for this order in reassembly phase
              let slotIdx: number | null = null
              Object.keys(orderPhaseSlotMapRef.current).forEach(key => {
                if (key.startsWith(`${order.id}:reassembly`)) {
                  slotIdx = orderPhaseSlotMapRef.current[key]
                }
              })
              pushEvent(`MONTAGE:${lbl}_START`, order.id, slotIdx)
            }
          }
          
          const prevProgress = order.progress;
          const requiredTime = order.stationDurations[order.currentStation].actual || currentStationData.processingTime;
          order.progress = Math.min(order.progress + deltaMinutes, requiredTime); // Cap progress at required time
          
          // Debug if we hit the cap
          if (prevProgress + deltaMinutes > requiredTime && order.progress === requiredTime) {
            console.log(`Progress capped for ${order.kundeName} at ${order.currentStation}: was going to be ${(prevProgress + deltaMinutes).toFixed(2)}, capped at ${requiredTime.toFixed(2)}`);
          }

          if (order.progress >= requiredTime) {
            // Mark station duration as completed
            order.stationDurations[order.currentStation].completed = true;
            
            // Save station duration to database
            const stationDuration = order.stationDurations[order.currentStation];
            if (stationDuration.startTime) {
              saveStationDuration(
                order.id,
                order.currentStation,
                currentStationData.name,
                currentStationData.type,
                stationDuration.expected,
                stationDuration.actual || requiredTime,
                stationDuration.startTime,
                new Date()
              );
            }
            // Log END event for sub-ops
            if (order.currentStation.startsWith('demontage-')) {
              const lbl = currentStationData.name?.replace('Demontage ', '') || order.currentStation
              // Find any slot for this order in demontage phase
              let slotIdx: number | null = null
              Object.keys(orderPhaseSlotMapRef.current).forEach(key => {
                if (key.startsWith(`${order.id}:demontage`)) {
                  slotIdx = orderPhaseSlotMapRef.current[key]
                }
              })
              pushEvent(`DEMONTAGE:${lbl}_END`, order.id, slotIdx)
            } else if (order.currentStation.startsWith('reassembly-')) {
              const lbl = currentStationData.name?.replace('Montage ', '') || order.currentStation
              // Find any slot for this order in reassembly phase
              let slotIdx: number | null = null
              Object.keys(orderPhaseSlotMapRef.current).forEach(key => {
                if (key.startsWith(`${order.id}:reassembly`)) {
                  slotIdx = orderPhaseSlotMapRef.current[key]
                }
              })
              pushEvent(`MONTAGE:${lbl}_END`, order.id, slotIdx)
            }
            
            // Free current station
            currentStationData.currentOrder = null;
            // Release slot if this was a demontage/reassembly sub-station
            if (order.currentStation.startsWith('demontage-')) {
              // Find all keys for this order in demontage phase and release them
              const keysToDelete: string[] = []
              Object.keys(orderPhaseSlotMapRef.current).forEach(key => {
                if (key.startsWith(`${order.id}:demontage`)) {
                  const idx = orderPhaseSlotMapRef.current[key]
                  if (idx !== undefined) {
                    releaseSlot('DEMONTAGE', idx)
                    keysToDelete.push(key)
                  }
                }
              })
              keysToDelete.forEach(key => delete orderPhaseSlotMapRef.current[key])
            } else if (order.currentStation.startsWith('reassembly-')) {
              // Find all keys for this order in reassembly phase and release them
              const keysToDelete: string[] = []
              Object.keys(orderPhaseSlotMapRef.current).forEach(key => {
                if (key.startsWith(`${order.id}:reassembly`)) {
                  const idx = orderPhaseSlotMapRef.current[key]
                  if (idx !== undefined) {
                    releaseSlot('REASSEMBLY', idx)
                    keysToDelete.push(key)
                  }
                }
              })
              keysToDelete.forEach(key => delete orderPhaseSlotMapRef.current[key])
            }
            
            // Try to assign next order from waiting queue to current station using selected scheduling algorithm
            if (currentStationData.waitingQueue.length > 0) {
              const isDemSub = currentStationData.id.startsWith('demontage-')
              const isReaSub = currentStationData.id.startsWith('reassembly-')
              const isMainStation = currentStationData.type === 'MAIN'
              const demFull = isDemSub && getActivePhaseCount('demontage-') >= demSlots
              const monFull = isReaSub && getActivePhaseCount('reassembly-') >= monSlots
              console.log(`🔍 Station ${currentStationData.id} has ${currentStationData.waitingQueue.length} waiting orders, isMainStation=${isMainStation}, demFull=${demFull}, monFull=${monFull}`);
              // For main stations, always try to dispatch if the station is free
              // For sub-stations, only dispatch if phase capacity is not full
              if (isMainStation || !(demFull || monFull)) {
                const schedulingStrategy = schedulingStrategies[currentSchedulingAlgorithm as SchedulingAlgorithm];
                const nextOrder = schedulingStrategy.selectNext(currentStationData.waitingQueue, simulationTime);
                
                if (nextOrder) {
                  // Remove the selected order from the waiting queue
                  const orderIndex = currentStationData.waitingQueue.findIndex(o => o.id === nextOrder.id);
                  if (orderIndex >= 0) {
                    currentStationData.waitingQueue.splice(orderIndex, 1);
                    // Check slot availability for sub stations
                    const isDemSub2 = currentStationData.id.startsWith('demontage-')
                    const isReaSub2 = currentStationData.id.startsWith('reassembly-')
                    const isMainStation2 = currentStationData.type === 'MAIN'
                    const opLabel2 = currentStationData.name?.replace('Demontage ', '')?.replace('Montage ', '') || currentStationData.id
                    let pickedSlot2 = -1
                    if (isDemSub2) pickedSlot2 = pickSlot('DEMONTAGE', opLabel2)
                    if (isReaSub2) pickedSlot2 = pickSlot('REASSEMBLY', opLabel2)
                    // Main stations don't need slots, sub-stations need slots
                    if (isMainStation2 || pickedSlot2 >= 0) {
                      currentStationData.currentOrder = nextOrder;
                      nextOrder.isWaiting = false;
                      if (!isMainStation2) {
                        const phaseKey2 = isDemSub2 ? 'demontage-' : 'reassembly-'
                        orderPhaseSlotMapRef.current[`${nextOrder.id}:${phaseKey2}`] = pickedSlot2
                      }
                      // Initialize stationDurations when order starts processing
                      if (!nextOrder.stationDurations[currentStationData.id] || !nextOrder.stationDurations[currentStationData.id].actual) {
                        const stochasticTime = calculateStochasticProcessingTime(
                          currentStationData.processingTime,
                          currentStationData.stochasticVariation
                        );
                        nextOrder.stationDurations[currentStationData.id] = {
                          ...nextOrder.stationDurations[currentStationData.id], // Keep existing data like waitingTime
                          expected: currentStationData.processingTime,
                          actual: stochasticTime,
                          startTime: new Date(),
                          completed: false
                        };
                        nextOrder.progress = 0; // Reset progress for actual processing
                        console.log(`Fixed stationDurations for ${nextOrder.kundeName} at ${currentStationData.id}: actual=${stochasticTime}min`);
                      }
                    } else {
                      // Put back to queue front if no slot can switch now
                      currentStationData.waitingQueue.unshift(nextOrder)
                    }
                  }
              } else {
                console.log(`Capacity gating: not pulling from queue at ${currentStationData.id}`)
              }
            }
            }
            
            // Simplified logic: just follow the processSequence array in order
            const currentIndex = order.processSequence.indexOf(order.currentStation);
            console.log(`${order.kundeName} completed ${order.currentStation}, current index: ${currentIndex}, sequence length: ${order.processSequence.length}`);
            console.log(`${order.kundeName} processSequence:`, order.processSequence);

            if (currentIndex < order.processSequence.length - 1) {
              const nextStationId = order.processSequence[currentIndex + 1];
              const nextStation = updatedStations.find(s => s.id === nextStationId);

              console.log(`${order.kundeName} moving from ${order.currentStation} to ${nextStationId}`, nextStation ? 'station found' : 'STATION NOT FOUND!');
              
              if (nextStation) {
                const phasePrefix: any = nextStationId.startsWith('demontage-') ? 'demontage-' : (nextStationId.startsWith('reassembly-') ? 'reassembly-' : null)
                const phaseFull = phasePrefix === 'demontage-' 
                  ? getActivePhaseCount('demontage-') >= demSlots 
                  : phasePrefix === 'reassembly-' 
                    ? getActivePhaseCount('reassembly-') >= monSlots 
                    : false

                // Determine op type label for slot selection
                const opLabel = nextStation?.name?.replace('Demontage ', '')?.replace('Montage ', '') || nextStationId
                // Try to pick a slot when assigning into demontage/reassembly sub-stations
                let pickedSlot = -1
                if (nextStationId.startsWith('demontage-')) {
                  pickedSlot = pickSlot('DEMONTAGE', opLabel)
                } else if (nextStationId.startsWith('reassembly-')) {
                  pickedSlot = pickSlot('REASSEMBLY', opLabel)
                }

                if (!phaseFull && nextStation.currentOrder === null && (pickedSlot >= 0 || (!nextStationId.startsWith('demontage-') && !nextStationId.startsWith('reassembly-')))) {
                  // Next station is free and phase capacity/slot available
                  nextStation.currentOrder = order;
                  order.currentStation = nextStationId;
                  order.progress = 0;
                  order.isWaiting = false;
                  if (pickedSlot >= 0) {
                    orderPhaseSlotMapRef.current[`${order.id}:${phasePrefix}`] = pickedSlot
                  }
                  console.log(`${order.kundeName} assigned directly to ${nextStationId}`);
                } else {
                  // Busy, phase full or no slot available: enqueue at target station
                  nextStation.waitingQueue = nextStation.waitingQueue || []
                  nextStation.waitingQueue.push(order);
                  order.currentStation = nextStationId;
                  order.progress = 0;
                  order.isWaiting = true;
                  if (!order.stationDurations[nextStationId]) {
                    order.stationDurations[nextStationId] = {
                      expected: nextStation.processingTime,
                      waitingTime: 0,
                      startTime: new Date(),
                      completed: false
                    };
                  }
                  waitingOrdersList.push(order);
                  const reason = phaseFull ? 'phase capacity' : 'busy/slot'
                  console.log(`${order.kundeName} added to waiting queue of ${nextStationId} (${reason})`);
                }
                updatedOrders.push(order); // Make sure order stays in active list
              } else {
                console.error(`Next station ${nextStationId} not found for ${order.kundeName}`);
                updatedOrders.push(order); // Keep order in list even if error
              }
            } else {
              // Order completed
              console.log(`${order.kundeName} completed entire sequence!`);
              order.completedAt = new Date();
              order.schedulingAlgorithm = currentSchedulingAlgorithm;
              newCompletedOrders.push(order);
              // Add to shared context for KPI Dashboard
              addCompletedOrder(order);

              // Buffer completion for potential DB persistence (high priority)
              bufferRef.current.addCompletionUpdate(order.id, new Date(), 'high');
            }
          } else {
            // Order still processing
            updatedOrders.push(order);
          }
        } else if (order.isWaiting) {
          // Order is waiting in queue - track waiting time
          if (order.stationDurations[order.currentStation]) {
            order.stationDurations[order.currentStation].waitingTime = 
              (order.stationDurations[order.currentStation].waitingTime || 0) + deltaMinutes;
          }
          waitingOrdersList.push(order);
        } else {
          // Order not yet assigned to station
          updatedOrders.push(order);
        }
      });
      
      // Update global state - completed orders are now handled by addCompletedOrder in the context
      if (newCompletedOrders.length > 0) {
        console.log(`Completed orders:`, newCompletedOrders.map(o => o.kundeName));
      }
      setWaitingOrders(waitingOrdersList);
      
      // Debug: log order counts
      console.log(`Order counts - Updated: ${updatedOrders.length}, Waiting: ${waitingOrdersList.length}, Completed: ${newCompletedOrders.length}`);
      console.log(`Active orders:`, updatedOrders.map(o => `${o.kundeName}@${o.currentStation}`));
      
      // Update orders list (remove completed orders and avoid duplicates)
      const allActiveOrders = [...updatedOrders];
      // Only add waiting orders that aren't already in updatedOrders
      waitingOrdersList.forEach(waitingOrder => {
        if (!allActiveOrders.find(order => order.id === waitingOrder.id)) {
          allActiveOrders.push(waitingOrder);
        }
      });
      setActiveOrders(allActiveOrders);
      
      return updatedStations;
    });
    
    // Update local stations to match context for flow diagram
    setLocalStations(stations);
    
    // Update the flow diagram to reflect current station status
    updateFlowDiagram();
  };

  const updateStationOrders = () => {
    // This function is now integrated into processOrders for better performance
    updateFlowDiagram();
  };

  // Calculate enriched metrics from Gantt Chart
  const enrichedCompletedOrdersWithMetrics = useMemo(() => {
    const events = [...simEventsRef.current]
    const starts: Record<string, { t:number; activity:string; order_id:string }> = {}
    const segments: Array<{ order_id:string; activity:string; start:number; end:number; duration:number }>=[]

    // Parse all events to get processing segments
    for (const ev of events) {
      const act = ev.activity
      if (typeof act !== 'string') continue
      if (act.endsWith('_START')) {
        const stem = act.slice(0, -6)
        starts[`${ev.order_id}|${stem}`] = { t: ev.t, activity: stem, order_id: ev.order_id }
      } else if (act.endsWith('_END')) {
        const stem = ev.activity.slice(0, -4)
        const s = starts[`${ev.order_id}|${stem}`]
        if (s) {
          segments.push({
            order_id: ev.order_id,
            activity: stem,
            start: s.t,
            end: ev.t,
            duration: Math.max(0, ev.t - s.t)
          })
          delete starts[`${ev.order_id}|${stem}`]
        }
      }
    }

    return completedOrders.map(order => {
      const orderSegments = segments.filter(s => s.order_id === order.id).sort((a, b) => a.start - b.start)
      if (orderSegments.length > 0) {
        const lastEnd = orderSegments[orderSegments.length - 1].end
        const leadTime = lastEnd - 0
        const processingTime = orderSegments.reduce((sum, s) => sum + s.duration, 0)
        const waitingTime = leadTime - processingTime

        return {
          ...order,
          calculatedMetrics: { leadTime, processingTime, waitingTime }
        }
      }
      return order
    })
  }, [completedOrders, simEventsRef.current.length])

  // Prepare data for stacked bar chart
  const prepareChartData = () => {
    return enrichedCompletedOrdersWithMetrics.map((order: any, index) => {
      const metrics = order.calculatedMetrics;
      const processingTime = metrics?.processingTime ?? 0;
      const waitingTime = metrics?.waitingTime ?? 0;

      return {
        name: `${order.kundeName || `${order.customer?.firstName} ${order.customer?.lastName}`}`,
        orderNumber: index + 1,
        Bearbeitungszeit: parseFloat(processingTime.toFixed(1)),
        Wartezeit: parseFloat(waitingTime.toFixed(1))
      };
    });
  };

  // Prepare station utilization data
  const prepareStationUtilizationData = () => {
    try {
      // Return aggregate data for Demontage and Montage phases based on Gantt events
      if (!simulationStartTime) {
        return [
          { name: 'Demontage', station: 'Demontage', utilizationRate: 0, processingTime: 0, totalTime: 0 },
          { name: 'Montage', station: 'Montage', utilizationRate: 0, processingTime: 0, totalTime: 0 }
        ];
      }

      const simDurationMinutes = getSimMinutes()
      if (simDurationMinutes <= 0) {
        return [
          { name: 'Demontage', station: 'Demontage', utilizationRate: 0, processingTime: 0, totalTime: 0 },
          { name: 'Montage', station: 'Montage', utilizationRate: 0, processingTime: 0, totalTime: 0 }
        ];
      }

      // Calculate from Gantt events
      const events = [...simEventsRef.current]
      const starts: Record<string, { t:number; activity:string; order_id:string }> = {}
      const segments: Array<{ order_id:string; phase:string; start:number; end:number; duration:number }>=[]

      for (const ev of events) {
        const act = ev.activity
        if (typeof act !== 'string') continue
        if (act.endsWith('_START')) {
          const stem = act.slice(0, -6)
          const phase = act.startsWith('DEMONTAGE:') ? 'DEMONTAGE' : act.startsWith('MONTAGE:') ? 'MONTAGE' : null
          if (phase) {
            starts[`${ev.order_id}|${stem}`] = { t: ev.t, activity: stem, order_id: ev.order_id }
          }
        } else if (act.endsWith('_END')) {
          const stem = ev.activity.slice(0, -4)
          const s = starts[`${ev.order_id}|${stem}`]
          if (s) {
            const phase = ev.activity.startsWith('DEMONTAGE:') ? 'DEMONTAGE' : ev.activity.startsWith('MONTAGE:') ? 'MONTAGE' : null
            if (phase) {
              segments.push({
                order_id: ev.order_id,
                phase,
                start: s.t,
                end: ev.t,
                duration: Math.max(0, ev.t - s.t)
              })
            }
            delete starts[`${ev.order_id}|${stem}`]
          }
        }
      }

      const demSegments = segments.filter(s => s.phase === 'DEMONTAGE')
      const monSegments = segments.filter(s => s.phase === 'MONTAGE')

      const demTotalBusyTime = demSegments.reduce((sum, seg) => sum + seg.duration, 0)
      const monTotalBusyTime = monSegments.reduce((sum, seg) => sum + seg.duration, 0)

      const demSlotCount = demSlotsRef.current.length || 1
      const monSlotCount = monSlotsRef.current.length || 1

      const demUtilization = (demTotalBusyTime / (simDurationMinutes * demSlotCount)) * 100
      const monUtilization = (monTotalBusyTime / (simDurationMinutes * monSlotCount)) * 100

      return [
        {
          name: 'Demontage',
          station: 'Demontage',
          utilizationRate: parseFloat(demUtilization.toFixed(1)),
          processingTime: parseFloat(demTotalBusyTime.toFixed(1)),
          totalTime: parseFloat(simDurationMinutes.toFixed(1)),
          slotCount: demSlotCount
        },
        {
          name: 'Montage',
          station: 'Montage',
          utilizationRate: parseFloat(monUtilization.toFixed(1)),
          processingTime: parseFloat(monTotalBusyTime.toFixed(1)),
          totalTime: parseFloat(simDurationMinutes.toFixed(1)),
          slotCount: monSlotCount
        }
      ];
    } catch (error) {
      console.error('Error in prepareStationUtilizationData:', error);
      return [
        { name: 'Demontage', station: 'Demontage', utilizationRate: 0, processingTime: 0, totalTime: 0 },
        { name: 'Montage', station: 'Montage', utilizationRate: 0, processingTime: 0, totalTime: 0 }
      ];
    }
  };

  const updateFlowDiagram = () => {
    setNodes(prevNodes => 
      prevNodes.map(node => {
        const station = stations.find(s => s.id === node.id);
        if (station) {
          const isParent = station.id === 'demontage' || station.id === 'reassembly';
          const isDemontage = station.id === 'demontage';
          const isReassembly = station.id === 'reassembly';
          const isSub = station.type === 'SUB';
          
          let title = station.name;
          if (isDemontage) {
            const demontageCount = stations.filter(s => s.type === 'SUB' && s.parent === 'demontage').length;
            title = `${station.name} (${demontageCount} Baugruppentypen)`;
          } else if (isReassembly) {
            const reassemblyCount = stations.filter(s => s.type === 'SUB' && s.parent === 'reassembly').length;
            title = `${station.name} (${reassemblyCount} Baugruppentypen)`;
          }
          
          if (isSub) {
            // Handle sub-station updates with new structure
            const currentOrderName = station.currentOrder?.kundeName || 'Frei';
            const waitingCount = station.waitingQueue?.length || 0;
            const isOccupied = station.currentOrder !== null;
            
            return {
              ...node,
              data: {
                label: (
                  <div className="text-center">
                    <div className="text-xs font-bold text-gray-800">
                      {station.name.replace('Demontage ', '').replace('Montage ', '')}
                    </div>
                    <div className={`text-xs font-medium px-1 py-0.5 rounded mt-1 ${
                      isOccupied 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {isOccupied ? currentOrderName : 'Frei'}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {station.processingTime}min (±{Math.round(station.stochasticVariation * 100)}%)
                    </div>
                    {waitingCount > 0 && (
                      <div className="text-xs bg-orange-100 text-orange-800 px-1 rounded mt-0.5">
                        Warteschlange: {waitingCount}
                      </div>
                    )}
                  </div>
                )
              },
              style: {
                ...node.style,
                background: isOccupied ? '#fef2f2' : (station.parent === 'demontage' ? '#f0f9ff' : '#f0fdf4'),
                border: `2px solid ${isOccupied ? '#dc2626' : (station.parent === 'demontage' ? '#3b82f6' : '#16a34a')}`,
                height: 70
              }
            };
          } else {
            // Handle main station updates
            const currentOrderName = station.currentOrder?.kundeName || '';
            const waitingCount = station.waitingQueue?.length || 0;
            const isOccupied = station.currentOrder !== null;
            
            return {
              ...node,
              data: {
                label: (
                  <div className="text-center">
                    <div className="font-bold">{title}</div>
                    {!isParent && (
                      <>
                        <div className="text-xs text-gray-500">
                          {station.processingTime} min (±{Math.round(station.stochasticVariation * 100)}%)
                        </div>
                        {isOccupied && (
                          <div className="text-xs bg-blue-100 text-blue-800 px-1 rounded mt-1">
                            {currentOrderName}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              }
            };
          }
        }
        return node;
      })
    );
  };

  const handleStationClick = (stationId: string) => {
    // Check if clicking on a phase node
    if (stationId === 'demontage-phase') {
      // Get the variation from any demontage sub-station
      const demSub = stations.find(s => s.id.startsWith('demontage-'));
      setSelectedPhase('demontage');
      setTempPhaseVariation(demSub?.stochasticVariation || 0.3);
      setPhaseDialogOpen(true);
      return;
    }

    if (stationId === 'reassembly-phase') {
      // Get the variation from any reassembly sub-station
      const monSub = stations.find(s => s.id.startsWith('reassembly-'));
      setSelectedPhase('montage');
      setTempPhaseVariation(monSub?.stochasticVariation || 0.25);
      setPhaseDialogOpen(true);
      return;
    }

    const station = stations.find(s => s.id === stationId);
    if (station) {
      if (station.id === 'inspection') {
        // Open inspection-specific dialog
        setInspectionDialogOpen(true);
      } else {
        // Open general station configuration dialog
        setSelectedStation(station);
        setTempProcessingTime(station.processingTime);
        setStationDialogOpen(true);
      }
    }
  };

  const handleSaveStationTime = () => {
    if (selectedStation) {
      setContextStations(prev =>
        prev.map(s =>
          s.id === selectedStation.id
            ? { ...s, processingTime: tempProcessingTime }
            : s
        )
      );
      setLocalStations(prev =>
        prev.map(s =>
          s.id === selectedStation.id
            ? { ...s, processingTime: tempProcessingTime }
            : s
        )
      );
      toast.success(`Bearbeitungszeit für ${selectedStation.name} aktualisiert`);
      setStationDialogOpen(false);
    }
  };

  const handleSavePhaseVariation = () => {
    if (selectedPhase) {
      const prefix = selectedPhase === 'demontage' ? 'demontage-' : 'reassembly-';

      setContextStations(prev =>
        prev.map(s =>
          s.id.startsWith(prefix)
            ? { ...s, stochasticVariation: tempPhaseVariation }
            : s
        )
      );
      setLocalStations(prev =>
        prev.map(s =>
          s.id.startsWith(prefix)
            ? { ...s, stochasticVariation: tempPhaseVariation }
            : s
        )
      );

      const phaseName = selectedPhase === 'demontage' ? 'Demontage' : 'Montage';
      toast.success(`Schwankung für ${phaseName} auf ±${Math.round(tempPhaseVariation * 100)}% aktualisiert`);
      setPhaseDialogOpen(false);
    }
  };

  const handleSpeedChange = (value: number[]) => {
    // Speed range: 0.5x - 20x (previously limited to 4x for latency)
    setSpeed(value[0]);
  };

  const handleCreateNewOrder = async () => {
    if (!activeFactory) return;
    
    try {
      // Use the exact same logic as Auftragsübersicht by calling generateOrders
      const response = await fetch('/api/auftrag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'generateOrders',
          factoryId: activeFactory.id,
          count: 1 // Create just one order
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Reload simulation data to get the new order
        await loadSimulationData();
        toast.success('Neuer Auftrag erfolgreich erstellt');
      } else {
        toast.error(result.error || 'Fehler beim Erstellen des Auftrags');
      }
    } catch (error) {
      console.error('Error creating new order:', error);
      toast.error('Fehler beim Erstellen des neuen Auftrags');
    }
  };

  const handleClearAllOrders = async () => {
    if (!activeFactory) return;
    
    try {
      // Stop the simulation first
      setIsRunning(false);
      
      // Delete orders from database
      const response = await fetch('/api/auftrag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deleteAllOrders',
          factoryId: activeFactory.id
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Clear all orders from simulation - handled by context clearAllData
        
        // Clear all stations - reset their current orders and waiting queues
        setContextStations(prevStations => {
          const clearedStations = prevStations.map(station => ({
            ...station,
            currentOrder: null,
            waitingQueue: []
          }));
          setLocalStations(clearedStations);
          return clearedStations;
        });
        
        // Clear active orders and waiting orders in context
        setActiveOrders([]);
        setWaitingOrders([]);
        deliveryMetricsSinceRef.current = Date.now();
        setDeliveryMetrics(null);
        setDeliveryMetricsError(null);
        
        // Reset simulation time
        setSimulationTime(new Date());
        setSimulationStartTime(new Date());
        
        // Force refresh of the entire app to update Auftragsübersicht
        router.refresh();
        
        toast.success(`Alle Aufträge gelöscht (${result.deletedCount} aus Datenbank)`);
      } else {
        toast.error(result.error || 'Fehler beim Löschen der Aufträge');
      }
    } catch (error) {
      console.error('Error deleting orders:', error);
      toast.error('Fehler beim Löschen der Aufträge');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Simulationsdaten...</p>
        </div>
      </div>
    );
  }

  // Data Dashboard view
  if (currentView === 'kpi') {
    return (
      <div className="space-y-4">
        {/* Go back button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setCurrentView('simulation')}
            variant="outline"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück zur Simulation
          </Button>
        </div>
        
        {/* Data Dashboard */}
        {(() => {
          // Calculate KPIs from Gantt Chart events
          const events = [...simEventsRef.current]
          const starts: Record<string, { t:number; activity:string; order_id:string }> = {}
          const segments: Array<{ order_id:string; activity:string; start:number; end:number; duration:number }>=[]

          // Parse all events to get processing segments
          for (const ev of events) {
            const act = ev.activity
            if (typeof act !== 'string') continue
            if (act.endsWith('_START')) {
              const stem = act.slice(0, -6)
              starts[`${ev.order_id}|${stem}`] = { t: ev.t, activity: stem, order_id: ev.order_id }
            } else if (act.endsWith('_END')) {
              const stem = ev.activity.slice(0, -4)
              const s = starts[`${ev.order_id}|${stem}`]
              if (s) {
                segments.push({
                  order_id: ev.order_id,
                  activity: stem,
                  start: s.t,
                  end: ev.t,
                  duration: Math.max(0, ev.t - s.t)
                })
                delete starts[`${ev.order_id}|${stem}`]
              }
            }
          }

          // Calculate metrics per order
          const completedOrderIds = completedOrders.map(o => o.id)
          let totalProcessingTimeMinutes = 0
          let totalWaitingTimeMinutes = 0
          let totalLeadTimeMinutes = 0

          completedOrderIds.forEach(orderId => {
            // Get all segments for this order, sorted by start time
            const orderSegments = segments.filter(s => s.order_id === orderId).sort((a, b) => a.start - b.start)
            if (orderSegments.length === 0) return

            // Lead time = from simulation start (t=0) to last segment end
            const lastEnd = orderSegments[orderSegments.length - 1].end
            const leadTime = lastEnd - 0  // Start from simulation start (t=0)

            // Processing time = sum of all segment durations
            const processingTime = orderSegments.reduce((sum, s) => sum + s.duration, 0)

            // Waiting time = lead time - processing time
            // This includes: waiting before first segment + all gaps between segments
            const waitingTime = leadTime - processingTime

            // console.log(`📊 Order ${orderId.slice(-4)}: Lead=${leadTime.toFixed(1)}min, Process=${processingTime.toFixed(1)}min, Wait=${waitingTime.toFixed(1)}min (${orderSegments.length} segments)`)

            totalLeadTimeMinutes += leadTime
            totalProcessingTimeMinutes += processingTime
            totalWaitingTimeMinutes += waitingTime
          })

          const avgProcessingTime = completedOrders.length > 0 ? totalProcessingTimeMinutes / completedOrders.length : 0
          const avgWaitingTime = completedOrders.length > 0 ? totalWaitingTimeMinutes / completedOrders.length : 0
          const avgLeadTime = completedOrders.length > 0 ? totalLeadTimeMinutes / completedOrders.length : 0

          // Calculate utilization for Demontage and Montage phases
          const simDurationMinutes = getSimMinutes()
          const demSlotCount = demSlotsRef.current.length || 1
          const monSlotCount = monSlotsRef.current.length || 1

          // Get segments for each phase
          const demSegments = segments.filter(s => {
            const ev = events.find(e => e.order_id === s.order_id && e.t === s.start)
            return ev && typeof ev.activity === 'string' && ev.activity.startsWith('DEMONTAGE:')
          })
          const monSegments = segments.filter(s => {
            const ev = events.find(e => e.order_id === s.order_id && e.t === s.start)
            return ev && typeof ev.activity === 'string' && ev.activity.startsWith('MONTAGE:')
          })

          const demTotalBusyTime = demSegments.reduce((sum, seg) => sum + seg.duration, 0)
          const monTotalBusyTime = monSegments.reduce((sum, seg) => sum + seg.duration, 0)

          const demUtilization = simDurationMinutes > 0 && demSlotCount > 0
            ? (demTotalBusyTime / (simDurationMinutes * demSlotCount)) * 100
            : 0
          const monUtilization = simDurationMinutes > 0 && monSlotCount > 0
            ? (monTotalBusyTime / (simDurationMinutes * monSlotCount)) * 100
            : 0

          // Create enriched orders with calculated metrics
          const enrichedCompletedOrders = completedOrders.map(order => {
            const orderSegments = segments.filter(s => s.order_id === order.id).sort((a, b) => a.start - b.start)
            if (orderSegments.length > 0) {
              // Lead time = from simulation start (t=0) to last segment end
              const lastEnd = orderSegments[orderSegments.length - 1].end
              const leadTime = lastEnd - 0  // Start from simulation start (t=0)

              // Processing time = sum of all segment durations
              const processingTime = orderSegments.reduce((sum, s) => sum + s.duration, 0)

              // Waiting time = lead time - processing time
              // This includes: waiting before first segment + all gaps between segments
              const waitingTime = leadTime - processingTime

              // Create station-level data from Gantt segments
              const ganttStationData: Record<string, { processingTime: number; waitingTime: number; startTime: number }> = {}

              orderSegments.forEach((seg, idx) => {
                // Map activity to station ID
                let stationId = 'unknown'
                if (seg.activity.includes('ACCEPTANCE')) stationId = 'order-acceptance'
                else if (seg.activity.includes('INSPECTION')) stationId = 'inspection'
                else if (seg.activity.includes('DEMONTAGE:')) stationId = 'demontage'
                else if (seg.activity.includes('MONTAGE:')) stationId = 'reassembly'
                else if (seg.activity.includes('QA')) stationId = 'quality'
                else if (seg.activity.includes('SHIPPING')) stationId = 'shipping'

                // Calculate waiting time before this segment
                const waitBefore = idx === 0 ? seg.start : (seg.start - orderSegments[idx - 1].end)

                if (!ganttStationData[stationId]) {
                  ganttStationData[stationId] = { processingTime: 0, waitingTime: 0, startTime: seg.start }
                }

                ganttStationData[stationId].processingTime += seg.duration
                if (waitBefore > 0 && idx > 0) {
                  // Attribute waiting time to the station where we're waiting to enter
                  ganttStationData[stationId].waitingTime += waitBefore
                }
              })

              return {
                ...order,
                calculatedMetrics: {
                  leadTime,
                  processingTime,
                  waitingTime
                },
                ganttStationData
              }
            }
            return order
          })

          return (
            <AdvancedKPIDashboard
              orders={activeOrders}
              completedOrders={enrichedCompletedOrders as any}
              stations={stations}
              onClearData={handleClearAllOrders}
              calculatedKPIs={{
                avgProcessingTime,
                avgWaitingTime,
                avgLeadTime,
                demUtilization,
                monUtilization,
                totalProcessingTime: totalProcessingTimeMinutes,
                totalWaitingTime: totalWaitingTimeMinutes,
                totalLeadTime: totalLeadTimeMinutes
              }}
            />
          )
        })()}

        {/* Simple Gantt (beta): recent segments */}
        {/* Gantt Tabelle (letzte Segmente) - AUSGEBLENDET */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Gantt Tabelle – letzte Segmente</CardTitle>
          </CardHeader>
          <CardContent key={`gtab-${ganttRefreshKey}`}>
            {(() => {
              try {
                const events = [...simEventsRef.current]
                const starts: Record<string, { t:number; activity:string; slot?:number|null; order_id:string }> = {}
                const segments: Array<{ order_id:string; phase:string; sub_op:string; slot?:number|null; start:number; end:number; duration:number }>=[]
                for (const ev of events) {
                  const act = ev.activity
                  if (typeof act !== 'string') continue
                  if (act.endsWith('_START')) {
                    const stem = act.slice(0, -6)
                    starts[`${ev.order_id}|${stem}|${ev.slot ?? 'noslot'}`] = { t: ev.t, activity: stem, slot: ev.slot ?? null, order_id: ev.order_id }
                  } else if (act.endsWith('_END')) {
                    const stem = ev.activity.slice(0, -4)
                    const key = `${ev.order_id}|${stem}|${ev.slot ?? 'noslot'}`
                    const s = starts[key]
                    if (s) {
                      const parts = stem.split(':')
                      const phase = parts[0] || 'PHASE'
                      const sub = parts[1] || phase
                      segments.push({ order_id: ev.order_id, phase, sub_op: sub, slot: ev.slot ?? null, start: s.t, end: ev.t, duration: Math.max(0, ev.t - s.t) })
                      delete starts[key]
                    }
                  }
                }
                segments.sort((a,b)=> a.order_id.localeCompare(b.order_id) || a.start - b.start)
                const recent = segments.slice(-30).reverse()
                if (recent.length === 0) return <div className="text-sm text-muted-foreground">Noch keine Segmente erfasst.</div>
                return (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1 pr-2">Order</th>
                          <th className="py-1 pr-2">Phase</th>
                          <th className="py-1 pr-2">Sub‑Op</th>
                          <th className="py-1 pr-2">Slot</th>
                          <th className="py-1 pr-2">Start</th>
                          <th className="py-1 pr-2">Ende</th>
                          <th className="py-1 pr-2">Dauer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((seg, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1 pr-2 font-mono">{seg.order_id.slice(0,8)}</td>
                            <td className="py-1 pr-2">{seg.phase}</td>
                            <td className="py-1 pr-2">{seg.sub_op}</td>
                            <td className="py-1 pr-2">{seg.slot ?? '-'}</td>
                            <td className="py-1 pr-2">{seg.start}m</td>
                            <td className="py-1 pr-2">{seg.end}m</td>
                            <td className="py-1 pr-2">{seg.duration}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              } catch (e) {
                console.error('Gantt table render error', e)
                return <div className="text-sm text-red-500">Fehler beim Rendern der Gantt‑Tabelle.</div>
              }
            })()}
          </CardContent>
        </Card> */}

        {/* Gantt Plot */}
        <Card>
          <CardHeader>
            <CardTitle>Gantt – Unter‑Operationen</CardTitle>
          </CardHeader>
          <CardContent key={`gplot-${ganttRefreshKey}`}>
            {(() => {
              try {
                const events = [...simEventsRef.current]
                const starts: Record<string, { t:number; activity:string; slot?:number|null; order_id:string }> = {}
                const segs: Array<{ order_id:string; phase:string; sub_op:string; slot?:number|null; start:number; end:number; duration:number }>=[]
                for (const ev of events) {
                  const act = ev.activity
                  if (typeof act !== 'string') continue
                  if (act.endsWith('_START')) {
                    const stem = act.slice(0, -6)
                    starts[`${ev.order_id}|${stem}|${ev.slot ?? 'noslot'}`] = { t: ev.t, activity: stem, slot: ev.slot ?? null, order_id: ev.order_id }
                  } else if (act.endsWith('_END')) {
                    const stem = ev.activity.slice(0, -4)
                    const key = `${ev.order_id}|${stem}|${ev.slot ?? 'noslot'}`
                    const s = starts[key]
                    if (s) {
                      const parts = stem.split(':')
                      const phase = parts[0] || 'PHASE'
                      const sub = parts[1] || phase
                      segs.push({ order_id: ev.order_id, phase, sub_op: sub, slot: ev.slot ?? null, start: s.t, end: ev.t, duration: Math.max(0, ev.t - s.t) })
                      delete starts[key]
                    }
                  }
                }
                if (segs.length === 0) return <div className="text-sm text-muted-foreground">Noch keine Segmente erfasst.</div>
                const maxEnd = Math.max(...segs.map(s => s.end)) || 1
                const grouped: Record<string, typeof segs> = {}
                segs.forEach(s => { (grouped[s.order_id] ||= []).push(s) })
                Object.values(grouped).forEach(arr => arr.sort((a,b)=> a.start - b.start))
                const colorFor = (p: string) => {
                  if (p.startsWith('QUEUE_WAIT')) return '#f59e0b' // Orange for queue waiting
                  if (p.startsWith('DEMONTAGE')) return '#2563eb' // Blue for demontage
                  if (p.startsWith('MONTAGE')) return '#16a34a' // Green for montage
                  return '#6b7280' // Gray for others
                }

                // Helper: Get customer name from order_id
                const getCustomerName = (orderId: string) => {
                  const order = activeOrders.find(o => o.id === orderId) || completedOrders.find(o => o.id === orderId)
                  if (order?.kundeName) {
                    // Shorten name: "Michael Williams" -> "Michael W."
                    const parts = order.kundeName.split(' ')
                    if (parts.length >= 2) return `${parts[0]} ${parts[1].charAt(0)}.`
                    return order.kundeName
                  }
                  return orderId.slice(0,8)
                }

                // Generate time axis ticks
                const tickInterval = Math.ceil(maxEnd / 10) // Aim for ~10 ticks
                const ticks: number[] = []
                for (let t = 0; t <= maxEnd; t += tickInterval) {
                  ticks.push(t)
                }
                if (ticks[ticks.length - 1] < maxEnd) ticks.push(maxEnd)

                return (
                  <div className="space-y-3">
                    {/* Legend */}
                    <div className="flex gap-4 text-xs items-center border-b pb-2 mb-2">
                      <span className="font-semibold">Legende:</span>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-3 rounded" style={{ background: '#f59e0b' }}></div>
                        <span>Warteschlange</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-3 rounded" style={{ background: '#2563eb' }}></div>
                        <span>Demontage</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-3 rounded" style={{ background: '#16a34a' }}></div>
                        <span>Montage</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-3 rounded" style={{ background: '#6b7280' }}></div>
                        <span>Andere</span>
                      </div>
                    </div>

                    {Object.entries(grouped).map(([oid, arr], idx) => {
                      // Collect unique sub-operations for this order
                      const subOps = [...new Set(arr.map(s => s.sub_op))].join(', ')
                      return (
                        <div key={oid} className="relative border rounded p-2 bg-white">
                          <div className="absolute -left-1 -top-2 text-[10px] font-mono bg-gray-100 px-1 rounded border">
                            #{idx+1} {getCustomerName(oid)}
                          </div>
                          <div className="text-[9px] text-gray-600 mb-1 pl-1">{subOps}</div>
                          <div className="relative h-8 w-full">
                            {arr.map((s,i) => {
                              const barId = `${oid}-${i}`
                              const isBarHovered = hoveredOrderRow === barId
                              return (
                                <div
                                  key={i}
                                  className="absolute rounded transition-all cursor-pointer"
                                  style={{
                                    left: `${(s.start/maxEnd)*100}%`,
                                    width: `${(s.duration/maxEnd)*100}%`,
                                    top: isBarHovered ? 2 : 8,
                                    height: isBarHovered ? '24px' : '12px',
                                    background: colorFor(s.phase),
                                    zIndex: isBarHovered ? 50 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  onMouseEnter={() => setHoveredOrderRow(barId)}
                                  onMouseLeave={() => setHoveredOrderRow(null)}
                                  title={`${s.phase}:${s.sub_op}\nStart: ${s.start.toFixed(1)}m\nDauer: ${s.duration.toFixed(1)}m\nEnde: ${s.end.toFixed(1)}m`}
                                >
                                  {isBarHovered && (
                                    <span className="text-[9px] text-black font-semibold px-1 bg-white/90 rounded truncate whitespace-nowrap">
                                      {s.sub_op}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {/* Time Axis */}
                    <div className="relative w-full h-6 border-t pt-1">
                      {ticks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${(tick/maxEnd)*100}%`, transform: 'translateX(-50%)' }}
                        >
                          <div className="w-px h-2 bg-gray-400"></div>
                          <span className="text-[9px] text-gray-600 font-mono">{tick.toFixed(0)}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              } catch (e) {
                console.error('Gantt render error', e)
                return <div className="text-sm text-red-500">Fehler beim Rendern des Gantt.</div>
              }
            })()}
          </CardContent>
        </Card>


        {/* Demontage Slot Capacity Gantt */}
        <Card>
          <CardHeader>
            <CardTitle>Demontage Slot Capacity</CardTitle>
          </CardHeader>
          <CardContent key={`dem-slot-gantt-${ganttRefreshKey}`}>
            {(() => {
              try {
                // Helper: Generate consistent color for each Baugruppe
                const getColorForBaugruppe = (baugruppe: string): string => {
                  // Simple hash function
                  let hash = 0
                  for (let i = 0; i < baugruppe.length; i++) {
                    hash = baugruppe.charCodeAt(i) + ((hash << 5) - hash)
                  }

                  // Generate HSL color with good saturation and lightness
                  const hue = Math.abs(hash) % 360
                  const saturation = 65 + (Math.abs(hash) % 20) // 65-85%
                  const lightness = 45 + (Math.abs(hash >> 8) % 15) // 45-60%

                  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
                }

                const events = [...simEventsRef.current]
                const starts: Record<string, { t:number; activity:string; order_id:string }> = {}
                const segs: Array<{ slot:number; sub_op:string; order_id:string; start:number; end:number; duration:number }>=[]

                // Filter for DEMONTAGE events with slots
                for (const ev of events) {
                  const act = ev.activity
                  if (typeof act !== 'string' || !act.startsWith('DEMONTAGE:') || ev.slot == null) continue

                  if (act.endsWith('_START')) {
                    const stem = act.slice(0, -6)
                    const key = `${ev.order_id}|${stem}|${ev.slot}`
                    starts[key] = { t: ev.t, activity: stem, order_id: ev.order_id }
                  } else if (act.endsWith('_END')) {
                    const stem = ev.activity.slice(0, -4)
                    const key = `${ev.order_id}|${stem}|${ev.slot}`
                    const s = starts[key]
                    if (s && ev.slot != null) {
                      const sub = stem.split(':')[1] || stem
                      segs.push({ slot: ev.slot, sub_op: sub, order_id: ev.order_id, start: s.t, end: ev.t, duration: Math.max(0, ev.t - s.t) })
                      delete starts[key]
                    }
                  }
                }

                if (segs.length === 0) return <div className="text-sm text-muted-foreground">Noch keine Demontage-Slot-Operationen erfasst.</div>

                const maxEnd = Math.max(...segs.map(s => s.end)) || 1
                const slotGroups: Record<number, typeof segs> = {}
                segs.forEach(s => { (slotGroups[s.slot] ||= []).push(s) })
                Object.values(slotGroups).forEach(arr => arr.sort((a,b)=> a.start - b.start))

                // Helper: Get shortened customer name
                const getShortCustomerName = (orderId: string) => {
                  const order = activeOrders.find(o => o.id === orderId) || completedOrders.find(o => o.id === orderId)
                  if (order?.kundeName) {
                    const parts = order.kundeName.split(' ')
                    if (parts.length >= 2) return `${parts[0].charAt(0)}.${parts[1].charAt(0)}.`
                    return order.kundeName.substring(0, 4)
                  }
                  return orderId.slice(-4)
                }

                const slotIndices = Object.keys(slotGroups).map(Number).sort((a,b)=>a-b)

                // Generate time axis ticks
                const tickInterval = Math.ceil(maxEnd / 10) // Aim for ~10 ticks
                const ticks: number[] = []
                for (let t = 0; t <= maxEnd; t += tickInterval) {
                  ticks.push(t)
                }
                if (ticks[ticks.length - 1] < maxEnd) ticks.push(maxEnd)

                return (
                  <div className="space-y-2">
                    {slotIndices.map(slotIdx => {
                      const arr = slotGroups[slotIdx]
                      const slotInfo = demSlotsRef.current[slotIdx]
                      const isFlex = slotInfo?.flex ?? false
                      return (
                        <div key={slotIdx} className="relative border rounded p-2 bg-white">
                          <div className="absolute -left-1 -top-2 text-[10px] font-mono bg-blue-100 px-1 rounded border text-blue-700">
                            Slot {slotIdx} {isFlex ? '(Flexibel)' : '(Starr)'}
                          </div>
                          <div className="relative h-10 w-full">
                            {arr.map((s,i) => {
                              const barId = `dem-${slotIdx}-${i}`
                              const isBarHovered = hoveredDemSlot === barId
                              return (
                                <div
                                  key={i}
                                  className="absolute rounded flex flex-col items-center justify-center font-medium transition-all cursor-pointer"
                                  style={{
                                    left: `${(s.start/maxEnd)*100}%`,
                                    width: `${(s.duration/maxEnd)*100}%`,
                                    top: isBarHovered ? 0 : 4,
                                    height: isBarHovered ? '40px' : '24px',
                                    background: getColorForBaugruppe(s.sub_op),
                                    zIndex: isBarHovered ? 50 : 1
                                  }}
                                  onMouseEnter={() => setHoveredDemSlot(barId)}
                                  onMouseLeave={() => setHoveredDemSlot(null)}
                                  title={`${s.sub_op} - ${getShortCustomerName(s.order_id)}\nStart: ${s.start.toFixed(1)}m\nDauer: ${s.duration.toFixed(1)}m\nEnde: ${s.end.toFixed(1)}m`}
                                >
                                  {isBarHovered && (
                                    <>
                                      <span className="text-[10px] text-black font-semibold bg-white/95 px-1 rounded leading-tight">
                                        {getShortCustomerName(s.order_id)}
                                      </span>
                                      <span className="text-[9px] text-black font-medium bg-white/95 px-1 rounded leading-tight mt-0.5">
                                        {s.sub_op}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {/* Time Axis */}
                    <div className="relative w-full h-6 border-t pt-1">
                      {ticks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${(tick/maxEnd)*100}%`, transform: 'translateX(-50%)' }}
                        >
                          <div className="w-px h-2 bg-gray-400"></div>
                          <span className="text-[9px] text-gray-600 font-mono">{tick.toFixed(0)}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              } catch (e) {
                console.error('Demontage slot gantt render error', e)
                return <div className="text-sm text-red-500">Fehler beim Rendern des Demontage-Slot-Gantt.</div>
              }
            })()}
          </CardContent>
        </Card>

        {/* Montage Slot Capacity Gantt */}
        <Card>
          <CardHeader>
            <CardTitle>Montage Slot Capacity</CardTitle>
          </CardHeader>
          <CardContent key={`mon-slot-gantt-${ganttRefreshKey}`}>
            {(() => {
              try {
                // Helper: Generate consistent color for each Baugruppe
                const getColorForBaugruppe = (baugruppe: string): string => {
                  // Simple hash function
                  let hash = 0
                  for (let i = 0; i < baugruppe.length; i++) {
                    hash = baugruppe.charCodeAt(i) + ((hash << 5) - hash)
                  }

                  // Generate HSL color with good saturation and lightness
                  const hue = Math.abs(hash) % 360
                  const saturation = 65 + (Math.abs(hash) % 20) // 65-85%
                  const lightness = 45 + (Math.abs(hash >> 8) % 15) // 45-60%

                  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
                }

                const events = [...simEventsRef.current]
                const starts: Record<string, { t:number; activity:string; order_id:string }> = {}
                const segs: Array<{ slot:number; sub_op:string; order_id:string; start:number; end:number; duration:number }>=[]

                // Filter for MONTAGE events with slots
                for (const ev of events) {
                  const act = ev.activity
                  if (typeof act !== 'string' || !act.startsWith('MONTAGE:') || ev.slot == null) continue

                  if (act.endsWith('_START')) {
                    const stem = act.slice(0, -6)
                    const key = `${ev.order_id}|${stem}|${ev.slot}`
                    starts[key] = { t: ev.t, activity: stem, order_id: ev.order_id }
                  } else if (act.endsWith('_END')) {
                    const stem = ev.activity.slice(0, -4)
                    const key = `${ev.order_id}|${stem}|${ev.slot}`
                    const s = starts[key]
                    if (s && ev.slot != null) {
                      const sub = stem.split(':')[1] || stem
                      segs.push({ slot: ev.slot, sub_op: sub, order_id: ev.order_id, start: s.t, end: ev.t, duration: Math.max(0, ev.t - s.t) })
                      delete starts[key]
                    }
                  }
                }

                if (segs.length === 0) return <div className="text-sm text-muted-foreground">Noch keine Montage-Slot-Operationen erfasst.</div>

                const maxEnd = Math.max(...segs.map(s => s.end)) || 1
                const slotGroups: Record<number, typeof segs> = {}
                segs.forEach(s => { (slotGroups[s.slot] ||= []).push(s) })
                Object.values(slotGroups).forEach(arr => arr.sort((a,b)=> a.start - b.start))

                // Helper: Get shortened customer name
                const getShortCustomerName = (orderId: string) => {
                  const order = activeOrders.find(o => o.id === orderId) || completedOrders.find(o => o.id === orderId)
                  if (order?.kundeName) {
                    const parts = order.kundeName.split(' ')
                    if (parts.length >= 2) return `${parts[0].charAt(0)}.${parts[1].charAt(0)}.`
                    return order.kundeName.substring(0, 4)
                  }
                  return orderId.slice(-4)
                }

                const slotIndices = Object.keys(slotGroups).map(Number).sort((a,b)=>a-b)

                // Generate time axis ticks
                const tickInterval = Math.ceil(maxEnd / 10) // Aim for ~10 ticks
                const ticks: number[] = []
                for (let t = 0; t <= maxEnd; t += tickInterval) {
                  ticks.push(t)
                }
                if (ticks[ticks.length - 1] < maxEnd) ticks.push(maxEnd)

                return (
                  <div className="space-y-2">
                    {slotIndices.map(slotIdx => {
                      const arr = slotGroups[slotIdx]
                      const slotInfo = monSlotsRef.current[slotIdx]
                      const isFlex = slotInfo?.flex ?? false
                      return (
                        <div key={slotIdx} className="relative border rounded p-2 bg-white">
                          <div className="absolute -left-1 -top-2 text-[10px] font-mono bg-green-100 px-1 rounded border text-green-700">
                            Slot {slotIdx} {isFlex ? '(Flexibel)' : '(Starr)'}
                          </div>
                          <div className="relative h-10 w-full">
                            {arr.map((s,i) => {
                              const barId = `mon-${slotIdx}-${i}`
                              const isBarHovered = hoveredMonSlot === barId
                              return (
                                <div
                                  key={i}
                                  className="absolute rounded flex flex-col items-center justify-center font-medium transition-all cursor-pointer"
                                  style={{
                                    left: `${(s.start/maxEnd)*100}%`,
                                    width: `${(s.duration/maxEnd)*100}%`,
                                    top: isBarHovered ? 0 : 4,
                                    height: isBarHovered ? '40px' : '24px',
                                    background: getColorForBaugruppe(s.sub_op),
                                    zIndex: isBarHovered ? 50 : 1
                                  }}
                                  onMouseEnter={() => setHoveredMonSlot(barId)}
                                  onMouseLeave={() => setHoveredMonSlot(null)}
                                  title={`${s.sub_op} - ${getShortCustomerName(s.order_id)}\nStart: ${s.start.toFixed(1)}m\nDauer: ${s.duration.toFixed(1)}m\nEnde: ${s.end.toFixed(1)}m`}
                                >
                                  {isBarHovered && (
                                    <>
                                      <span className="text-[10px] text-black font-semibold bg-white/95 px-1 rounded leading-tight">
                                        {getShortCustomerName(s.order_id)}
                                      </span>
                                      <span className="text-[9px] text-black font-medium bg-white/95 px-1 rounded leading-tight mt-0.5">
                                        {s.sub_op}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {/* Time Axis */}
                    <div className="relative w-full h-6 border-t pt-1">
                      {ticks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute flex flex-col items-center"
                          style={{ left: `${(tick/maxEnd)*100}%`, transform: 'translateX(-50%)' }}
                        >
                          <div className="w-px h-2 bg-gray-400"></div>
                          <span className="text-[9px] text-gray-600 font-mono">{tick.toFixed(0)}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              } catch (e) {
                console.error('Montage slot gantt render error', e)
                return <div className="text-sm text-red-500">Fehler beim Rendern des Montage-Slot-Gantt.</div>
              }
            })()}
          </CardContent>
        </Card>

      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 h-full">
      {/* Main Content - Left Side */}
      <div className="xl:col-span-3 space-y-4">
        {/* Control Panel */}
        <Card>
          <CardContent className="pt-3 space-y-2">
            {/* Steuerung Section */}
            <div className="p-2 bg-gray-50 border rounded space-y-2">
              <div className="text-xs font-semibold text-gray-700">Steuerung</div>

              {/* Control Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  onClick={() => {
                    if (!isRunning && !simulationStartTime) {
                      setSimulationStartTime(simulationTime);
                      console.log('Simulation FIRST start at:', simulationTime.toISOString());
                    } else if (!isRunning) {
                      console.log('Simulation resumed, keeping original start time');
                    }
                    setIsRunning(!isRunning);
                  }}
                  className={isRunning ? "" : "bg-blue-600 hover:bg-blue-700"}
                  variant={isRunning ? "destructive" : "default"}
                  size="sm"
                >
                  {isRunning ? (
                    <>
                      <Pause className="h-3 w-3 mr-1" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => {
                    setIsRunning(false);

                    // IMPORTANT: Release all slots before clearing state
                    demActivesRef.current.forEach(a => {
                      releaseSlot('DEMONTAGE', a.slotIdx)
                    })
                    monActivesRef.current.forEach(a => {
                      releaseSlot('REASSEMBLY', a.slotIdx)
                    })

                    demActivesRef.current = []
                    monActivesRef.current = []
                    orderPhaseSlotMapRef.current = {}

                    setActiveOrders([]);
                    setCompletedOrders([]);
                    setSimulationTime(new Date());
                    setSimulationStartTime(null);
                    console.log('Simulation STOPPED and RESET - Slots released');
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Square className="h-3 w-3 mr-1" />
                  Stop
                </Button>

                <Button
                  onClick={loadSimulationData}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Neu laden
                </Button>

                <Button
                  onClick={handleCreateNewOrder}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!activeFactory}
                  size="sm"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Neuer Auftrag
                </Button>

                <Button
                  onClick={handleClearAllOrders}
                  className="bg-white text-[#1a48a5] border-[#1a48a5] hover:bg-[#1a48a5]/5"
                  variant="outline"
                  disabled={activeOrders.length === 0 && completedOrders.length === 0}
                  size="sm"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Alle Aufträge löschen
                </Button>

                <Button
                  onClick={() => setCurrentView('kpi')}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <BarChart3 className="h-3 w-3 mr-1" />
                  Data
                </Button>
              </div>

              {/* Speed, Time and Algorithms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 pt-1.5 border-t">
                {/* Speed */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Geschwindigkeit:</Label>
                  <Slider
                    value={[speed]}
                    onValueChange={handleSpeedChange}
                    min={0.5}
                    max={100}
                    step={0.5}
                    className="w-24"
                  />
                  <span className="text-xs font-medium w-8">{speed}x</span>
                </div>

                {/* Time */}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-gray-600" />
                  <span className="font-mono text-[11px]">
                    {simulationTime.toLocaleString('de-DE')}
                  </span>
                </div>

                {/* Terminierung */}
                <div className="space-y-1">
                  <Label className="text-xs">Terminierung Bundle</Label>
                  <div className="flex gap-1">
                    <Select
                      value={selectedBundleId}
                      onValueChange={async (bundleId) => {
                        setSelectedBundleId(bundleId);
                        // Activate the selected bundle
                        if (activeFactory) {
                          const result = await setActiveAlgorithmBundle(bundleId, activeFactory.id);
                          if (result.success) {
                            toast.success('Bundle aktiviert');
                            loadAlgorithmBundles(); // Reload to update active state
                          } else {
                            toast.error(result.error || 'Fehler beim Aktivieren');
                          }
                        }
                      }}
                      disabled={loadingBundles}
                    >
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder={loadingBundles ? "Lade..." : "Bundle auswählen..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {algorithmBundles.map((bundle) => (
                          <SelectItem key={bundle.id} value={bundle.id}>
                            {bundle.name} {bundle.isActive && '(Aktiv)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setTerminierungModalOpen(true)}
                      title="Terminierung Einstellungen"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Beschaffungsplanung */}
                <div className="space-y-1">
                  <Label className="text-xs">Beschaffungsplanung</Label>
                  <Select value="none" disabled>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue placeholder="Wähle Algorithmus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        --- Leer ---
                      </SelectItem>
                      <SelectItem value="empty1" disabled>
                        --- Leer ---
                      </SelectItem>
                      <SelectItem value="empty2" disabled>
                        --- Leer ---
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="border-t pt-2">
              <Button
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs"
              >
                <span>Erweiterte Einstellungen (Kapazität, Flexibilität, Rüstzeit)</span>
                {showAdvancedSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {/* Phase Capacity & Flexibility Settings - Collapsible */}
            {showAdvancedSettings && (
            <TooltipProvider>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 bg-gray-50 border rounded">
                {/* Demontage Section */}
                <div className="space-y-2 p-2 bg-white border rounded">
                  <div className="font-semibold text-xs text-blue-700 border-b pb-1">Demontage</div>

                  {/* Demontage Kapazität */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Kapazität</Label>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Anzahl der parallelen Demontage-Slots (Arbeitsplätze)</p>
                        </TooltipContent>
                      </UITooltip>
                    </div>
                    <Input
                      type="number"
                      className="w-20 h-8 text-xs"
                      min={0}
                      max={50}
                      value={demSlots}
                      onChange={(e) => setDemSlots(Math.max(0, Number(e.target.value)))}
                    />
                  </div>

                  {/* Demontage Flexibilität */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Flexibilitätsgrad</Label>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Prozentsatz der Slots, die flexibel für verschiedene Baugruppen-Typen einsetzbar sind</p>
                        </TooltipContent>
                      </UITooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[demFlexSharePct]}
                        onValueChange={(v) => setDemFlexSharePct(v[0])}
                        min={0}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-xs font-medium w-10 text-right">{demFlexSharePct}%</span>
                    </div>
                  </div>
                </div>

                {/* Montage Section */}
                <div className="space-y-2 p-2 bg-white border rounded">
                  <div className="font-semibold text-xs text-green-700 border-b pb-1">Montage</div>

                  {/* Montage Kapazität */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Kapazität</Label>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Anzahl der parallelen Montage-Slots (Arbeitsplätze)</p>
                        </TooltipContent>
                      </UITooltip>
                    </div>
                    <Input
                      type="number"
                      className="w-20 h-8 text-xs"
                      min={0}
                      max={50}
                      value={monSlots}
                      onChange={(e) => setMonSlots(Math.max(0, Number(e.target.value)))}
                    />
                  </div>

                  {/* Montage Flexibilität */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Flexibilitätsgrad</Label>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Prozentsatz der Slots, die flexibel für verschiedene Baugruppen-Typen einsetzbar sind</p>
                        </TooltipContent>
                      </UITooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[monFlexSharePct]}
                        onValueChange={(v) => setMonFlexSharePct(v[0])}
                        min={0}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-xs font-medium w-10 text-right">{monFlexSharePct}%</span>
                    </div>
                  </div>
                </div>

                {/* Rüstzeit Section - Full Width */}
                <div className="md:col-span-2 space-y-1 p-2 bg-white border rounded">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Rüstzeit (Stunden)</Label>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">Zeit für Umrüstung zwischen verschiedenen Baugruppen-Typen an einem Slot</p>
                      </TooltipContent>
                    </UITooltip>
                  </div>
                  <Input
                    type="number"
                    className="w-20 h-8 text-xs"
                    min={0}
                    max={12}
                    step={0.5}
                    value={setupTimeHours}
                    onChange={(e) => setSetupTimeHours(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>
            </TooltipProvider>
            )}

            {/* Debug Panel Toggle */}
            <div className="border-t pt-2">
              <Button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs"
              >
                <span>Debug Panel</span>
                {showDebugPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {/* Debug Info Panel - Collapsible */}
            {showDebugPanel && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3" key={debugRefreshKey}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-yellow-900">🔍 Debug Info (Live)</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowDebugInfo(!showDebugInfo)}
                  >
                    {showDebugInfo ? 'Ausblenden' : 'Einblenden'}
                  </Button>
                </div>

                {showDebugInfo && (
                  <div className="space-y-3">

                {/* Queue Status - GANZ OBEN */}
                <div className="mb-3 border-2 border-green-600 bg-green-50 p-3 rounded">
                  <div className="text-sm font-bold text-green-900 mb-2">
                    🔍 QUEUE STATUS (Sim t={getSimMinutes()}min)
                  </div>
                  <div className="text-xs text-green-900 space-y-2 bg-white p-2 rounded">
                    {queueDebugInfo ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div className="font-semibold">Queue</div>
                          <div className="font-semibold">Orders (Ready)</div>
                          <div className="font-semibold">Wait Time</div>

                          <div>PreAcceptance:</div>
                          <div className={queueDebugInfo.preAcceptanceReady > 0 ? 'text-green-600 font-bold' : ''}>
                            {queueDebugInfo.preAcceptanceCount} ({queueDebugInfo.preAcceptanceReady} ready)
                          </div>
                          <div className="text-muted-foreground">{queueDebugInfo.config?.preAcceptanceReleaseMinutes || 0} min</div>

                          <div>PreInspection:</div>
                          <div className={queueDebugInfo.preInspectionReady > 0 ? 'text-green-600 font-bold' : ''}>
                            {queueDebugInfo.preInspectionCount} ({queueDebugInfo.preInspectionReady} ready)
                          </div>
                          <div className="text-muted-foreground">{queueDebugInfo.config?.preInspectionReleaseMinutes || 0} min</div>

                          <div>PostInspection:</div>
                          <div className={queueDebugInfo.postInspectionReady > 0 ? 'text-green-600 font-bold' : ''}>
                            {queueDebugInfo.postInspectionCount} ({queueDebugInfo.postInspectionReady} ready)
                          </div>
                          <div className="text-muted-foreground">{queueDebugInfo.config?.postInspectionReleaseMinutes || 0} min</div>
                        </div>

                        {queueDebugInfo.lastRelease && (
                          <div className="border-t pt-2 mt-2 bg-green-100 p-2 rounded">
                            <div className="text-[10px] font-bold text-green-800">
                              🎉 Last Release: {queueDebugInfo.lastRelease.queue} released {queueDebugInfo.lastRelease.count} order(s) at sim t={queueDebugInfo.lastRelease.simTime}min
                            </div>
                          </div>
                        )}

                        <div className="border-t pt-2 mt-2 text-[10px] text-muted-foreground">
                          Last checked: sim t={queueDebugInfo.lastCheck}min | Current: sim t={getSimMinutes()}min
                        </div>
                      </>
                    ) : (
                      <div className="text-yellow-600 font-bold">⏳ Waiting for queue data... (updates every sim minute)</div>
                    )}
                  </div>
                </div>

                <div className="mb-3 border-2 border-purple-600 bg-purple-50 p-3 rounded">
                  <div className="text-sm font-bold text-purple-900 mb-2">🧠 Terminierung (Live)</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(Object.keys(schedulingStageLabels) as SchedulingStageKey[]).map((stageKey) => {
                      const stats = schedulingStats[stageKey]
                      return (
                        <div
                          key={stageKey}
                          className="bg-white border border-purple-200 rounded p-2 space-y-1"
                        >
                          <div className="text-xs font-semibold text-purple-900">
                            {schedulingStageLabels[stageKey]}
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-purple-900">
                            <span>Läufe</span>
                            <span className="text-right font-medium">{stats.runs}</span>
                            <span>Letzter Lauf</span>
                            <span className="text-right">{stats.lastRun !== null ? `${stats.lastRun} min` : '–'}</span>
                            <span>Letzte Freigaben</span>
                            <span className="text-right">{stats.lastReleased}</span>
                            <span>Summe Freigaben</span>
                            <span className="text-right">{stats.totalReleased}</span>
                            <span>Letzte Änderungen</span>
                            <span className="text-right">{stats.lastReorder}</span>
                            <span>Summe Änderungen</span>
                            <span className="text-right">{stats.totalReorder}</span>
                            <span>Letzte Queuegröße</span>
                            <span className="text-right">{stats.lastQueueSize}</span>
                            <span>Letzte Batches</span>
                            <span className="text-right">{stats.lastBatches}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 border-t border-purple-200 pt-2">
                    <div className="text-xs font-semibold text-purple-900 mb-1">Run-Historie (letzte 3)</div>
                    <div className="space-y-2">
                      {(Object.keys(schedulingStageLabels) as SchedulingStageKey[]).map((stageKey) => (
                        <div key={stageKey} className="bg-white border border-purple-100 rounded p-2 text-[10px] text-purple-900">
                          <div className="font-semibold mb-1">{schedulingStageLabels[stageKey]}</div>
                          {schedulingHistory[stageKey].length === 0 ? (
                            <div className="text-muted-foreground">Keine Läufe protokolliert.</div>
                          ) : (
                            schedulingHistory[stageKey].slice(0, 3).map((entry, idx) => (
                              <div key={idx} className="border-t border-dashed pt-1 mt-1">
                                <div>
                                  t={entry.simMinute ?? '–'}min • Released: {entry.releasedCount ?? 0} • Changes: {entry.reorderCount ?? 0}
                                </div>
                                {Array.isArray(entry.orderSequence) && entry.orderSequence.length > 0 && (
                                  <div>
                                    Seq: {entry.orderSequence.slice(0, 5).join(', ')}
                                    {entry.orderSequence.length > 5 ? ' …' : ''}
                                  </div>
                                )}
                                {Array.isArray(entry.pythonReleaseList) && entry.pythonReleaseList.length > 0 && (
                                  <div>
                                    Python: {entry.pythonReleaseList.slice(0, 5).join(', ')}
                                    {entry.pythonReleaseList.length > 5 ? ' …' : ''}
                                  </div>
                                )}
                                <div>PyDiff: {entry.pythonDiffCount ?? entry.reorderCount ?? 0}</div>
                                {Array.isArray(entry.pythonDebug) && entry.pythonDebug.length > 0 && (
                                  <div>
                                    Debug:{' '}
                                    {entry.pythonDebug
                                      .slice(0, 2)
                                      .map((d: any, idx: number) => {
                                        const stage = typeof d?.stage === 'string' ? d.stage : `step-${idx + 1}`
                                        const message =
                                          typeof d?.message === 'string'
                                            ? d.message
                                            : JSON.stringify(d)
                                        return `${stage}: ${message}`
                                      })
                                      .join(' | ')}
                                    {entry.pythonDebug.length > 2 ? ' …' : ''}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {Object.values(schedulingStats).every(stats => stats.runs === 0) && (
                    <div className="text-[10px] text-purple-700 mt-2">
                      Noch keine Terminierung durchgeführt.
                    </div>
                  )}
                </div>

                {/* React Flow Debug Section */}
                <div className="mb-3 border-2 border-blue-600 bg-blue-50 p-3 rounded">
                  <div className="text-sm font-bold text-blue-900 mb-2">🎨 React Flow Status</div>
                  <div className="text-xs text-blue-900 space-y-2 bg-white p-2 rounded">
                    <div><strong>Nodes Count:</strong> {nodes.length} {nodes.length === 0 && <span className="text-red-600 font-bold">❌ LEER!</span>}</div>
                    <div><strong>Edges Count:</strong> {edges.length} {edges.length === 0 && <span className="text-red-600 font-bold">❌ LEER!</span>}</div>
                    <div className="border-t pt-2 mt-2">
                      <strong>Nodes:</strong>
                      <div className="font-mono text-[10px] bg-gray-50 p-2 rounded mt-1 max-h-24 overflow-y-auto">
                        {nodes.length > 0 ? (
                          nodes.map(n => (
                            <div key={n.id}>{n.id} ({n.type || 'default'}) @ x:{n.position.x} y:{n.position.y}</div>
                          ))
                        ) : (
                          <div className="text-red-600 font-bold">❌ KEINE NODES!</div>
                        )}
                      </div>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <strong>Edges:</strong>
                      <div className="font-mono text-[10px] bg-gray-50 p-2 rounded mt-1 max-h-24 overflow-y-auto">
                        {edges.length > 0 ? (
                          edges.map(e => (
                            <div key={e.id}>{e.source} → {e.target}</div>
                          ))
                        ) : (
                          <div className="text-red-600 font-bold">❌ KEINE EDGES!</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-3 border-2 border-red-600 bg-red-50 p-3 rounded">
                  <div className="text-sm font-bold text-red-900 mb-2">⚠️ PROBLEM DIAGNOSTICS</div>
                  <div className="text-xs text-red-900 space-y-2 bg-white p-2 rounded">
                    <div><strong>DEM Queue:</strong> {demQueueRef.current.length} (SOLLTE &gt; 0 SEIN!)</div>
                    <div><strong>MON Queue:</strong> {monQueueRef.current.length}</div>
                    <div><strong>DEM Ready:</strong> {demReadySetRef.current.size} Aufträge warten</div>
                    <div><strong>Active Orders:</strong> {activeOrders.length}</div>
                    {initError && (
                      <div className="border-t pt-2 mt-2 bg-red-100 p-2 rounded">
                        <strong className="text-red-900">🚨 INIT ERROR:</strong>
                        <div className="font-mono text-[10px] text-red-800 mt-1">{initError}</div>
                      </div>
                    )}
                    <div className="border-t pt-2 mt-2">
                      <strong>Initialization Logs ({initDebugLogs.length} total):</strong>
                      <div className="mt-1 max-h-32 overflow-y-auto font-mono text-[10px] bg-yellow-50 p-2 rounded">
                        {initDebugLogs.length > 0 ? (
                          initDebugLogs.map((log, i) => (
                            <div key={i} className={i < 3 ? 'font-bold text-red-800' : 'text-gray-700'}>{log}</div>
                          ))
                        ) : (
                          <div className="text-red-600 font-bold">❌ KEINE LOGS! initDebugLogs ist LEER!</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                  <div>
                    <span className="font-semibold">DEM Queue:</span> {demQueueRef.current.length}
                  </div>
                  <div>
                    <span className="font-semibold">MON Queue:</span> {monQueueRef.current.length}
                  </div>
                  <div>
                    <span className="font-semibold">DEM Active:</span> {demActivesRef.current.length}
                  </div>
                  <div>
                    <span className="font-semibold">MON Active:</span> {monActivesRef.current.length}
                  </div>
                  <div>
                    <span className="font-semibold">DEM Ready:</span> {demReadySetRef.current.size}
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold">Main Queues:</span> A:{mainQueuesRef.current.acceptance.length} I:{mainQueuesRef.current.inspection.length} <strong className="text-red-600">QS:{mainQueuesRef.current.qualityShipping.length}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold">Quality-Shipping Station:</span> {stations.find(s => s.id === 'quality-shipping')?.currentOrder?.kundeName || 'FREI'} | Queue: {stations.find(s => s.id === 'quality-shipping')?.waitingQueue?.length || 0}
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold">DEM Queue IDs:</span> {demQueueRef.current.map(b => `${b.orderId.slice(-4)}(${b.ops.length}ops)`).join(', ') || 'empty'}
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold">DEM Active:</span> {demActivesRef.current.map(a => `${a.orderId.slice(-4)}@slot${a.slotIdx}(${a.remaining.toFixed(1)}/${a.total}min)`).join(', ') || 'none'}
                  </div>
                  <div className="col-span-4">
                    <span className="font-semibold">Orders @ Demontage:</span> {activeOrders.filter(o => o.currentStation === 'demontage').map(o => `${(o as any).kundeName?.slice(0,10)}(${o.progress.toFixed(0)}%)`).join(', ') || 'none'}
                  </div>
                  <div className="col-span-4 bg-red-100 p-2 rounded">
                    <span className="font-semibold text-red-900">Orders @ Quality-Shipping:</span> {activeOrders.filter(o => o.currentStation === 'quality-shipping').map(o => `${(o as any).kundeName?.slice(0,10)}(${o.progress.toFixed(0)}%, waiting:${o.isWaiting})`).join(', ') || 'NONE - THIS IS THE PROBLEM!'}
                  </div>
                  <div className="col-span-4 border-t pt-2 mt-2">
                    <div className="font-semibold mb-1">🔧 Dispatcher Debug:</div>
                    <div className="text-[10px] space-y-1">
                      <div>Current Sim Time: {getSimMinutes()} minutes (Speed: {speed}x, Setup: {setupTimeHours}h = {Math.round(setupTimeHours * 60)}min)</div>
                      <div>DEM Slots: {demSlotsRef.current.length} ({demSlotsRef.current.filter(s => s.busy).length} busy)</div>
                      <div>Slot Details: {demSlotsRef.current.map((s, i) => `S${i}:${s.busy?'B':'F'}${s.flex?'flex':'rigid'}${s.specialization?`(${normalizeOperationKey(s.specialization)})`:''}`).join(' ')}</div>
                      <div className="text-[9px] text-blue-700 mt-1">
                        DEM Active Ops: {demActivesRef.current.length} - {demActivesRef.current.map(a => `${a.orderId.slice(-4)}:${a.label}@S${a.slotIdx}`).join(', ') || 'none'}
                      </div>
                      <div className="text-[9px] text-purple-700">
                        MON Active Ops: {monActivesRef.current.length} - {monActivesRef.current.map(a => `${a.orderId.slice(-4)}:${a.label}@S${a.slotIdx}`).join(', ') || 'none'}
                      </div>
                      <div className="mt-2 p-2 bg-red-50 border border-red-300 rounded">
                        <div className="font-semibold text-red-900 mb-1">🔍 Slot Consistency Check:</div>
                        {(() => {
                          const demBusySlots = demSlotsRef.current.map((s, i) => ({ idx: i, busy: s.busy })).filter(s => s.busy)
                          const demActiveSlots = demActivesRef.current.map(a => a.slotIdx)
                          const demOrphans = demBusySlots.filter(s => !demActiveSlots.includes(s.idx))

                          const monBusySlots = monSlotsRef.current.map((s, i) => ({ idx: i, busy: s.busy })).filter(s => s.busy)
                          const monActiveSlots = monActivesRef.current.map(a => a.slotIdx)
                          const monOrphans = monBusySlots.filter(s => !monActiveSlots.includes(s.idx))

                          return (
                            <div className="text-[9px] space-y-1">
                              <div className={demOrphans.length > 0 ? 'text-red-700 font-bold' : 'text-green-700'}>
                                DEM: {demBusySlots.length} busy slots [{demBusySlots.map(s => s.idx).join(',')}], {demActiveSlots.length} active ops [{demActiveSlots.join(',')}]
                                {demOrphans.length > 0 && <span className="ml-2">⚠️ ORPHAN SLOTS: [{demOrphans.map(s => s.idx).join(',')}]</span>}
                              </div>
                              <div className={monOrphans.length > 0 ? 'text-red-700 font-bold' : 'text-green-700'}>
                                MON: {monBusySlots.length} busy slots [{monBusySlots.map(s => s.idx).join(',')}], {monActiveSlots.length} active ops [{monActiveSlots.join(',')}]
                                {monOrphans.length > 0 && <span className="ml-2">⚠️ ORPHAN SLOTS: [{monOrphans.map(s => s.idx).join(',')}]</span>}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                      <div className="mt-1 p-1 bg-yellow-50 border border-yellow-300 rounded">
                        <div className="font-semibold text-yellow-900">⚠️ Multi-Slot Check:</div>
                        {(() => {
                          const orderSlotMap: Record<string, number[]> = {}
                          demActivesRef.current.forEach((active, idx) => {
                            if (!orderSlotMap[active.orderId]) orderSlotMap[active.orderId] = []
                            orderSlotMap[active.orderId].push(active.slotIdx)
                          })
                          const violations = Object.entries(orderSlotMap).filter(([_, slots]) => slots.length > 1)
                          return violations.length > 0 ? (
                            <div className="text-[9px] text-red-700">
                              {violations.map(([orderId, slots]) => (
                                <div key={orderId}>
                                  🔴 Order {orderId.slice(-6)} occupies {slots.length} DEM slots: [{slots.join(', ')}]
                                </div>
                              ))}
                            </div>
                          ) : <div className="text-[9px] text-green-700">✅ No order occupies multiple DEM slots</div>
                        })()}
                      </div>
                      <div className="mt-1 p-1 bg-yellow-50 border border-yellow-300 rounded">
                        <div className="font-semibold text-yellow-900">⚠️ Multi-Slot Check (MON):</div>
                        {(() => {
                          const orderSlotMap: Record<string, number[]> = {}
                          monActivesRef.current.forEach((active, idx) => {
                            if (!orderSlotMap[active.orderId]) orderSlotMap[active.orderId] = []
                            orderSlotMap[active.orderId].push(active.slotIdx)
                          })
                          const violations = Object.entries(orderSlotMap).filter(([_, slots]) => slots.length > 1)
                          return violations.length > 0 ? (
                            <div className="text-[9px] text-red-700">
                              {violations.map(([orderId, slots]) => (
                                <div key={orderId}>
                                  🔴 Order {orderId.slice(-6)} occupies {slots.length} MON slots: [{slots.join(', ')}]
                                </div>
                              ))}
                            </div>
                          ) : <div className="text-[9px] text-green-700">✅ No order occupies multiple MON slots</div>
                        })()}
                      </div>
                      <div>Simulation Running: {isRunning ? 'YES' : 'NO'}</div>
                      <div>Aggregate View: {aggregateView ? 'YES' : 'NO'}</div>
                      <div className="mt-2 border-t pt-2">
                        <div className="font-semibold">Last Dispatcher Attempts:</div>
                        <div className="max-h-20 overflow-y-auto bg-gray-100 p-1 rounded mt-1">
                          {dispatcherLogsRef.current.slice(-10).map((log, i) => (
                            <div key={i} className="text-[9px]">{log}</div>
                          ))}
                          {dispatcherLogsRef.current.length === 0 && <div className="text-gray-500">No logs yet</div>}
                        </div>
                      </div>
                      <div className="mt-2 border-t pt-2">
                        <div className="font-semibold">Last pickSlot Debug:</div>
                        <div className="max-h-40 overflow-y-auto bg-red-50 p-1 rounded mt-1 font-mono">
                          {pickSlotDebugLogsRef.current.map((log, i) => (
                            <div key={i} className="text-[9px] whitespace-pre">{log}</div>
                          ))}
                          {pickSlotDebugLogsRef.current.length === 0 && <div className="text-gray-500">No logs yet</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Process Flow Diagram */}
        <Card>
          <CardHeader>
            <CardTitle>Prozessfluss</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 200 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(_, node) => handleStationClick(node.id)}
                fitView
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.5}
                maxZoom={2}
                style={{ width: '100%', height: '100%' }}
                nodeTypes={nodeTypes}
              >
                <Background />
                <Controls />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>

        {/* Active Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Aktive Aufträge - Prozesszeiten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {activeOrders.length === 0 && simulationOrdersRef.current.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Keine Aufträge geladen. Bitte Simulation initialisieren.</p>
              ) : activeOrders.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-center text-amber-600 py-4">
                    {simulationOrdersRef.current.length} Aufträge in Terminierung (Warteschlange)
                  </p>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px]">Kunde</TableHead>
                          <TableHead className="w-[200px]">Produktvariante</TableHead>
                          <TableHead className="w-[150px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {simulationOrdersRef.current.slice(0, 10).map((order: any) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.kundeName}</TableCell>
                            <TableCell>{order.produktvariante}</TableCell>
                            <TableCell>
                              <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                                Terminierung (Warteschlange)
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {simulationOrdersRef.current.length > 10 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-gray-500 text-sm">
                              ... und {simulationOrdersRef.current.length - 10} weitere Aufträge
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary Table */}
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                      <TableHead className="w-[150px]">Kunde</TableHead>
                      <TableHead className="w-[200px]">Produktvariante</TableHead>
                      <TableHead className="w-[150px]">Aktuelle Station</TableHead>
                      <TableHead className="w-[120px]">Fortschritt</TableHead>
                      <TableHead className="w-[160px]">Liefertermin (PAP)</TableHead>
                      <TableHead className="w-[100px]">Verzögerung</TableHead>
                      <TableHead className="w-[100px]">Gesamtzeit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                        {activeOrders.map((order) => {
                          const currentStationData = stations.find(s => s.id === order.currentStation);
                          const currentStationDuration = order.stationDurations[order.currentStation];
                          const progressPercent = (order.progress / (currentStationDuration?.actual || currentStationData?.processingTime || 1)) * 100;

                          // Calculate total delay across all completed stations
                          const completedStations = Object.entries(order.stationDurations).filter(([stationId, duration]) => {
                            return duration.actual && order.processSequence.indexOf(order.currentStation) > order.processSequence.indexOf(stationId);
                          });
                          const totalDelay = completedStations.reduce((acc, [, duration]) => {
                            return acc + (duration.actual! - duration.expected);
                          }, 0);

                          // Calculate total time spent so far
                          const totalTimeSpent = completedStations.reduce((acc, [, duration]) => acc + duration.actual!, 0) + order.progress;

                          // Determine station name with better handling for queue waiting states
                          let stationName = currentStationData?.name || 'Unbekannt'
                          if (order.currentStation === 'waiting-inspection') {
                            stationName = 'Terminierung (Warteschlange vor Inspektion)'
                          } else if (order.currentStation === 'waiting-demontage') {
                            stationName = 'Terminierung (Warteschlange vor Demontage)'
                          } else if (!currentStationData) {
                            stationName = 'Terminierung'
                          }
                          const plannedDeliveryDisplay = formatSimMinuteDateTime(order.plannedDeliverySimMinute)

                          return (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.kundeName}</TableCell>
                              <TableCell>{order.produktvariante}</TableCell>
                              <TableCell>
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                  {stationName}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div className="w-16 bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${Math.min(100, progressPercent)}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-medium">{progressPercent.toFixed(0)}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-medium text-slate-700">
                                {plannedDeliveryDisplay}
                              </TableCell>
                              <TableCell>
                                <span className={`text-xs font-medium ${
                                  totalDelay > 0 ? 'text-red-600' : totalDelay < 0 ? 'text-green-600' : 'text-gray-600'
                                }`}>
                                  {totalDelay > 0 ? '+' : ''}{totalDelay.toFixed(1)} min
                                </span>
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                {totalTimeSpent.toFixed(1)} min
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Sidebar - Right Side */}
      <div className="xl:col-span-1 space-y-4">
        {/* Order Time Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Zeitverteilung pro Auftrag</CardTitle>
          </CardHeader>
          <CardContent>
            {completedOrders.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-center">
                <p className="text-gray-500 text-sm">
                  Noch keine abgeschlossenen Aufträge für die Zeitverteilung verfügbar
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={prepareChartData()} 
                  margin={{ top: 20, right: 5, left: 5, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    fontSize={9}
                  />
                  <YAxis
                    label={{ value: 'Zeit (min)', angle: -90, position: 'insideLeft' }}
                    fontSize={9}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [`${value} min`, name]}
                    labelFormatter={(label) => `Kunde: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="Bearbeitungszeit" stackId="a" fill="#82ca9d" name="Bearbeitungszeit" />
                  <Bar dataKey="Wartezeit" stackId="a" fill="#ffc658" name="Wartezeit" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Station Utilization Display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stationsauslastung</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              try {
                const utilizationData = prepareStationUtilizationData();

                if (!utilizationData || utilizationData.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-[200px] text-center">
                      <p className="text-gray-500 text-sm">
                        Keine Auslastungsdaten verfügbar
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={utilizationData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          interval={0}
                          angle={0}
                          textAnchor="middle"
                          height={60}
                        />
                        <YAxis
                          label={{ value: 'Auslastung (%)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                          domain={[0, 100]}
                          tick={{ fontSize: 11 }}
                        />
                        <RechartsTooltip
                          formatter={(value: any, name: any, props: any) => {
                            const slotCount = props.payload.slotCount;
                            return [`${value.toFixed(1)}%`, `Auslastung (${slotCount} Slots)`];
                          }}
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar dataKey="utilizationRate" name="Auslastung">
                          {utilizationData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.station === 'Demontage' ? '#3B82F6' : '#10B981'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {utilizationData.map((data, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border-2 ${
                            data.station === 'Demontage'
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-green-50 border-green-200'
                          }`}
                        >
                          <div className="text-xs font-semibold text-gray-700 mb-1">
                            {data.name}
                          </div>
                          <div className={`text-2xl font-bold ${
                            data.station === 'Demontage' ? 'text-blue-600' : 'text-green-600'
                          }`}>
                            {data.utilizationRate.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-gray-600 mt-1">
                            Bearbeitungszeit: {data.processingTime.toFixed(0)} min
                          </div>
                          <div className="text-[10px] text-gray-600">
                            Gesamtzeit: {data.totalTime.toFixed(0)} min
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch (error) {
                console.error('Error in Stationsauslastung component:', error);
                return (
                  <div className="flex items-center justify-center h-[200px] text-center">
                    <div>
                      <p className="text-red-500 text-sm mb-2">
                        Fehler beim Laden der Stationsauslastung
                      </p>
                      <p className="text-xs text-gray-400">
                        {String(error)}
                      </p>
                    </div>
                  </div>
                );
              }
            })()}
          </CardContent>
        </Card>

        {/* Rüstzeiten Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rüstzeiten-Analyse</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              try {
                if (setupTimeHours === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      Rüstzeit ist auf 0 Stunden eingestellt.<br/>
                      Erhöhen Sie die Rüstzeit in den Einstellungen, um Rüstzeiten zu analysieren.
                    </div>
                  )
                }

                // Calculate setup times from slot changes (when a flex slot switches to a different type)
                const setupMinutes = setupTimeHours * 60
                const events = [...simEventsRef.current]

                // Track slot type changes for flex slots
                const slotTypeChanges: Record<string, { prev: string | null; curr: string; time: number }[]> = {}

                // We need to track what type each slot was working on over time
                // For this, we'll analyze the events and track slot assignments

                // Count total setup times (estimated)
                let totalSetupTimeMinutes = 0
                let setupEventCount = 0

                // Parse events to find operations and estimate setups
                const demOps: Array<{order: string; op: string; start: number; end: number; slot: number}> = []
                const monOps: Array<{order: string; op: string; start: number; end: number; slot: number}> = []

                const starts: Record<string, any> = {}
                events.forEach(ev => {
                  if (!ev.activity || typeof ev.activity !== 'string') return
                  const act = ev.activity

                  if (act.endsWith('_START') && ev.slot != null) {
                    const stem = act.slice(0, -6)
                    const key = `${ev.order_id}|${stem}|${ev.slot}`
                    starts[key] = { t: ev.t, op: stem, order: ev.order_id, slot: ev.slot }
                  } else if (act.endsWith('_END') && ev.slot != null) {
                    const stem = act.slice(0, -4)
                    const key = `${ev.order_id}|${stem}|${ev.slot}`
                    const s = starts[key]
                    if (s) {
                      const op = { order: ev.order_id, op: stem, start: s.t, end: ev.t, slot: ev.slot }
                      if (act.startsWith('DEMONTAGE:')) demOps.push(op)
                      else if (act.startsWith('MONTAGE:')) monOps.push(op)
                      delete starts[key]
                    }
                  }
                })

                // For each slot, track type changes
                const analyzeSlotChanges = (ops: typeof demOps, slotCount: number) => {
                  const slotOps: Record<number, typeof ops> = {}
                  ops.forEach(op => {
                    if (!slotOps[op.slot]) slotOps[op.slot] = []
                    slotOps[op.slot].push(op)
                  })

                  let changes = 0
                  Object.values(slotOps).forEach(opList => {
                    opList.sort((a, b) => a.start - b.start)
                    for (let i = 1; i < opList.length; i++) {
                      const prev = normalizeOperationKey(opList[i-1].op)
                      const curr = normalizeOperationKey(opList[i].op)
                      if (prev !== curr) {
                        changes++
                        totalSetupTimeMinutes += setupMinutes
                      }
                    }
                  })
                  return changes
                }

                const demChanges = analyzeSlotChanges(demOps, demSlotsRef.current.length)
                const monChanges = analyzeSlotChanges(monOps, monSlotsRef.current.length)
                setupEventCount = demChanges + monChanges

                // Calculate production time from segments
                const prodTimeMinutes = demOps.reduce((sum, op) => sum + (op.end - op.start), 0) +
                                       monOps.reduce((sum, op) => sum + (op.end - op.start), 0)

                const avgSetupPerOrder = completedOrders.length > 0 ? totalSetupTimeMinutes / completedOrders.length : 0
                const avgProdPerOrder = completedOrders.length > 0 ? prodTimeMinutes / completedOrders.length : 0

                const setupRatio = avgProdPerOrder > 0 ? (avgSetupPerOrder / avgProdPerOrder) * 100 : 0

                return (
                  <div className="space-y-2">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 gap-1.5">
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-600 font-medium">Eingestellte Rüstzeit</div>
                        <div className="text-xl font-bold text-slate-900">{setupMinutes} min</div>
                      </div>
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-600 font-medium">Anzahl Umrüstungen</div>
                        <div className="text-xl font-bold text-slate-900">{setupEventCount}</div>
                      </div>
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                        <div className="text-xs text-blue-700 font-medium">Ø Rüstzeit / Auftrag</div>
                        <div className="text-xl font-bold text-blue-900">{avgSetupPerOrder.toFixed(1)} min</div>
                      </div>
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                        <div className="text-xs text-blue-700 font-medium">Ø Fertigungszeit / Auftrag</div>
                        <div className="text-xl font-bold text-blue-900">{avgProdPerOrder.toFixed(1)} min</div>
                      </div>
                    </div>

                    {/* Ratio Visualization */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <h4 className="text-xs font-semibold mb-1.5 text-slate-700">Rüstzeit im Verhältnis zur Fertigungszeit</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-slate-600 font-medium">Rüstzeit: {avgSetupPerOrder.toFixed(1)} min</span>
                            <span className="text-slate-600 font-medium">Fertigungszeit: {avgProdPerOrder.toFixed(1)} min</span>
                          </div>
                          <div className="h-5 bg-slate-200 rounded overflow-hidden flex">
                            <div
                              className="bg-blue-600 flex items-center justify-center text-[11px] text-white font-medium"
                              style={{ width: `${Math.min((avgSetupPerOrder / (avgSetupPerOrder + avgProdPerOrder)) * 100, 100)}%` }}
                            >
                              {setupRatio > 5 && `${setupRatio.toFixed(1)}%`}
                            </div>
                            <div
                              className="bg-blue-900 flex items-center justify-center text-[11px] text-white font-medium"
                              style={{ width: `${Math.min((avgProdPerOrder / (avgSetupPerOrder + avgProdPerOrder)) * 100, 100)}%` }}
                            >
                              {setupRatio < 95 && `${(100 - setupRatio).toFixed(1)}%`}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1.5 text-center">
                        <span className={`text-sm font-semibold ${setupRatio > 30 ? 'text-slate-700' : setupRatio > 15 ? 'text-slate-700' : 'text-blue-700'}`}>
                          Verhältnis: {setupRatio.toFixed(1)}% Rüstzeit
                        </span>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {setupRatio > 30 && 'Hoher Rüstzeitanteil - Flexibilität prüfen'}
                          {setupRatio <= 30 && setupRatio > 15 && 'Moderater Rüstzeitanteil'}
                          {setupRatio <= 15 && 'Niedriger Rüstzeitanteil - Effiziente Nutzung'}
                        </p>
                      </div>
                    </div>

                    {/* Phase Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                        <h4 className="text-xs font-semibold mb-1 text-blue-800">Demontage</h4>
                        <div className="text-xs text-slate-600">Umrüstungen: {demChanges}</div>
                        <div className="text-xs text-slate-600">Operationen: {demOps.length}</div>
                      </div>
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                        <h4 className="text-xs font-semibold mb-1 text-blue-800">Montage</h4>
                        <div className="text-xs text-slate-600">Umrüstungen: {monChanges}</div>
                        <div className="text-xs text-slate-600">Operationen: {monOps.length}</div>
                      </div>
                    </div>
                  </div>
                )
              } catch (e) {
                console.error('Rüstzeiten analysis error:', e)
                return <div className="text-sm text-red-500">Fehler bei der Rüstzeiten-Analyse</div>
              }
            })()}
          </CardContent>
        </Card>

        {/* Lieferterminverzug (Simulation) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Liefertermin-Analyse</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshDeliveryMetrics(true)}
              className="h-8"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Alle laden
            </Button>
          </CardHeader>
          <CardContent>
            {(() => {
              try {
                if (deliveryMetricsError) {
                  return <div className="text-sm text-red-500">{deliveryMetricsError}</div>
                }
                if (!deliveryMetrics) {
                  return <div className="text-sm text-muted-foreground">Noch keine Liefertermin-Prognosen verfügbar.</div>
                }

                const completed = Number(deliveryMetrics.completedCount ?? 0)
                const pending = Number(deliveryMetrics.pendingCount ?? 0)
                const averageDeviation = Number(deliveryMetrics.averageDeviationMinutes ?? 0)
                const averageAbsDeviation = Number(deliveryMetrics.averageAbsoluteDeviationMinutes ?? 0)
                const lateCount = Number(deliveryMetrics.lateCount ?? 0)
                const earlyCount = Number(deliveryMetrics.earlyCount ?? 0)
                const onTimeCount = Number(deliveryMetrics.onTimeCount ?? 0)

                if (completed === 0) {
                  return (
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        Es wurden noch keine finalen Liefertermine prognostiziert. Sobald PAP/PIPo Durchläufe
                        abgeschlossen sind, erscheint hier die durchschnittliche Abweichung.
                      </p>
                      {pending > 0 && (
                        <p className="text-xs">{pending} Aufträge haben bereits einen geplanten Liefertermin, warten aber noch auf eine Feinplanung.</p>
                      )}
                    </div>
                  )
                }

                const sample = Array.isArray(deliveryMetrics.sample) ? deliveryMetrics.sample : []

                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-600">Ø Abweichung</div>
                        <div className={`text-xl font-semibold ${averageDeviation > 0 ? 'text-red-600' : averageDeviation < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {formatDeviationMinutes(averageDeviation)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {averageDeviation > 0 ? 'Verspätet' : averageDeviation < 0 ? 'Früher' : 'Pünktlich'}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="text-xs text-slate-600">Bewertete Aufträge</div>
                        <div className="text-xl font-semibold text-slate-700">{completed}</div>
                        {pending > 0 && (
                          <div className="text-[11px] text-slate-500">{pending} weitere warten auf einen finalen Termin</div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-3 text-xs text-slate-600">
                      <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                        <span>Verspätet</span>
                        <span className="font-semibold text-red-600">{lateCount}</span>
                      </div>
                      <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                        <span>Pünktlich</span>
                        <span className="font-semibold text-slate-700">{onTimeCount}</span>
                      </div>
                      <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                        <span>Früher fertig</span>
                        <span className="font-semibold text-emerald-600">{earlyCount}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="text-xs font-semibold text-slate-700 mb-1">Größte Abweichungen</div>
                      {sample.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Noch keine Feinplanungsdaten verfügbar.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {sample.map((item: any) => (
                            <div key={item.orderId} className="flex items-center justify-between text-xs">
                              <div className="flex flex-col">
                                <span className="font-mono text-slate-700">{item.orderId.slice(0, 8)}</span>
                                <span className="text-[11px] text-slate-500">{item.productVariant || 'Produktvariante unbekannt'}</span>
                              </div>
                              <div className="text-right">
                                <div className={`font-semibold ${item.deviationMinutes > 0 ? 'text-red-600' : item.deviationMinutes < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                  {formatDeviationMinutes(Number(item.deviationMinutes ?? 0))}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Plan: {formatIsoDateTime(item.plannedIso)} | Prog.: {formatIsoDateTime(item.finalIso)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Positive Werte entsprechen Verspätungen.</span>
                      <span>Stand: {formatIsoDateTime(deliveryMetrics.lastUpdated)}</span>
                    </div>
                  </div>
                )
              } catch (error) {
                console.error('Delivery analysis render error:', error)
                return <div className="text-sm text-red-500">Fehler bei der Liefertermin-Analyse</div>
              }
            })()}
          </CardContent>
        </Card>

      </div>

      {/* Station Configuration Dialog */}
      <Dialog open={stationDialogOpen} onOpenChange={setStationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Station konfigurieren: {selectedStation?.name}</DialogTitle>
            <DialogDescription>
              Passen Sie die Bearbeitungszeit für diese Station an.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="processing-time" className="text-right">
                Bearbeitungszeit (Minuten)
              </Label>
              <Input
                id="processing-time"
                type="number"
                value={tempProcessingTime}
                onChange={(e) => setTempProcessingTime(Number(e.target.value))}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveStationTime}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase Variation Configuration Dialog */}
      <Dialog open={phaseDialogOpen} onOpenChange={setPhaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedPhase === 'demontage' ? 'Demontage' : 'Montage'} Schwankung konfigurieren
            </DialogTitle>
            <DialogDescription>
              Passen Sie die stochastische Variation (Schwankung) der Bearbeitungszeiten für alle {selectedPhase === 'demontage' ? 'Demontage' : 'Montage'}-Baugruppen an.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phase-variation" className="text-right">
                Schwankung (%)
              </Label>
              <div className="col-span-3">
                <Input
                  id="phase-variation"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(tempPhaseVariation * 100)}
                  onChange={(e) => setTempPhaseVariation(Number(e.target.value) / 100)}
                  className="mb-2"
                />
                <p className="text-sm text-muted-foreground">
                  Aktuell: ±{Math.round(tempPhaseVariation * 100)}%
                  <br />
                  (z.B. bei 30 Min: {Math.round(30 * (1 - tempPhaseVariation))}-{Math.round(30 * (1 + tempPhaseVariation))} Min)
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSavePhaseVariation}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspection Configuration Dialog */}
      <Dialog open={inspectionDialogOpen} onOpenChange={setInspectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inspektionseinstellungen</DialogTitle>
            <DialogDescription>
              Konfigurieren Sie den Prozentsatz der Baugruppen, die nach der Inspektion zusätzlich remontiert werden müssen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="reassembly-percentage" className="text-right">
                Remontage-Prozentsatz (%)
              </Label>
              <div className="col-span-3 space-y-2">
                <Input
                  id="reassembly-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={reassemblyPercentage}
                  onChange={(e) => setReassemblyPercentage(Number(e.target.value))}
                />
                <p className="text-sm text-gray-500">
                  Anteil der Baugruppen, die zusätzliche Remontage benötigen: {reassemblyPercentage}%
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right text-sm text-gray-600">
                Erklärung:
              </Label>
              <div className="col-span-3 text-sm text-gray-600">
                <p>
                  Dieser Wert bestimmt, bei welchem Prozentsatz der Baugruppen während der Inspektion 
                  festgestellt wird, dass sie zusätzliche Remontage-Arbeiten benötigen, 
                  die nicht vor der Inspektion geplant waren.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setInspectionDialogOpen(false)} variant="outline">
              Abbrechen
            </Button>
            <Button onClick={() => {
              // Save the setting (mock-up for now)
              toast.success(`Remontage-Prozentsatz auf ${reassemblyPercentage}% gesetzt`);
              setInspectionDialogOpen(false);
            }}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminierung Bundle Management Modal */}
      <Dialog open={terminierungModalOpen} onOpenChange={setTerminierungModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terminierungs-Konfiguration</DialogTitle>
            <DialogDescription>
              Python-Skripte für Warteschlangen-Terminierung
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedBundleId && algorithmBundles.length > 0 && (() => {
              const bundle = algorithmBundles.find(b => b.id === selectedBundleId);
              if (!bundle) return <div>Bundle nicht gefunden</div>;

              return (
                <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                  <div className="pb-3 border-b">
                    <div className="font-semibold text-base">{bundle.name}</div>
                    {bundle.author && (
                      <div className="text-xs text-gray-500 mt-1">Autor: {bundle.author}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 bg-white rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <Database className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-sm">PreAcceptanceQueue</span>
                      </div>
                      {bundle.papScriptPath ? (
                        <code className="text-xs text-gray-600 font-mono">
                          {bundle.papScriptPath.split('/').pop()}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">nicht konfiguriert</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 p-2 bg-white rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <Database className="w-4 h-4 text-orange-500" />
                        <span className="font-medium text-sm">PreInspectionQueue</span>
                      </div>
                      {bundle.pipScriptPath ? (
                        <code className="text-xs text-gray-600 font-mono">
                          {bundle.pipScriptPath.split('/').pop()}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">nicht konfiguriert</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 p-2 bg-white rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <Database className="w-4 h-4 text-green-500" />
                        <span className="font-medium text-sm">PostInspectionQueue</span>
                      </div>
                      {bundle.pipoScriptPath ? (
                        <code className="text-xs text-gray-600 font-mono">
                          {bundle.pipoScriptPath.split('/').pop()}
                        </code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">nicht konfiguriert</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTerminierungModalOpen(false)}>
                Schließen
              </Button>
              <Button onClick={() => {
                window.open('/simulation/algorithms', '_blank');
              }}>
                Bundles bearbeiten
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
