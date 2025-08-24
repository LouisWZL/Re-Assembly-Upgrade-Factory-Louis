'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { Auftrag, Kunde, Produktvariante, Produkt, Baugruppe, BaugruppeInstance } from '@prisma/client'

interface OrderWithRelations extends Auftrag {
  kunde: Kunde
  produktvariante: Produktvariante & {
    produkt: Produkt
  }
  baugruppenInstances?: Array<BaugruppeInstance & {
    baugruppe: Baugruppe
  }>
}

interface OrderContextType {
  selectedOrder: OrderWithRelations | null
  setSelectedOrder: (order: OrderWithRelations | null) => void
  isLoadingOrder: boolean
  setIsLoadingOrder: (loading: boolean) => void
}

const OrderContext = createContext<OrderContextType | undefined>(undefined)

export function OrderProvider({ children }: { children: ReactNode }) {
  const [selectedOrder, setSelectedOrder] = useState<OrderWithRelations | null>(null)
  const [isLoadingOrder, setIsLoadingOrder] = useState(false)

  return (
    <OrderContext.Provider value={{ selectedOrder, setSelectedOrder, isLoadingOrder, setIsLoadingOrder }}>
      {children}
    </OrderContext.Provider>
  )
}

export function useOrder() {
  const context = useContext(OrderContext)
  if (!context) {
    throw new Error('useOrder must be used within an OrderProvider')
  }
  return context
}