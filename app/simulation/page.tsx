'use client'

import { useState } from 'react'
import { SiteHeader } from '@/components/site-header'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, BarChart3 } from 'lucide-react'
import { BasicSimulation } from '@/components/simulation/BasicSimulation'
import { AdvancedFactoryManagement } from '@/components/advanced-simulation/AdvancedFactoryManagementSimplified'

export default function SimulationPage() {
  const [activeTab, setActiveTab] = useState('advanced')
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
              {/* Sub-navigation for Simulation sections */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-4">Simulation</h1>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full max-w-xl grid-cols-2 bg-gray-100">
                    <TabsTrigger value="advanced" className="data-[state=active]:bg-white flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      <span>Advanced Simulation</span>
                    </TabsTrigger>
                    <TabsTrigger value="basic" className="data-[state=active]:bg-white flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Basic Simulation</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsContent value="advanced" className="mt-0">
                  <AdvancedFactoryManagement />
                </TabsContent>
                
                <TabsContent value="basic" className="mt-0">
                  <BasicSimulation 
                    simulationTime={simulationTime}
                    isPlaying={isPlaying}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}