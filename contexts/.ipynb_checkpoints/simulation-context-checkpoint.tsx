'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';

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
  processSequences?: any;
  selectedSequence?: any;
  currentSequenceStep?: number;
  schedulingAlgorithm?: string;
}

interface SimulationStation {
  id: string;
  name: string;
  type: 'MAIN' | 'SUB';
  phase?: string;
  processingTime: number;
  stochasticVariation: number;
  currentOrder: SimulationOrder | null;
  waitingQueue: SimulationOrder[];
  baugruppentypId?: string;
  parent?: string;
  capacity: number;
}

interface SimulationContextType {
  completedOrders: SimulationOrder[];
  activeOrders: SimulationOrder[];
  stations: SimulationStation[];
  simulationStartTime: Date | null;
  isRunning: boolean;
  speed: number;
  simulationTime: Date;
  waitingOrders: SimulationOrder[];
  currentSchedulingAlgorithm: string;
  addCompletedOrder: (order: SimulationOrder) => void;
  setActiveOrders: (orders: SimulationOrder[]) => void;
  setStations: (stations: SimulationStation[]) => void;
  clearAllData: () => void;
  setSimulationStartTime: (time: Date | null) => void;
  setIsRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  setSimulationTime: (time: Date) => void;
  setWaitingOrders: (orders: SimulationOrder[]) => void;
  setCurrentSchedulingAlgorithm: (algorithm: string) => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [completedOrders, setCompletedOrders] = useState<SimulationOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<SimulationOrder[]>([]);
  const [stations, setStations] = useState<SimulationStation[]>([]);
  const [simulationStartTime, setSimulationStartTime] = useState<Date | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [simulationTime, setSimulationTime] = useState<Date>(new Date());
  const [waitingOrders, setWaitingOrders] = useState<SimulationOrder[]>([]);
  const lastRealTimeRef = useRef<number>(Date.now());
  const [currentSchedulingAlgorithm, setCurrentSchedulingAlgorithm] = useState<string>('FIFO');

  const addCompletedOrder = (order: SimulationOrder) => {
    setCompletedOrders(prev => {
      // Check if order already exists to prevent duplicates
      if (prev.find(existing => existing.id === order.id)) {
        return prev;
      }
      return [...prev, order];
    });
  };

  const clearAllData = () => {
    setCompletedOrders([]);
    setActiveOrders([]);
    setStations([]);
    setSimulationStartTime(null);
    setIsRunning(false);
    setSpeed(1);
    setSimulationTime(new Date());
    setWaitingOrders([]);
    lastRealTimeRef.current = Date.now();
  };

  // Simulation engine - runs independently of active component
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

      const deltaMinutes = (realTimeDelta / 1000) * speed;
      if (deltaMinutes <= 0) {
        return;
      }

      setSimulationTime(prev => new Date(prev.getTime() + deltaMinutes * 60000));

      // Complex order processing is handled by the RealDataFactorySimulation component.
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, speed]);

  return (
    <SimulationContext.Provider
      value={{
        completedOrders,
        activeOrders,
        stations,
        simulationStartTime,
        isRunning,
        speed,
        simulationTime,
        waitingOrders,
        currentSchedulingAlgorithm,
        addCompletedOrder,
        setActiveOrders,
        setStations,
        clearAllData,
        setSimulationStartTime,
        setIsRunning,
        setSpeed,
        setSimulationTime,
        setWaitingOrders,
        setCurrentSchedulingAlgorithm
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (context === undefined) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
}
