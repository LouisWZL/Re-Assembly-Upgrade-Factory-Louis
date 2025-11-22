'use client'

import { FactoryProvider } from '@/contexts/factory-context'
import { Toaster } from '@/components/ui/sonner'
import { DebugInfo } from '@/components/debug-info'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <FactoryProvider>
      {children}
      <Toaster />
      <DebugInfo />
    </FactoryProvider>
  )
}
