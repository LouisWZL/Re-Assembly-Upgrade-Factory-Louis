import { AdvancedOrder, ComponentType, ProductionStation, SimulationKPIs, ComponentInstance } from '@/types/advanced-factory';

// Generate a random advanced order
export function generateRandomAdvancedOrder(): AdvancedOrder {
  const customers = [
    { firstName: 'Max', lastName: 'Mustermann' },
    { firstName: 'Anna', lastName: 'Schmidt' },
    { firstName: 'Thomas', lastName: 'Weber' },
    { firstName: 'Julia', lastName: 'Fischer' },
    { firstName: 'Michael', lastName: 'Meyer' }
  ];

  const productVariants = [
    { name: 'Porsche 911 Carrera', type: 'basic' },
    { name: 'Porsche 911 Turbo', type: 'premium' },
    { name: 'Porsche 911 GT3', type: 'premium' }
  ];

  const componentTypes: ComponentType[] = ['FAHRWERK', 'INTERIEUR', 'ANTRIEB', 'ELEKTRONIK', 'CHASSIS'];
  
  const customer = customers[Math.floor(Math.random() * customers.length)];
  const productVariant = productVariants[Math.floor(Math.random() * productVariants.length)];
  
  // Generate components with random conditions
  const components: ComponentInstance[] = componentTypes.map(componentType => {
    const condition = Math.floor(Math.random() * 100);
    const reAssemblyType = condition < 30 ? 'PFLICHT' : 
                          (Math.random() < 0.3 ? 'WUNSCH' : '');
    
    return {
      componentId: componentType,
      condition,
      reAssemblyType,
      replacementComponentId: reAssemblyType ? `NEW_${componentType}` : undefined
    };
  });

  const order: AdvancedOrder = {
    id: crypto.randomUUID(),
    displayId: `ORD-${Date.now().toString().slice(-6)}`,
    customer,
    productVariant,
    phase: 'ORDER_ACCEPTANCE',
    deliveryDate: new Date(Date.now() + (7 + Math.random() * 14) * 24 * 60 * 60 * 1000), // 1-3 weeks
    components,
    phaseHistory: [{
      phase: 'ORDER_ACCEPTANCE',
      timestamp: new Date(),
      duration: 0
    }],
    createdAt: new Date(),
    needsQualityRework: false
  };

  return order;
}

// Initial production stations for advanced simulation
export const initialAdvancedProductionStations: ProductionStation[] = [
  // Line 1 - Disassembly stations
  { id: 'DIS_CHASSIS_L1', componentType: 'CHASSIS', name: 'Chassis Demontage L1', lineNumber: 1, isOccupied: false, position: { x: 100, y: 100 }, processingTime: 25, efficiency: 95, stationType: 'DISASSEMBLY' },
  { id: 'DIS_ELEKTRONIK_L1', componentType: 'ELEKTRONIK', name: 'Elektronik Demontage L1', lineNumber: 1, isOccupied: false, position: { x: 200, y: 100 }, processingTime: 20, efficiency: 90, stationType: 'DISASSEMBLY' },
  { id: 'DIS_ANTRIEB_L1', componentType: 'ANTRIEB', name: 'Antrieb Demontage L1', lineNumber: 1, isOccupied: false, position: { x: 300, y: 100 }, processingTime: 35, efficiency: 88, stationType: 'DISASSEMBLY' },
  { id: 'DIS_INTERIEUR_L1', componentType: 'INTERIEUR', name: 'Interieur Demontage L1', lineNumber: 1, isOccupied: false, position: { x: 400, y: 100 }, processingTime: 15, efficiency: 92, stationType: 'DISASSEMBLY' },
  { id: 'DIS_FAHRWERK_L1', componentType: 'FAHRWERK', name: 'Fahrwerk Demontage L1', lineNumber: 1, isOccupied: false, position: { x: 500, y: 100 }, processingTime: 30, efficiency: 85, stationType: 'DISASSEMBLY' },

  // Line 1 - Assembly stations
  { id: 'ASS_FAHRWERK_L1', componentType: 'FAHRWERK', name: 'Fahrwerk Montage L1', lineNumber: 1, isOccupied: false, position: { x: 500, y: 300 }, processingTime: 35, efficiency: 90, stationType: 'ASSEMBLY' },
  { id: 'ASS_INTERIEUR_L1', componentType: 'INTERIEUR', name: 'Interieur Montage L1', lineNumber: 1, isOccupied: false, position: { x: 400, y: 300 }, processingTime: 20, efficiency: 93, stationType: 'ASSEMBLY' },
  { id: 'ASS_ANTRIEB_L1', componentType: 'ANTRIEB', name: 'Antrieb Montage L1', lineNumber: 1, isOccupied: false, position: { x: 300, y: 300 }, processingTime: 40, efficiency: 87, stationType: 'ASSEMBLY' },
  { id: 'ASS_ELEKTRONIK_L1', componentType: 'ELEKTRONIK', name: 'Elektronik Montage L1', lineNumber: 1, isOccupied: false, position: { x: 200, y: 300 }, processingTime: 25, efficiency: 91, stationType: 'ASSEMBLY' },
  { id: 'ASS_CHASSIS_L1', componentType: 'CHASSIS', name: 'Chassis Montage L1', lineNumber: 1, isOccupied: false, position: { x: 100, y: 300 }, processingTime: 30, efficiency: 94, stationType: 'ASSEMBLY' },

  // Line 2 - Disassembly stations
  { id: 'DIS_CHASSIS_L2', componentType: 'CHASSIS', name: 'Chassis Demontage L2', lineNumber: 2, isOccupied: false, position: { x: 100, y: 150 }, processingTime: 28, efficiency: 93, stationType: 'DISASSEMBLY' },
  { id: 'DIS_ELEKTRONIK_L2', componentType: 'ELEKTRONIK', name: 'Elektronik Demontage L2', lineNumber: 2, isOccupied: false, position: { x: 200, y: 150 }, processingTime: 22, efficiency: 89, stationType: 'DISASSEMBLY' },
  { id: 'DIS_ANTRIEB_L2', componentType: 'ANTRIEB', name: 'Antrieb Demontage L2', lineNumber: 2, isOccupied: false, position: { x: 300, y: 150 }, processingTime: 33, efficiency: 91, stationType: 'DISASSEMBLY' },
  { id: 'DIS_INTERIEUR_L2', componentType: 'INTERIEUR', name: 'Interieur Demontage L2', lineNumber: 2, isOccupied: false, position: { x: 400, y: 150 }, processingTime: 18, efficiency: 90, stationType: 'DISASSEMBLY' },
  { id: 'DIS_FAHRWERK_L2', componentType: 'FAHRWERK', name: 'Fahrwerk Demontage L2', lineNumber: 2, isOccupied: false, position: { x: 500, y: 150 }, processingTime: 32, efficiency: 88, stationType: 'DISASSEMBLY' },

  // Line 2 - Assembly stations  
  { id: 'ASS_FAHRWERK_L2', componentType: 'FAHRWERK', name: 'Fahrwerk Montage L2', lineNumber: 2, isOccupied: false, position: { x: 500, y: 350 }, processingTime: 38, efficiency: 86, stationType: 'ASSEMBLY' },
  { id: 'ASS_INTERIEUR_L2', componentType: 'INTERIEUR', name: 'Interieur Montage L2', lineNumber: 2, isOccupied: false, position: { x: 400, y: 350 }, processingTime: 22, efficiency: 92, stationType: 'ASSEMBLY' },
  { id: 'ASS_ANTRIEB_L2', componentType: 'ANTRIEB', name: 'Antrieb Montage L2', lineNumber: 2, isOccupied: false, position: { x: 300, y: 350 }, processingTime: 42, efficiency: 85, stationType: 'ASSEMBLY' },
  { id: 'ASS_ELEKTRONIK_L2', componentType: 'ELEKTRONIK', name: 'Elektronik Montage L2', lineNumber: 2, isOccupied: false, position: { x: 200, y: 350 }, processingTime: 27, efficiency: 89, stationType: 'ASSEMBLY' },
  { id: 'ASS_CHASSIS_L2', componentType: 'CHASSIS', name: 'Chassis Montage L2', lineNumber: 2, isOccupied: false, position: { x: 100, y: 350 }, processingTime: 32, efficiency: 92, stationType: 'ASSEMBLY' }
];

