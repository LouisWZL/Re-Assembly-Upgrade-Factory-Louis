'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type ViewType = 'home' | 'variante' | 'baugruppen' | 'einstellungen' | 'produkte' | 'produkt'

interface ViewContextType {
  currentView: ViewType | string
  setCurrentView: (view: ViewType | string) => void
}

const ViewContext = createContext<ViewContextType | undefined>(undefined)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<ViewType | string>('home')

  return (
    <ViewContext.Provider value={{ currentView, setCurrentView }}>
      {children}
    </ViewContext.Provider>
  )
}

export function useView() {
  const context = useContext(ViewContext)
  if (!context) {
    throw new Error('useView must be used within a ViewProvider')
  }
  return context
}