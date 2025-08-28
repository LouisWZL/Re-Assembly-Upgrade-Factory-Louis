'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
// Define ReAssemblyTyp as constants for SQLite compatibility
type ReAssemblyTyp = 'PFLICHT' | 'UPGRADE'

interface BaugruppenDetailsTableProps {
  baugruppenInstances?: Array<{
    id: string
    zustand: number
    reAssemblyTyp?: ReAssemblyTyp | null
    baugruppe: {
      id: string
      bezeichnung: string
      artikelnummer: string
      variantenTyp: string
      demontagezeit?: number | null
      montagezeit?: number | null
      baugruppentyp?: {
        bezeichnung: string
      } | null
    }
    austauschBaugruppe?: {
      id: string
      bezeichnung: string
      artikelnummer: string
      variantenTyp: string
      baugruppentyp?: {
        bezeichnung: string
      } | null
    } | null
  }>
  pflichtUpgradeSchwelle?: number
}

export function BaugruppenDetailsTable({ baugruppenInstances, pflichtUpgradeSchwelle = 30 }: BaugruppenDetailsTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5
  
  if (!baugruppenInstances || baugruppenInstances.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Keine Baugruppen vorhanden
      </div>
    )
  }
  
  const totalPages = Math.ceil(baugruppenInstances.length / itemsPerPage)
  const paginatedData = baugruppenInstances.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )
  
  // Dynamische Farbberechnung basierend auf pflichtUpgradeSchwelle
  const getZustandColor = (zustand: number) => {
    const orangeSchwelle = pflichtUpgradeSchwelle + Math.floor((100 - pflichtUpgradeSchwelle) / 2)
    
    if (zustand <= pflichtUpgradeSchwelle) return 'text-red-600'
    if (zustand <= orangeSchwelle) return 'text-amber-600'
    return 'text-green-600'
  }
  
  const getZustandBgColor = (zustand: number) => {
    const orangeSchwelle = pflichtUpgradeSchwelle + Math.floor((100 - pflichtUpgradeSchwelle) / 2)
    
    if (zustand <= pflichtUpgradeSchwelle) return 'bg-red-500'
    if (zustand <= orangeSchwelle) return 'bg-amber-500'
    return 'bg-green-500'
  }
  
  const getReAssemblyTypBadge = (reAssemblyTyp?: ReAssemblyTyp | null) => {
    if (!reAssemblyTyp) return <span className="text-muted-foreground">-</span>
    
    return (
      <Badge 
        variant={reAssemblyTyp === 'PFLICHT' ? 'destructive' : 'default'}
        className="text-xs"
      >
        {reAssemblyTyp}
      </Badge>
    )
  }
  
  const getVariantenTypBadge = (variantenTyp: string) => {
    if (variantenTyp === 'premium') {
      return <Badge variant="default" className="text-xs">Premium</Badge>
    } else if (variantenTyp === 'basic') {
      return <Badge variant="secondary" className="text-xs">Basic</Badge>
    } else {
      return <Badge variant="outline" className="text-xs">Basic & Premium</Badge>
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="text-xs font-medium h-9 px-2">Name</TableHead>
              <TableHead className="text-xs font-medium h-9 px-2">Typ</TableHead>
              <TableHead className="text-xs font-medium h-9 px-2 text-center">Re-Assembly</TableHead>
              <TableHead className="text-xs font-medium h-9 px-2">Ziel-Baugruppe</TableHead>
              <TableHead className="text-xs font-medium h-9 px-2 text-center">Zustand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((instance) => (
              <TableRow key={instance.id} className="hover:bg-muted/50">
                <TableCell className="py-2 px-2 text-xs font-medium">
                  <div className="max-w-[140px]">
                    <div className="truncate" title={instance.baugruppe.bezeichnung}>
                      {instance.baugruppe.bezeichnung}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {instance.baugruppe.artikelnummer}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2 px-2">
                  {getVariantenTypBadge(instance.baugruppe.variantenTyp)}
                </TableCell>
                <TableCell className="py-2 px-2 text-center">
                  {getReAssemblyTypBadge(instance.reAssemblyTyp)}
                </TableCell>
                <TableCell className="py-2 px-2 text-xs font-medium">
                  {instance.austauschBaugruppe ? (
                    <div className="max-w-[140px]">
                      <div className="truncate" title={instance.austauschBaugruppe.bezeichnung}>
                        {instance.austauschBaugruppe.bezeichnung}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {instance.austauschBaugruppe.artikelnummer}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="py-2 px-2">
                  <div className="flex items-center gap-1">
                    <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all ${getZustandBgColor(instance.zustand)}`}
                        style={{ width: `${instance.zustand}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${getZustandColor(instance.zustand)} min-w-[30px] text-right`}>
                      {instance.zustand}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 mt-auto">
          <span className="text-xs text-muted-foreground">
            Seite {currentPage} von {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}