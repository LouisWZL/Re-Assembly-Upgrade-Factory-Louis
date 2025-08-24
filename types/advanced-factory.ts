export interface Customer {
  firstName: string;
  lastName: string;
}

export interface ProductVariant {
  name: string;
  type: string;
}

export type ComponentType = 'FAHRWERK' | 'INTERIEUR' | 'ANTRIEB' | 'ELEKTRONIK' | 'CHASSIS';

export interface ComponentInstance {
  componentId: ComponentType;
  condition: number; // 0-100%
  reAssemblyType: 'PFLICHT' | 'WUNSCH' | '';
  replacementComponentId?: string;
}

export interface ComponentDependency {
  component: ComponentType;
  dependsOn: ComponentType[];
}

export interface AdvancedOrder {
  id: string; // UUID for database
  displayId?: string; // Human readable ID for display
  customer: Customer;
  productVariant: ProductVariant;
  phase: OrderPhase;
  deliveryDate: Date;
  components: ComponentInstance[];
  phaseHistory: PhaseHistoryEntry[];
  createdAt: Date;
  currentPhaseStartTime?: Date;
  currentPhaseEndTime?: Date;
  assignedLineNumber?: 1 | 2;
  needsQualityRework?: boolean;
}

export interface PhaseHistoryEntry {
  phase: OrderPhase;
  timestamp: Date;
  duration?: number;
  wasRework?: boolean;
}

export type OrderPhase = 
  | 'ORDER_ACCEPTANCE'
  | 'INSPECTION' 
  | 'DEMONTAGE'
  | 'PRODUCTION'
  | 'QUALITY_CHECK'
  | 'SHIPPING'
  | 'COMPLETED';

export interface PhaseProcess {
  id: string;
  name: string;
  phase: OrderPhase;
  duration_min: number;
  duration_max: number;
  disruption_probability: number;
  disruption_delay_min: number;
  disruption_delay_max: number;
}

export interface ProductionStation {
  id: string;
  componentType: ComponentType;
  name: string;
  lineNumber: 1 | 2;
  isOccupied: boolean;
  currentOrderId?: string;
  currentOrderUuid?: string; // Store actual UUID for database operations
  position: { x: number; y: number };
  processingTime: number; // minutes
  efficiency: number; // 0-100%
  occupiedUntil?: Date;
  stationType: 'ASSEMBLY' | 'DISASSEMBLY';
}

export interface SimulationKPIs {
  totalOrders: number;
  completedOrders: number;
  avgThroughputTime: number; // minutes
  currentBottleneck?: ComponentType;
  ordersPerHour: number;
  stationUtilization: Record<ComponentType, number>;
}

export interface ProcessNode {
  id: string;
  phase: OrderPhase;
  name: string;
  position: { x: number; y: number };
  activeOrders: string[];
}

export interface SequenceStep {
  id: string;
  name: string;
  componentId?: string;
  estimatedDuration: number;
  isReAssembly: boolean;
}

export interface Sequence {
  id: string;
  orderId: string;
  steps: SequenceStep[];
  currentStepIndex: number;
  isActive: boolean;
}

export interface OrderWithDetails {
  order: {
    id: string;
    customer_name: string;
    order_number: string;
    current_phase: string;
    status: string;
    delivery_date: string;
    total_processing_time: number;
    completed_at?: string;
    created_at: string;
    updated_at: string;
    reassembly_reason?: string;
    requires_reassembly: boolean;
  };
  processSteps: Array<{
    id: string;
    order_id: string;
    phase: string;
    started_at: string;
    completed_at?: string;
    duration_minutes?: number;
    was_rework: boolean;
    disruption_occurred: boolean;
    disruption_delay_minutes: number;
  }>;
  components: Array<{
    id: string;
    order_id: string;
    component_type: string;
    condition_percentage: number;
    reassembly_type: string;
    replacement_component_id?: string;
  }>;
  productionStepTimings: any[];
  demontageStepTimings: any[];
}

export interface PhaseConfig {
  name: string;
  baseProcessingTime: number;
  stochasticVariation: number;
  disruptionProbability: number;
  disruptionDelayMin: number;
  disruptionDelayMax: number;
}