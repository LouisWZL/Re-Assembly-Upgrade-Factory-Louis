'use client'

import { RealDataFactorySimulation } from './RealDataFactorySimulation';
import { SimulationProvider } from '@/contexts/simulation-context';

export function AdvancedFactoryManagement() {
  return (
    <SimulationProvider>
      <div className="container mx-auto px-4 py-6">
        <RealDataFactorySimulation />
      </div>
    </SimulationProvider>
  );
}