'use client'

import { useState } from 'react'
import { SidebarLeft } from "@/components/sidebar-left"
import { SidebarRight } from "@/components/sidebar-right"
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { OrderProvider } from '@/contexts/order-context'
import { OrderGraphViewer } from '@/components/order-graph-viewer'
import { OrderProcessGraphViewer } from '@/components/order-process-graph-viewer'
import { OrderDetailsCard } from '@/components/order-details-card'
import { useOrder } from '@/contexts/order-context'
import { Skeleton } from '@/components/ui/skeleton'
import { DatabaseInitializer } from '@/components/database-initializer'

function HomeContent() {
  const { selectedOrder, isLoadingOrder } = useOrder()
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
                    <OrderDetailsCard order={selectedOrder} />
                    <OrderGraphViewer order={selectedOrder} />
                    <OrderProcessGraphViewer order={selectedOrder} />
                  </>
                )}
              </div>
            </div>
          </SidebarInset>
          <SidebarRight />
        </div>
      </SidebarProvider>
    </div>
  )
}

export default function Home() {
  return (
    <DatabaseInitializer>
      <OrderProvider>
        <HomeContent />
      </OrderProvider>
    </DatabaseInitializer>
  )
}
