'use client'

import { useState } from 'react'
import { SidebarLeft } from "@/components/sidebar-left"
import { SidebarRight } from "@/components/sidebar-right"
import { SidebarInset } from '@/components/ui/sidebar'
import { OrderProvider } from '@/contexts/order-context'
import { OrderGraphViewer } from '@/components/order-graph-viewer'
import { PhaseTimeline } from '@/components/phase-timeline'
import { useOrder } from '@/contexts/order-context'
import { Skeleton } from '@/components/ui/skeleton'
import { SimulationControlsBar } from './SimulationControlsBar'

interface BasicSimulationProps {
  simulationTime?: Date
  isPlaying?: boolean
}

function BasicSimulationContent({ simulationTime, isPlaying }: BasicSimulationProps) {
  const { selectedOrder, isLoadingOrder } = useOrder()
  const [currentSimulationTime, setCurrentSimulationTime] = useState(simulationTime || new Date())
  const [currentIsPlaying, setCurrentIsPlaying] = useState(isPlaying || false)
  
  return (
    <div className="flex flex-1 overflow-hidden [&_[data-slot=sidebar]]:h-full">
      <SidebarLeft />
      <SidebarInset className="flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col gap-4 p-4">
            {isLoadingOrder ? (
              // Skeleton während des Ladens anzeigen
              <>
                <div className="space-y-3">
                  <Skeleton className="h-48 w-full" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-96 w-full" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-96 w-full" />
                </div>
              </>
            ) : (
              // Normale Anzeige
              <>
                <OrderGraphViewer order={selectedOrder} />
              </>
            )}
          </div>
        </div>
        {/* Simulation Controls Bar */}
        <SimulationControlsBar 
          simulationTime={currentSimulationTime}
          isPlaying={currentIsPlaying}
          onSimulationUpdate={(time, playing) => {
            setCurrentSimulationTime(time)
            setCurrentIsPlaying(playing)
          }}
        />
        {/* Phase Timeline */}
        <div className="h-[150px] border-t bg-background">
          <PhaseTimeline 
            simulationTime={currentSimulationTime}
            isPlaying={currentIsPlaying}
          />
        </div>
      </SidebarInset>
      <SidebarRight />
    </div>
  )
}

export function BasicSimulation({ simulationTime, isPlaying }: BasicSimulationProps) {
  return (
    <OrderProvider>
      <BasicSimulationContent 
        simulationTime={simulationTime}
        isPlaying={isPlaying}
      />
    </OrderProvider>
  )
}