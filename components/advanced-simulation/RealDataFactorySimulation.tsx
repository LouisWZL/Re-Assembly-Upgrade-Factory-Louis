// @ts-nocheck
'use client'

import { useState, useEffect, useCallback } from 'react';
import { useFactory } from '@/contexts/factory-context';
import { useSimulation } from '@/contexts/simulation-context';
import { useRouter } from 'next/navigation';
import { getAdvancedSimulationData } from '@/app/actions/advanced-simulation.actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Pause, Square, RefreshCw, Settings, Plus, Clock, Trash2, BarChart3, ArrowLeft } from 'lucide-react';
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
import '@xyflow/react/dist/style.css';
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
  Tooltip,
  Legend,
  ResponsiveContainer
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
  const [lastRealTime, setLastRealTime] = useState(Date.now());
  
  // Local simulation data
  const [localStations, setLocalStations] = useState<SimulationStation[]>([]);
  const [factoryData, setFactoryData] = useState<any>(null);
  
  
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
  
  // Station configuration dialog
  const [selectedStation, setSelectedStation] = useState<SimulationStation | null>(null);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [tempProcessingTime, setTempProcessingTime] = useState(0);
  
  // Inspection settings
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [reassemblyPercentage, setReassemblyPercentage] = useState(25); // Default 25% need reassembly

  // Load factory data
  useEffect(() => {
    if (activeFactory) {
      loadSimulationData();
    }
  }, [activeFactory]);

  const loadSimulationData = async () => {
    if (!activeFactory) return;
    
    setLoading(true);
    try {
      const result = await getAdvancedSimulationData(activeFactory.id);
      
      if (result.success && result.data) {
        setFactoryData(result.data);
        
        // Initialize stations with stochastic variations and capacity limits
        const mainStations: SimulationStation[] = [
          { id: 'order-acceptance', name: 'Auftragsannahme', type: 'MAIN', phase: 'AUFTRAGSANNAHME', processingTime: 5, stochasticVariation: 0.2, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'inspection', name: 'Inspektion', type: 'MAIN', phase: 'INSPEKTION', processingTime: 15, stochasticVariation: 0.3, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'demontage-waiting', name: 'Warteschlange Demontage', type: 'MAIN', phase: 'DEMONTAGE', processingTime: 2, stochasticVariation: 0.1, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'demontage', name: 'Demontage', type: 'MAIN', phase: 'DEMONTAGE', processingTime: 0, stochasticVariation: 0.25, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'reassembly', name: 'Re-Assembly', type: 'MAIN', phase: 'REASSEMBLY', processingTime: 0, stochasticVariation: 0.25, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'quality', name: 'Qualitätsprüfung', type: 'MAIN', phase: 'QUALITAETSPRUEFUNG', processingTime: 20, stochasticVariation: 0.4, currentOrder: null, waitingQueue: [], capacity: 1 },
          { id: 'shipping', name: 'Versand', type: 'MAIN', phase: 'VERSAND', processingTime: 10, stochasticVariation: 0.2, currentOrder: null, waitingQueue: [], capacity: 1 }
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
        console.log('Used Baugruppentypen:', usedBaugruppentypen.map(b => b.name));

        // Add sub-stations for Demontage and Re-Assembly based on actually used Baugruppentypen
        const demontageSubStations: SimulationStation[] = usedBaugruppentypen.map((sub: any) => ({
          id: `demontage-${sub.id}`,
          name: sub.name,
          type: 'SUB' as const,
          parent: 'demontage',
          baugruppentypId: sub.baugruppentypId,
          processingTime: 30, // Default 30 minutes
          stochasticVariation: 0.3,
          currentOrder: null,
          waitingQueue: [],
          capacity: 1
        }));
        
        const reassemblySubStations: SimulationStation[] = usedBaugruppentypen.map((sub: any) => ({
          id: `reassembly-${sub.id}`,
          name: sub.name.replace('Demontage', 'Montage'), // Convert Demontage to Montage for reassembly stations
          type: 'SUB' as const,
          parent: 'reassembly',
          baugruppentypId: sub.baugruppentypId,
          processingTime: 45, // Default 45 minutes
          stochasticVariation: 0.25,
          currentOrder: null,
          waitingQueue: [],
          capacity: 1
        }));
        
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
            stationDurations: {},
            isWaiting: false,
            processSequences: order.processSequences, // Include the JSON data from database
            selectedSequence: selectedSequence, // Store the selected sequence
            currentSequenceStep: 0 // Start at beginning of sequence
          };
        });
        
        setActiveOrders(simulationOrders);
        
        // Don't set simulation start time here - wait for user to press Start
        // setSimulationStartTime(new Date());
        
        // Create flow diagram after state is set
        setTimeout(() => {
          createFlowDiagram(mainStations, demontageSubStations, reassemblySubStations);
        }, 100);
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
          processSequence.push('order-acceptance', 'inspection', 'demontage-waiting');
        }
      } else if (step === '×') {
        // Quality check transition - this separates demontage from reassembly
        // No station added, just a marker in the sequence
      } else if (step === 'Q') {
        // Quality and shipping
        processSequence.push('quality', 'shipping');
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
    
    sequence.push('quality', 'shipping');
    
    // Add waiting station before disassembly operations
    return addWaitingStationBeforeDisassembly(sequence);
  };

  // Add waiting list before entering disassembly
  const addWaitingStationBeforeDisassembly = (sequence: string[]): string[] => {
    const newSequence = [...sequence];
    const inspectionIndex = sequence.indexOf('inspection');
    const demontageIndex = sequence.findIndex(s => s.includes('demontage') && s !== 'demontage-waiting');
    
    if (inspectionIndex !== -1 && demontageIndex !== -1) {
      // Insert waiting station between inspection and first disassembly
      newSequence.splice(demontageIndex, 0, 'demontage-waiting');
    }
    
    return newSequence;
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
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    
    // Calculate dynamic heights based on number of sub-stations (vertical layout)
    const demontageHeight = Math.max(350, 120 + demontageSubStations.length * 80 + 40);
    const reassemblyHeight = Math.max(350, 120 + reassemblySubStations.length * 80 + 40);
    
    // Main stations as horizontal flow
    mainStations.forEach((station, index) => {
      const isParent = station.id === 'demontage' || station.id === 'reassembly';
      const isDemontage = station.id === 'demontage';
      const isReassembly = station.id === 'reassembly';
      
      let dynamicHeight = 80;
      let title = station.name;
      
      if (isDemontage) {
        dynamicHeight = demontageHeight;
        title = ''; // Empty for floating title
      } else if (isReassembly) {
        dynamicHeight = reassemblyHeight;
        title = ''; // Empty for floating title
      }
      
      flowNodes.push({
        id: station.id,
        type: isParent ? 'group' : 'default',
        position: { x: index * 320, y: 100 },
        data: { 
          label: (
            <div className="text-center">
              <div className="font-bold">{title}</div>
              {!isParent && (
                <>
                  <div className="text-xs text-gray-500">Zeit: {station.processingTime} min (±{Math.round(station.stochasticVariation * 100)}%)</div>
                  <div className="text-xs text-blue-500">Belegt: {station.currentOrder ? '1' : '0'}</div>
                </>
              )}
            </div>
          )
        },
        style: {
          background: isParent ? '#f0f0f0' : '#ffffff',
          border: '2px solid #1e40af',
          borderRadius: '8px',
          padding: isParent ? '20px' : '10px',
          width: isParent ? 220 : 180,
          height: dynamicHeight
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      });
      
      // Skip automatic edge creation here - we'll create them manually below
    });
    
    // Add sub-stations for Demontage (process graph style with attractive layout)
    demontageSubStations.forEach((subStation, index) => {
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
    
    // Add sub-stations for Re-Assembly (process graph style with attractive layout)
    reassemblySubStations.forEach((subStation, index) => {
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

    // Add floating title nodes for demontage and reassembly areas
    if (demontageSubStations.length > 0) {
      const demontageMainNode = flowNodes.find(n => n.id === 'demontage');
      if (demontageMainNode) {
        flowNodes.push({
          id: 'demontage-title',
          type: 'default',
          position: { 
            x: demontageMainNode.position.x + 50, 
            y: demontageMainNode.position.y - 40 
          },
          data: {
            label: (
              <div className="text-center bg-blue-600 text-white px-3 py-1 rounded-md font-bold text-sm shadow-lg">
                Demontage-Bereich
              </div>
            )
          },
          style: {
            background: 'transparent',
            border: 'none',
            width: 120,
            height: 30
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          draggable: false,
          selectable: false
        });
      }
    }

    if (reassemblySubStations.length > 0) {
      const reassemblyMainNode = flowNodes.find(n => n.id === 'reassembly');
      if (reassemblyMainNode) {
        flowNodes.push({
          id: 'reassembly-title',
          type: 'default',
          position: { 
            x: reassemblyMainNode.position.x + 50, 
            y: reassemblyMainNode.position.y - 40 
          },
          data: {
            label: (
              <div className="text-center bg-green-600 text-white px-3 py-1 rounded-md font-bold text-sm shadow-lg">
                Re-Assembly-Bereich
              </div>
            )
          },
          style: {
            background: 'transparent',
            border: 'none',
            width: 140,
            height: 30
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          draggable: false,
          selectable: false
        });
      }
    }
    
    // Connect all main stations with proper flow - complete process chain
    // Create connections between all main process boxes
    const mainStationIds = mainStations.map(s => s.id);
    console.log('Creating flow edges for main stations:', mainStationIds);
    
    // Verify that all required station IDs exist in flowNodes
    const existingNodeIds = flowNodes.map(n => n.id);
    console.log('Existing node IDs:', existingNodeIds);
    
    // Check if required nodes exist before creating edges
    const requiredIds = ['order-acceptance', 'inspection', 'demontage-waiting', 'demontage', 'reassembly', 'quality', 'shipping'];
    const missingIds = requiredIds.filter(id => !existingNodeIds.includes(id));
    if (missingIds.length > 0) {
      console.error('Missing node IDs for connections:', missingIds);
    }
    
    // Add scheduling squares (decorative, not affecting flow) - positioned in the process path
    const orderAcceptanceNode = flowNodes.find(n => n.id === 'order-acceptance');
    const inspectionNode = flowNodes.find(n => n.id === 'inspection');
    const demontageWaitingNode = flowNodes.find(n => n.id === 'demontage-waiting');
    
    if (orderAcceptanceNode) {
      // 1. Circle connector between start and Auftragsannahme
      flowNodes.push({
        id: 'circle-1',
        type: 'default',
        position: { x: orderAcceptanceNode.position.x - 100, y: orderAcceptanceNode.position.y + 35 },
        data: {
          label: ''
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
        selectable: false
      });
    }
    
    if (orderAcceptanceNode && inspectionNode) {
      // 2. Circle connector between Auftragsannahme and Inspektion
      const midX = (orderAcceptanceNode.position.x + 180 + inspectionNode.position.x) / 2 - 15; // Center between stations
      flowNodes.push({
        id: 'circle-2',
        type: 'default',
        position: { x: midX, y: orderAcceptanceNode.position.y + 35 },
        data: {
          label: ''
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
        selectable: false
      });
    }
      
    if (inspectionNode && demontageWaitingNode) {
      // 3. Circle connector between Inspektion and Demontage Waiting
      const midX = (inspectionNode.position.x + 180 + demontageWaitingNode.position.x) / 2 - 15; // Center between stations
      flowNodes.push({
        id: 'circle-3',
        type: 'default',
        position: { x: midX, y: inspectionNode.position.y + 35 },
        data: {
          label: ''
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
        selectable: false
      });
    }
    
    // CRITICAL: Create all main process flow connections FIRST
    // Main station connections (must be complete for simulation to work)
    const mainStationEdges = [
      { id: 'circle-1-order-acceptance', source: 'circle-1', target: 'order-acceptance' },
      { id: 'order-acceptance-circle-2', source: 'order-acceptance', target: 'circle-2' },
      { id: 'circle-2-inspection', source: 'circle-2', target: 'inspection' },
      { id: 'inspection-circle-3', source: 'inspection', target: 'circle-3' },
      { id: 'circle-3-demontage-waiting', source: 'circle-3', target: 'demontage-waiting' },
      { id: 'demontage-waiting-demontage-title', source: 'demontage-waiting', target: 'demontage-title' },
      { id: 'demontage-title-demontage', source: 'demontage-title', target: 'demontage' },
      { id: 'demontage-reassembly', source: 'demontage', target: 'reassembly', animated: true },
      { id: 'demontage-title-reassembly-title', source: 'demontage-title', target: 'reassembly-title', animated: true },
      { id: 'reassembly-reassembly-title', source: 'reassembly', target: 'reassembly-title', animated: true },
      { id: 'reassembly-title-quality', source: 'reassembly-title', target: 'quality' },
      { id: 'quality-shipping', source: 'quality', target: 'shipping' }
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
    
    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Simulation engine - now handled in context, but we still need to process orders
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const realTimeDelta = now - lastRealTime;
      const simulationTimeDelta = realTimeDelta * speed;
      
      setLastRealTime(now);
      
      // Process orders through stations
      processOrders(simulationTimeDelta / 60000); // Convert to minutes
    }, 100); // Update every 100ms
    
    return () => clearInterval(interval);
  }, [isRunning, speed, lastRealTime]);

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

  const processOrders = (deltaMinutes: number) => {
    setContextStations((prevStations: any) => {
      const updatedStations = [...prevStations];
      const newCompletedOrders: SimulationOrder[] = [];
      const updatedOrders: SimulationOrder[] = [];
      const waitingOrdersList: SimulationOrder[] = [];
      
      // First, assign unassigned orders to available stations
      activeOrders.forEach(order => {
        const currentStationData = updatedStations.find(s => s.id === order.currentStation);
        
        // Debug logging for demontage-waiting assignment
        if (order.currentStation === 'demontage-waiting' && currentStationData) {
          console.log(`Assigning ${order.kundeName} to demontage-waiting:`, {
            stationHasCurrentOrder: !!currentStationData.currentOrder,
            orderIsWaiting: order.isWaiting,
            willAssign: !currentStationData.currentOrder && !order.isWaiting
          });
        }
        
        // If order is at a station but not assigned to the station, assign it (unless station is busy)
        if (currentStationData && !currentStationData.currentOrder && !order.isWaiting) {
          currentStationData.currentOrder = order;
          console.log(`Assigned ${order.kundeName} to ${currentStationData.name}`);
        }
      });
      
      // Process orders currently in stations
      activeOrders.forEach(order => {
        const currentStationData = updatedStations.find(s => s.id === order.currentStation);
        
        // Debug logging for demontage-waiting
        if (order.currentStation === 'demontage-waiting') {
          console.log(`Order ${order.kundeName} at demontage-waiting:`, {
            isAssignedToStation: currentStationData?.currentOrder?.id === order.id,
            progress: order.progress,
            isWaiting: order.isWaiting,
            nextStation: order.processSequence[order.processSequence.indexOf(order.currentStation) + 1]
          });
        }
        
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
          }
          
          const prevProgress = order.progress;
          const requiredTime = order.stationDurations[order.currentStation].actual || currentStationData.processingTime;
          order.progress = Math.min(order.progress + deltaMinutes, requiredTime); // Cap progress at required time
          
          // Debug if we hit the cap
          if (prevProgress + deltaMinutes > requiredTime && order.progress === requiredTime) {
            console.log(`Progress capped for ${order.kundeName} at ${order.currentStation}: was going to be ${(prevProgress + deltaMinutes).toFixed(2)}, capped at ${requiredTime.toFixed(2)}`);
          }
          
          // Debug logging for demontage-waiting progress
          if (order.currentStation === 'demontage-waiting') {
            console.log(`${order.kundeName} demontage-waiting progress: ${order.progress.toFixed(2)}/${requiredTime.toFixed(2)}`);
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
            
            // Free current station
            currentStationData.currentOrder = null;
            
            // Try to assign next order from waiting queue to current station using selected scheduling algorithm
            if (currentStationData.waitingQueue.length > 0) {
              const schedulingStrategy = schedulingStrategies[currentSchedulingAlgorithm as SchedulingAlgorithm];
              const nextOrder = schedulingStrategy.selectNext(currentStationData.waitingQueue, simulationTime);
              
              if (nextOrder) {
                // Remove the selected order from the waiting queue
                const orderIndex = currentStationData.waitingQueue.findIndex(o => o.id === nextOrder.id);
                if (orderIndex >= 0) {
                  currentStationData.waitingQueue.splice(orderIndex, 1);
                  currentStationData.currentOrder = nextOrder;
                  nextOrder.isWaiting = false;
                  
                  // CRITICAL FIX: Initialize proper stationDurations when order starts processing
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
                }
              }
            }
            
            // Simplified logic: just follow the processSequence array in order
            const currentIndex = order.processSequence.indexOf(order.currentStation);
            console.log(`${order.kundeName} completed ${order.currentStation}, current index: ${currentIndex}, sequence length: ${order.processSequence.length}`);
            
            if (currentIndex < order.processSequence.length - 1) {
              const nextStationId = order.processSequence[currentIndex + 1];
              const nextStation = updatedStations.find(s => s.id === nextStationId);
              
              console.log(`${order.kundeName} moving from ${order.currentStation} to ${nextStationId}`);
              
              if (nextStation) {
                if (nextStation.currentOrder === null) {
                  // Next station is free, assign immediately
                  nextStation.currentOrder = order;
                  order.currentStation = nextStationId;
                  order.progress = 0;
                  order.isWaiting = false;
                  console.log(`${order.kundeName} assigned directly to ${nextStationId}`);
                } else {
                  // Next station is busy, add to waiting queue
                  nextStation.waitingQueue.push(order);
                  order.currentStation = nextStationId;
                  order.progress = 0;
                  order.isWaiting = true;
                  // Initialize waiting time tracking - but don't set actual time yet
                  if (!order.stationDurations[nextStationId]) {
                    order.stationDurations[nextStationId] = {
                      expected: nextStation.processingTime,
                      waitingTime: 0,
                      startTime: new Date(),
                      completed: false
                      // actual time will be set when order actually starts processing
                    };
                  }
                  waitingOrdersList.push(order);
                  console.log(`${order.kundeName} added to waiting queue of ${nextStationId}`);
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

  // Prepare data for stacked bar chart
  const prepareChartData = () => {
    return completedOrders.map((order: any, index) => {
      const processingTime = Object.values(order.stationDurations || {})
        .filter((d: any) => d.completed)
        .reduce((sum: number, d: any) => sum + (d.actual || 0), 0);
      const waitingTime = Object.values(order.stationDurations || {})
        .filter((d: any) => d.completed)
        .reduce((sum: number, d: any) => sum + (d.waitingTime || 0), 0);

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
      // Ensure we have stations data
      if (!stations || !Array.isArray(stations) || stations.length === 0) {
        console.log('No stations data available, stations:', stations);
        return [];
      }
      
      console.log('All stations available:', stations.map(s => ({ 
        id: s.id, 
        name: s.name, 
        type: s.type, 
        parent: s.parent || 'no-parent' 
      })));
      
      // Get all sub-stations regardless of filtering - let's see what we actually have
      const subStations = stations.filter(s => s?.type === 'SUB');
      console.log('All SUB stations found:', subStations.map(s => ({ 
        id: s.id, 
        name: s.name, 
        parent: s.parent || 'no-parent' 
      })));
      
      const demontageStations = stations.filter(s => s?.type === 'SUB' && s?.parent === 'demontage').slice(0, 6);
      const reassemblyStations = stations.filter(s => s?.type === 'SUB' && s?.parent === 'reassembly').slice(0, 6);
      
      // If no SUB stations with parent, try with different criteria
      if (demontageStations.length === 0 && reassemblyStations.length === 0) {
        // Try finding stations by ID pattern
        const demontageByPattern = stations.filter(s => s?.id?.includes('demontage-')).slice(0, 6);
        const reassemblyByPattern = stations.filter(s => s?.id?.includes('reassembly-')).slice(0, 6);
        
        console.log('Trying pattern match:', {
          demontageByPattern: demontageByPattern.map(s => ({ id: s.id, name: s.name })),
          reassemblyByPattern: reassemblyByPattern.map(s => ({ id: s.id, name: s.name }))
        });
        
        if (demontageByPattern.length > 0 || reassemblyByPattern.length > 0) {
          const allStations = [...demontageByPattern, ...reassemblyByPattern];
          return allStations.map(station => ({
            name: `${station.id?.includes('demontage') ? 'Disassembly' : 'Assembly'}: ${station.name || 'Unknown'}`,
            station: station.name || 'Unknown',
            utilizationRate: 0,
            processingTime: 0,
            totalTime: 0
          }));
        }
      }
      
      const allSubStations = [...demontageStations, ...reassemblyStations];
      
      console.log('Final station selection:', {
        demontage: demontageStations.length,
        reassembly: reassemblyStations.length,
        total: allSubStations.length,
        demontageStations: demontageStations.map(s => ({ id: s.id, name: s.name, parent: s.parent })),
        reassemblyStations: reassemblyStations.map(s => ({ id: s.id, name: s.name, parent: s.parent }))
      });
      
      // If we still have no stations, return empty array
      if (allSubStations.length === 0) {
        console.log('No SUB stations found with proper filtering');
        return [];
      }
      
      // Ensure we have valid simulation times
      if (!simulationTime || !simulationStartTime) {
        console.log('No simulation times, returning stations with 0% utilization');
        return allSubStations.map((station) => {
          const stationType = station.parent === 'demontage' ? 'Disassembly' : 'Assembly';
          const stationName = station.name || 'Unknown';
          return {
            name: `${stationType}: ${stationName}`,
            station: stationName,
            utilizationRate: 0,
            processingTime: 0,
            totalTime: 0
          };
        });
      }
      
      // Return empty data if simulation hasn't started
      if (!simulationStartTime) {
        return allSubStations.map(station => ({
          name: `${station.parent === 'demontage' ? 'Disassembly' : 'Assembly'}: ${station.name || 'Unknown'}`,
          station: station.name || 'Unknown',
          utilizationRate: 0,
          processingTime: 0,
          totalTime: 0
        }));
      }
      
      const currentTime = simulationTime.getTime();
      const simulationDurationMs = currentTime - simulationStartTime.getTime();
      const simulationDurationMinutes = Math.max(simulationDurationMs / (1000 * 60), 0.01); // Minimum 0.01 minutes
      
      console.log('BAR CHART - Simulation timing:', {
        currentTime: new Date(currentTime).toISOString(),
        startTime: new Date(simulationStartTime.getTime()).toISOString(),
        durationMs: simulationDurationMs,
        durationMinutes: simulationDurationMinutes.toFixed(2),
        completedOrders: completedOrders.length,
        activeOrders: activeOrders.length
      });
      
      return allSubStations.map(station => {
        if (!station?.id) {
          return {
            name: 'Unknown Station',
            station: 'Unknown',
            utilizationRate: 0,
            processingTime: 0,
            totalTime: parseFloat(simulationDurationMinutes.toFixed(1))
          };
        }
        
        // Calculate total processing time for this station from all completed orders
        const completedOrdersDebug: any[] = [];
        const totalProcessingTime = (completedOrders || []).reduce((sum: number, order: any) => {
          const stationDuration = order?.stationDurations?.[station.id];
          const actualTime = stationDuration?.actual || 0;
          if (actualTime > 0) {
            completedOrdersDebug.push({ orderId: order.id, actualTime });
          }
          return sum + actualTime;
        }, 0);
        
        // Also include time from currently active orders at this station
        const activeOrdersDebug: any[] = [];
        const activeProcessingTime = (activeOrders || []).reduce((sum: number, order: any) => {
          if (order.currentStation === station.id && !order.isWaiting) {
            const progress = order.progress || 0;
            if (progress > 0) {
              activeOrdersDebug.push({ orderId: order.id, progress });
            }
            return sum + progress;
          }
          return sum;
        }, 0);
        
        const totalStationTime = totalProcessingTime + activeProcessingTime;
        
        // Calculate utilization percentage - capped at 100%
        const utilizationRate = simulationDurationMinutes > 0 
          ? Math.min((totalStationTime / simulationDurationMinutes) * 100, 100)
          : 0;
          
        // Debug impossible utilization
        if (utilizationRate > 100) {
          console.error(`🚨 BAR CHART IMPOSSIBLE UTILIZATION: Station ${station.id}:`, {
            totalStationTime: totalStationTime.toFixed(1) + 'min',
            simulationDuration: simulationDurationMinutes.toFixed(1) + 'min',
            completedOrdersTime: totalProcessingTime.toFixed(1) + 'min',
            activeOrdersTime: activeProcessingTime.toFixed(1) + 'min',
            completedOrdersDetail: completedOrdersDebug,
            activeOrdersDetail: activeOrdersDebug,
            ratio: utilizationRate.toFixed(1) + '%'
          });
        }
        
        // Debug high utilization for tracking
        if (utilizationRate > 50) {
          console.log(`BAR CHART Station ${station.id} high utilization:`, {
            utilizationRate: utilizationRate.toFixed(1) + '%',
            totalTime: totalStationTime.toFixed(1) + 'min',
            simulationDuration: simulationDurationMinutes.toFixed(1) + 'min'
          });
        }
        
        // Determine station type and use the actual station name (Baugruppentyp name)
        const stationType = station.parent === 'demontage' ? 'Disassembly' : 'Assembly';
        const stationName = station.name || 'Unknown';
        
        const result = {
          name: `${stationType}: ${stationName}`,
          station: stationName,
          utilizationRate: parseFloat(utilizationRate.toFixed(1)) || 0,
          processingTime: parseFloat(totalStationTime.toFixed(1)) || 0,
          totalTime: parseFloat(simulationDurationMinutes.toFixed(1)) || 0
        };
        
        // Always log station info for debugging
        console.log(`Station ${station.id}:`, result);
        
        return result;
      });
    } catch (error) {
      console.error('Error in prepareStationUtilizationData:', error);
      return [];
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

  const handleSpeedChange = (value: number[]) => {
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
        <AdvancedKPIDashboard 
          orders={activeOrders}
          completedOrders={completedOrders}
          stations={stations}
          onClearData={handleClearAllOrders}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 h-full">
      {/* Main Content - Left Side */}
      <div className="xl:col-span-3 space-y-4">
        {/* Control Panel */}
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-col gap-3">
              {/* First Row: Control Buttons and Speed/Time */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Control Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                  onClick={() => {
                    if (!isRunning && !simulationStartTime) {
                      // Only set start time on FIRST start, not on resume
                      // Use current simulationTime as the start time to ensure they're synchronized
                      setSimulationStartTime(simulationTime);
                      console.log('Simulation FIRST start at:', simulationTime.toISOString());
                    } else if (!isRunning) {
                      console.log('Simulation resumed, keeping original start time');
                    }
                    setIsRunning(!isRunning);
                  }}
                  className={isRunning ? "" : "bg-blue-600 hover:bg-blue-700"}
                  variant={isRunning ? "destructive" : "default"}
                >
                  {isRunning ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={() => {
                    setIsRunning(false);
                    setActiveOrders([]);
                    setCompletedOrders([]);
                    setSimulationTime(new Date());
                    setSimulationStartTime(null); // Clear start time so next start is a fresh start
                    console.log('Simulation STOPPED and RESET');
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </Button>
                
                <Button
                  onClick={loadSimulationData}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Neu laden
                </Button>
                
                <Button
                  onClick={handleCreateNewOrder}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!activeFactory}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Neuer Auftrag
                </Button>
                
                <Button
                  onClick={handleClearAllOrders}
                  className="bg-white text-[#1a48a5] border-[#1a48a5] hover:bg-[#1a48a5]/5"
                  variant="outline"
                  disabled={activeOrders.length === 0 && completedOrders.length === 0}
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Alle Aufträge löschen
                </Button>
                
                <Button
                  onClick={() => setCurrentView('kpi')}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Data
                </Button>
              </div>
              
              {/* Speed and Time Controls */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Geschwindigkeit:</Label>
                  <Slider
                    value={[speed]}
                    onValueChange={handleSpeedChange}
                    min={1}
                    max={100}
                    step={1}
                    className="w-24"
                  />
                  <span className="text-sm font-medium w-8">{speed}x</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono text-sm">
                    {simulationTime.toLocaleString('de-DE')}
                  </span>
                </div>
              </div>
              </div>
              
              {/* Second Row: Algorithm Dropdowns */}
              <div className="flex items-center gap-4">
                {/* Terminierung Dropdown */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Terminierung:</Label>
                  <Select
                    value={currentSchedulingAlgorithm}
                    onValueChange={(value: SchedulingAlgorithm | string) => {
                      if (value in SchedulingAlgorithm) {
                        setCurrentSchedulingAlgorithm(value as SchedulingAlgorithm);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Wähle Algorithmus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SchedulingAlgorithm.FIFO}>
                        FIFO - First In First Out
                      </SelectItem>
                      <SelectItem value="empty1" disabled>
                        --- Leer ---
                      </SelectItem>
                      <SelectItem value="empty2" disabled>
                        --- Leer ---
                      </SelectItem>
                      <SelectItem value="empty3" disabled>
                        --- Leer ---
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Beschaffungsplanung Dropdown */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Beschaffungsplanung:</Label>
                  <Select
                    value="none"
                    disabled
                  >
                    <SelectTrigger className="w-[200px]">
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
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">{activeOrders.length}</div>
              <p className="text-xs text-muted-foreground">Aktive Aufträge</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">{waitingOrders.length}</div>
              <p className="text-xs text-muted-foreground">Wartende Aufträge</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">{completedOrders.length}</div>
              <p className="text-xs text-muted-foreground">Abgeschlossen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">{stations.length}</div>
              <p className="text-xs text-muted-foreground">Stationen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xl font-bold">
                {stations.filter(s => s.currentOrder !== null).length}
              </div>
              <p className="text-xs text-muted-foreground">Stationen belegt</p>
            </CardContent>
          </Card>
        </div>

        {/* Process Flow Diagram */}
        <Card>
          <CardHeader>
            <CardTitle>Prozessfluss</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 400 }}>
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
              >
                <Background />
                <Controls />
                <MiniMap />
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
              {activeOrders.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Keine aktiven Aufträge</p>
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
                          
                          return (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.kundeName}</TableCell>
                              <TableCell>{order.produktvariante}</TableCell>
                              <TableCell>
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                  {currentStationData?.name || 'Unbekannt'}
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
                  <Tooltip 
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
                if (!stations || stations.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-[200px] text-center">
                      <p className="text-gray-500 text-sm">
                        Keine Stationen konfiguriert
                      </p>
                    </div>
                  );
                }
                
                // Ensure we have the required context values
                if (typeof simulationTime === 'undefined' || typeof simulationStartTime === 'undefined') {
                  return (
                    <div className="flex items-center justify-center h-[200px] text-center">
                      <p className="text-gray-500 text-sm">
                        Simulation wird initialisiert...
                      </p>
                    </div>
                  );
                }

              // Get all SUB stations directly with safe filtering - excluding demontage waiting queue
              const demontageStations = stations.filter(s => {
                try {
                  return (s?.id?.includes('demontage-') || (s?.type === 'SUB' && s?.parent === 'demontage')) 
                    && s?.id !== 'demontage-waiting'; // Exclude the waiting queue
                } catch (e) {
                  console.warn('Error filtering demontage station:', s, e);
                  return false;
                }
              });
              
              const reassemblyStations = stations.filter(s => {
                try {
                  return s?.id?.includes('reassembly-') || (s?.type === 'SUB' && s?.parent === 'reassembly');
                } catch (e) {
                  console.warn('Error filtering reassembly station:', s, e);
                  return false;
                }
              });
              
              const allSubStations = [...demontageStations, ...reassemblyStations];
              
              if (allSubStations.length === 0) {
                return (
                  <div className="flex items-center justify-center h-[200px] text-center">
                    <div>
                      <p className="text-gray-500 text-sm mb-2">
                        Keine Unter-Stationen gefunden
                      </p>
                      <p className="text-xs text-gray-400">
                        {stations.length} Stationen verfügbar, aber keine SUB-Stationen
                      </p>
                    </div>
                  </div>
                );
              }

              // Skip utilization calculation if simulation hasn't started
              if (!simulationStartTime) {
                return (
                  <div 
                    key={station.id} 
                    className="p-1 border rounded bg-gray-50"
                  >
                    <div className="text-[7px] font-medium text-gray-600 leading-tight">
                      {(station.id?.includes('demontage') || station.parent === 'demontage') ? 'Disassembly' : 'Assembly'}
                    </div>
                    <div className="text-[8px] font-semibold text-gray-800 leading-tight truncate" title={station.name || 'Unknown Station'}>
                      {station.name || 'Unknown'}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      0%
                    </div>
                  </div>
                );
              }
              
              // Calculate utilization for each station
              const currentTime = simulationTime.getTime();
              const startTime = simulationStartTime.getTime();
              const simulationDurationMs = Math.max(currentTime - startTime, 1000); // At least 1 second
              const simulationDurationMinutes = simulationDurationMs / (1000 * 60);
              
              // Debug logging to track timing
              console.log('Utilization calculation timing:', {
                currentTime: new Date(currentTime).toISOString(),
                startTime: new Date(startTime).toISOString(),
                durationMinutes: simulationDurationMinutes.toFixed(2),
                isRunning
              });

              return (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {allSubStations.slice(0, 12).map((station, index) => {
                    try {
                      if (!station || !station.id) {
                        return (
                          <div key={`unknown-${index}`} className="p-3 border rounded-lg bg-gray-50">
                            <div className="text-xs text-gray-500">Unknown Station</div>
                          </div>
                        );
                      }

                      // Calculate CUMULATIVE processing time - avoiding double counting
                      let totalProcessingTime = 0;
                      
                      // Track which orders we've already counted to avoid double counting
                      const countedOrders = new Set<string>();
                      
                      // Add time from completed orders
                      (completedOrders || []).forEach((order: any) => {
                        try {
                          const stationDuration = order?.stationDurations?.[station.id];
                          if (stationDuration?.actual && !countedOrders.has(order.id)) {
                            totalProcessingTime += stationDuration.actual;
                            countedOrders.add(order.id);
                          }
                        } catch (e) {
                          console.warn('Error calculating processing time for completed order:', order?.id, e);
                        }
                      });

                      // Add time from active orders - either current progress OR completed time, not both
                      (activeOrders || []).forEach((order: any) => {
                        try {
                          if (countedOrders.has(order.id)) return; // Skip if already counted
                          
                          const stationDuration = order?.stationDurations?.[station.id];
                          
                          if (stationDuration?.completed && stationDuration?.actual) {
                            // Order has passed through this station - count the completed time
                            totalProcessingTime += stationDuration.actual;
                            countedOrders.add(order.id);
                          } else if (order?.currentStation === station.id && !order?.isWaiting) {
                            // Order is currently processing at this station - count current progress
                            totalProcessingTime += (order?.progress || 0);
                            countedOrders.add(order.id);
                          }
                        } catch (e) {
                          console.warn('Error calculating active processing time for order:', order?.id, e);
                        }
                      });
                      
                      // Enhanced debugging for troubleshooting
                      if (totalProcessingTime > 0) {
                        console.log(`Station ${station.id} (${station.name}):`, {
                          totalProcessingTime: totalProcessingTime.toFixed(1),
                          simulationDurationMinutes: simulationDurationMinutes.toFixed(1),
                          countedOrders: countedOrders.size,
                          utilizationRate: ((totalProcessingTime / simulationDurationMinutes) * 100).toFixed(1) + '%'
                        });
                      }
                      
                      if (totalProcessingTime > simulationDurationMinutes) {
                        console.error(`🚨 IMPOSSIBLE UTILIZATION: Station ${station.id}:`, {
                          totalProcessingTime: totalProcessingTime.toFixed(1) + 'min',
                          simulationDuration: simulationDurationMinutes.toFixed(1) + 'min',
                          countedOrders: Array.from(countedOrders),
                          ratio: ((totalProcessingTime / simulationDurationMinutes) * 100).toFixed(1) + '%'
                        });
                      }

                      // Pure mathematical calculation: cumulative processing time / total simulation time
                      // Capped at 100% to prevent display issues
                      const utilizationRate = simulationDurationMinutes > 0 
                        ? Math.min((totalProcessingTime / simulationDurationMinutes) * 100, 100)
                        : 0;

                      const stationType = (station.id?.includes('demontage') || station.parent === 'demontage') ? 'Disassembly' : 'Assembly';
                      const isActive = station.currentOrder !== null;

                      return (
                        <div 
                          key={station.id} 
                          className={`p-1 border rounded ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}`}
                        >
                          <div className="text-[7px] font-medium text-gray-600 leading-tight">
                            {stationType}
                          </div>
                          <div className="text-[8px] font-semibold text-gray-800 leading-tight truncate" title={station.name || 'Unknown Station'}>
                            {station.name || 'Unknown'}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className={`text-[10px] font-bold ${utilizationRate >= 70 ? 'text-green-600' : utilizationRate >= 50 ? 'text-blue-600' : utilizationRate >= 30 ? 'text-orange-600' : 'text-red-600'}`}>
                              {(utilizationRate || 0).toFixed(1)}%
                            </div>
                            <div className="text-[7px] text-gray-500">
                              {isActive ? 'A' : 'F'}
                            </div>
                          </div>
                        </div>
                      );
                    } catch (e) {
                      console.error('Error rendering station:', station?.id, e);
                      return (
                        <div key={`error-${index}`} className="p-3 border rounded-lg bg-red-50">
                          <div className="text-xs text-red-600">Station Error</div>
                        </div>
                      );
                    }
                  })}
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
                        Überprüfen Sie die Browser-Konsole für Details
                      </p>
                    </div>
                  </div>
                );
              }
            })()}
          </CardContent>
        </Card>

        {/* Placeholder for Future Changeover Times Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rüstzeiten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[300px] text-center">
              <p className="text-gray-500 text-sm">
                Kommende Funktionalität:<br/>
                Durchschnittliche Rüstzeiten<br/>
                pro Station
              </p>
            </div>
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

    </div>
  );
}