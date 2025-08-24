'use client'

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RealDataFactorySimulation } from './RealDataFactorySimulation';
import { AdvancedKPIDashboard } from './AdvancedKPIDashboard';
import { AdvancedInventory } from './AdvancedInventory';
import { AdvancedScheduling } from './AdvancedScheduling';
import { SimulationProvider, useSimulation } from '@/contexts/simulation-context';
import { Package, Calendar, BarChart3, Settings } from 'lucide-react';

function AdvancedFactoryManagementContent() {
  const [activeTab, setActiveTab] = useState('simulation');
  const { completedOrders, activeOrders, stations, simulationStartTime, clearAllData, isRunning } = useSimulation();

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Sub-navigation for Advanced Simulation sections */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Advanced Simulation</h1>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-gray-100">
            <TabsTrigger value="simulation" className="data-[state=active]:bg-white flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Simulation</span>
              {isRunning && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Simulation läuft"></div>
              )}
            </TabsTrigger>
            <TabsTrigger value="kpi" className="data-[state=active]:bg-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">KPI Dashboard</span>
              {isRunning && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Simulation läuft"></div>
              )}
            </TabsTrigger>
            <TabsTrigger value="inventory" className="data-[state=active]:bg-white flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Lagerbestand</span>
              {isRunning && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Simulation läuft"></div>
              )}
            </TabsTrigger>
            <TabsTrigger value="scheduling" className="data-[state=active]:bg-white flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Terminierung</span>
              {isRunning && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Simulation läuft"></div>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="simulation" className="mt-0">
          <RealDataFactorySimulation />
        </TabsContent>
        
        <TabsContent value="kpi" className="mt-0">
          <AdvancedKPIDashboard 
            orders={activeOrders as any}
            completedOrders={completedOrders as any}
            stations={stations as any}
            simulationStartTime={simulationStartTime}
            onClearData={clearAllData}
          />
        </TabsContent>
        
        <TabsContent value="inventory" className="mt-0">
          <div className="text-center py-8 text-gray-500">
            Lagerbestand - In Entwicklung
          </div>
        </TabsContent>
        
        <TabsContent value="scheduling" className="mt-0">
          <AdvancedScheduling />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AdvancedFactoryManagement() {
  return (
    <SimulationProvider>
      <AdvancedFactoryManagementContent />
    </SimulationProvider>
  );
}