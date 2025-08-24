"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

interface FactoryData {
  id: string
  name: string
  kapazität: number
}

interface FactoryContextValue {
  activeFactory: FactoryData | null
  setActiveFactory: (factory: FactoryData | null) => void
  factories: FactoryData[]
  setFactories: (factories: FactoryData[]) => void
}

const FactoryContext = createContext<FactoryContextValue | undefined>(undefined)

export function FactoryProvider({ children }: { children: React.ReactNode }) {
  const [activeFactory, setActiveFactory] = useState<FactoryData | null>(null)
  const [factories, setFactories] = useState<FactoryData[]>([])

  return (
    <FactoryContext.Provider value={{ activeFactory, setActiveFactory, factories, setFactories }}>
      {children}
    </FactoryContext.Provider>
  )
}

export function useFactory() {
  const context = useContext(FactoryContext)
  if (!context) {
    throw new Error('useFactory must be used within a FactoryProvider')
  }
  return context
}