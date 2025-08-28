'use client'

import { useState } from 'react'
import { SiteHeader } from '@/components/site-header'
import { SidebarProvider } from '@/components/ui/sidebar'
// Keeping imports for future use but hiding Basic Simulation
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// import { Settings, BarChart3 } from 'lucide-react'
// import { BasicSimulation } from '@/components/simulation/BasicSimulation'
import { AdvancedFactoryManagement } from '@/components/advanced-simulation/AdvancedFactoryManagementSimplified'

export default function SimulationPage() {
  // Keeping state for future use but not actively used
  // const [activeTab, setActiveTab] = useState('advanced')
  const [simulationTime, setSimulationTime] = useState<Date | undefined>()
  const [isPlaying, setIsPlaying] = useState(false)
  
  return (
    <div className="flex h-screen flex-col [--header-height:calc(theme(spacing.14))]">
      <SidebarProvider className="flex h-full flex-col">
        <SiteHeader 
          onSimulationUpdate={(time, playing) => {
            setSimulationTime(time)
            setIsPlaying(playing)
          }}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <div className="container mx-auto px-4 py-6">
              {/* Direct Advanced Factory Management - no titles needed */}
              <AdvancedFactoryManagement />
              
              {/* Basic Simulation hidden but preserved for future use */}
              {/* 
              <BasicSimulation 
                simulationTime={simulationTime}
                isPlaying={isPlaying}
              />
              */}
            </div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}