// Calculate KPIs for advanced simulation
export function calculateAdvancedKPIs(orders: AdvancedOrder[], stations: ProductionStation[], currentTime: Date): SimulationKPIs {
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.phase === 'COMPLETED').length;
  
  // Calculate average throughput time for completed orders
  const completedOrdersWithTime = orders.filter(o => o.phase === 'COMPLETED' && o.phaseHistory.length > 0);
  const avgThroughputTime = completedOrdersWithTime.length > 0 
    ? completedOrdersWithTime.reduce((sum, order) => {
        const startTime = order.createdAt.getTime();
        const endTime = order.phaseHistory[order.phaseHistory.length - 1].timestamp.getTime();
        return sum + (endTime - startTime);
      }, 0) / completedOrdersWithTime.length / (1000 * 60) // Convert to minutes
    : 0;

  // Calculate current bottleneck
  const phaseOrderCounts = orders.reduce((acc, order) => {
    acc[order.phase] = (acc[order.phase] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Find bottleneck in production stations
  const stationUtilization: Record<ComponentType, number> = {
    'FAHRWERK': 0,
    'INTERIEUR': 0,
    'ANTRIEB': 0,
    'ELEKTRONIK': 0,
    'CHASSIS': 0
  };
  
  const componentTypes: ComponentType[] = ['FAHRWERK', 'INTERIEUR', 'ANTRIEB', 'ELEKTRONIK', 'CHASSIS'];
  componentTypes.forEach(componentType => {
    const componentStations = stations.filter(s => s.componentType === componentType);
    const occupiedStations = componentStations.filter(s => s.isOccupied);
    stationUtilization[componentType] = componentStations.length > 0 
      ? (occupiedStations.length / componentStations.length) * 100
      : 0;
  });
  
  const currentBottleneck = Object.entries(stationUtilization)
    .reduce((max, [component, utilization]) => 
      utilization > max.utilization ? { component: component as ComponentType, utilization } : max,
      { component: 'FAHRWERK' as ComponentType, utilization: 0 }
    ).component;

  // Calculate orders per hour (estimate based on completed orders)
  const ordersPerHour = completedOrders > 0 && avgThroughputTime > 0 
    ? 60 / avgThroughputTime
    : 0;

  return {
    totalOrders,
    completedOrders,
    avgThroughputTime,
    currentBottleneck,
    ordersPerHour,
    stationUtilization
  };
}

// Calculate station utilization from database (placeholder)
export async function calculateAdvancedStationUtilizationFromDB(since: Date): Promise<Record<ComponentType, number>> {
  // This would query the ProductionStepTiming and DemontageTimings tables
  // For now, return empty utilization
  return {
    'FAHRWERK': 0,
    'INTERIEUR': 0,
    'ANTRIEB': 0,
    'ELEKTRONIK': 0,
    'CHASSIS': 0
  };
}