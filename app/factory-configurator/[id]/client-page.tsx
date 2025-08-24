'use client'

import { ConfiguratorSidebarLeft } from "@/components/configurator-sidebar-left"
import { ConfiguratorSidebarRight } from "@/components/configurator-sidebar-right"
import { ConfiguratorContent } from "@/components/configurator-content"
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ViewProvider, useView } from '@/contexts/view-context'

function ConfiguratorLayout({ factoryId }: { factoryId: string }) {
  const { currentView } = useView()
  const showRightSidebar = currentView === 'variante' || currentView === 'produkt'

  return (
    <div className="flex h-screen flex-col [--header-height:calc(theme(spacing.14))]">
      <SidebarProvider className="flex h-full flex-col">
        <SiteHeader />
        <div className="flex flex-1 overflow-hidden [&_[data-slot=sidebar]]:h-full">
          <ConfiguratorSidebarLeft factoryId={factoryId} />
          <SidebarInset className="overflow-auto">
            <ConfiguratorContent factoryId={factoryId} />
          </SidebarInset>
          {showRightSidebar && <ConfiguratorSidebarRight factoryId={factoryId} />}
        </div>
      </SidebarProvider>
    </div>
  )
}

export default function ClientPage({ factoryId }: { factoryId: string }) {
  return (
    <ViewProvider>
      <ConfiguratorLayout factoryId={factoryId} />
    </ViewProvider>
  )
}