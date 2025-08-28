"use client"

import * as React from "react"
import {
  Phone,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  RefreshCw,
  Search,
  ClipboardCheck,
  Plus,
  Minus,
  Loader2,
  Trash2,
  X,
} from "lucide-react"
import {
  IconCircleCheckFilled,
  IconLoader,
} from "@tabler/icons-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useFactory } from "@/contexts/factory-context"
import { useOrder } from "@/contexts/order-context"
import { getAuftraege, getAuftragDetails, generateOrders, deleteAllOrdersForFactory, deleteSingleOrder } from "@/app/actions/auftrag.actions"
// Define phase types as constants for SQLite compatibility
type AuftragsPhase = 
  | 'AUFTRAGSANNAHME'
  | 'INSPEKTION' 
  | 'REASSEMBLY_START'
  | 'REASSEMBLY_ENDE'
  | 'QUALITAETSPRUEFUNG'
  | 'AUFTRAGSABSCHLUSS'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface OrderData {
  id: string
  phase: AuftragsPhase
  kunde: {
    vorname: string
    nachname: string
  }
  produktvariante: {
    bezeichnung: string
    typ: string
    produkt?: any
  }
  terminierung?: any
  createdAt: string
  graphData?: any
  baugruppenInstances?: any[]
}

function PaginatedTable({
  data,
  phase,
  phases,
  onOrderClick,
  onOrderDelete,
}: {
  data: OrderData[]
  phase?: AuftragsPhase
  phases?: AuftragsPhase[]
  onOrderClick?: (order: OrderData) => void
  onOrderDelete?: (order: OrderData) => void
}) {
  const [currentPage, setCurrentPage] = React.useState(1)
  const itemsPerPage = 5
  
  // Filter data by phase(s)
  const filteredData = data.filter(order => {
    if (phases && phases.length > 0) {
      return phases.includes(order.phase)
    }
    if (phase) {
      return order.phase === phase
    }
    return false
  })
  const totalPages = Math.ceil(filteredData.length / itemsPerPage)

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const getTerminierung = (order: OrderData) => {
    // Helper-Funktion um die letzte Terminierung zu holen
    const terminierungen = order.terminierung
    if (!terminierungen || !Array.isArray(terminierungen) || terminierungen.length === 0) {
      return '-'
    }
    
    const latest = terminierungen[terminierungen.length - 1]
    if (!latest) return '-'
    
    if (typeof latest.datum === 'object' && 'von' in latest.datum) {
      // Zeitschiene
      return `${latest.datum.von} - ${latest.datum.bis}`
    } else {
      // Festes Datum
      return latest.datum as string
    }
  }

  return (
    <>
      <div className="px-3 py-2">
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b">
                <TableHead className="w-[55%] h-9 text-xs font-medium text-muted-foreground">Kunde</TableHead>
                <TableHead className="w-[30%] h-9 text-right text-xs font-medium text-muted-foreground">Lieferdatum</TableHead>
                <TableHead className="w-[15%] h-9 text-right text-xs font-medium text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((order) => (
                  <TableRow 
                    key={order.id} 
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <TableCell 
                      className="py-2 px-3 cursor-pointer" 
                      title={`${order.kunde.vorname} ${order.kunde.nachname} - ${order.produktvariante.bezeichnung}`}
                      onClick={() => onOrderClick?.(order)}
                    >
                      <div className="space-y-0.5">
                        <span className="text-sm truncate block max-w-[150px] font-medium">
                          {order.kunde.vorname} {order.kunde.nachname}
                        </span>
                        <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
                          {order.produktvariante.bezeichnung}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell 
                      className="py-2 px-3 text-right cursor-pointer"
                      onClick={() => onOrderClick?.(order)}
                    >
                      <span className="text-xs text-muted-foreground">
                        {getTerminierung(order)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOrderDelete?.(order);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-4 text-center text-sm text-muted-foreground">
                    Keine Aufträge vorhanden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filteredData.length > itemsPerPage && (
          <div className="flex items-center justify-between px-2 pt-2">
            <span className="text-xs text-muted-foreground">
              Seite {currentPage} von {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-muted"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { activeFactory } = useFactory()
  const { setSelectedOrder, setIsLoadingOrder } = useOrder()
  const [orders, setOrders] = React.useState<OrderData[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [orderCount, setOrderCount] = React.useState(10)
  const [generating, setGenerating] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  // Load orders when factory changes
  React.useEffect(() => {
    if (activeFactory) {
      loadOrders()
    }
  }, [activeFactory])

  const loadOrders = async (isRefresh = false) => {
    if (!activeFactory) return
    
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    
    try {
      const result = await getAuftraege(activeFactory.id)
      if (result.success && result.data) {
        setOrders(result.data as any)
        if (isRefresh) {
          toast.success('Aufträge aktualisiert')
        }
      }
    } catch (error) {
      console.error('Error loading orders:', error)
      toast.error('Fehler beim Laden der Aufträge')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    loadOrders(true)
  }

  const handleIncreaseOrders = () => {
    setOrderCount(prev => Math.min(prev + 10, 100)) // Max 100 orders
  }

  const handleDecreaseOrders = () => {
    setOrderCount(prev => Math.max(prev - 10, 10)) // Min 10 orders
  }

  const handleGenerateOrders = async () => {
    if (!activeFactory) {
      toast.error('Keine Factory ausgewählt')
      return
    }

    setGenerating(true)
    try {
      const result = await generateOrders(activeFactory.id, orderCount)
      if (result.success) {
        toast.success(result.message)
        await loadOrders() // Reload orders after generation
      } else {
        toast.error(result.error || 'Fehler beim Erstellen der Aufträge')
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((err: string) => toast.error(err))
        }
      }
    } catch (error) {
      console.error('Error generating orders:', error)
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setGenerating(false)
    }
  }

  const handleOrderClick = async (order: OrderData) => {
    // Lade vollständige Auftragsdetails beim Klick
    setIsLoadingOrder(true) // Sofort Loading-State setzen
    try {
      const result = await getAuftragDetails(order.id)
      if (result.success && result.data) {
        setSelectedOrder(result.data as any)
      }
    } catch (error) {
      console.error('Error loading order details:', error)
      toast.error('Fehler beim Laden der Auftragsdetails')
    } finally {
      setIsLoadingOrder(false) // Loading-State zurücksetzen
    }
  }

  const handleDeleteAllOrders = async () => {
    if (!activeFactory) {
      toast.error('Keine Factory ausgewählt')
      return
    }

    if (!confirm('Möchten Sie wirklich ALLE Aufträge löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return
    }

    setDeleting(true)
    try {
      const result = await deleteAllOrdersForFactory(activeFactory.id)
      if (result.success) {
        toast.success(result.message)
        await loadOrders() // Reload orders after deletion
      } else {
        toast.error(result.error || 'Fehler beim Löschen der Aufträge')
      }
    } catch (error) {
      console.error('Error deleting orders:', error)
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteSingleOrder = async (order: OrderData) => {
    if (!confirm(`Auftrag für ${order.kunde.vorname} ${order.kunde.nachname} wirklich löschen?`)) {
      return
    }

    try {
      const result = await deleteSingleOrder(order.id)
      if (result.success) {
        toast.success(result.message)
        await loadOrders() // Reload orders after deletion
      } else {
        toast.error(result.error || 'Fehler beim Löschen des Auftrags')
      }
    } catch (error) {
      console.error('Error deleting order:', error)
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    }
  }

  // Removed automatic update listener - now using manual refresh button

  return (
    <Sidebar 
      collapsible="none" 
      className="border-r" 
      style={{ "--sidebar-width": "20rem" } as React.CSSProperties}
      {...props}
    >
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Auftragsübersicht</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title="Aufträge aktualisieren"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </SidebarHeader>
      
      {/* Order Generation Controls */}
      <div className="px-4 py-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8"
            onClick={handleDecreaseOrders}
            disabled={orderCount <= 10 || generating}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="min-w-[3rem] text-center font-medium">
            {orderCount}
          </div>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8"
            onClick={handleIncreaseOrders}
            disabled={orderCount >= 100 || generating}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateOrders}
            disabled={generating || !activeFactory}
            className="ml-2 flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Erstelle...
              </>
            ) : (
              'Aufträge erstellen'
            )}
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDeleteAllOrders}
            disabled={deleting || !activeFactory || orders.length === 0}
            className="flex-1 border-[#1a48a5] text-[#1a48a5] bg-white hover:bg-[#1a48a5]/5 disabled:border-muted disabled:text-muted-foreground"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Lösche...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Alle Aufträge löschen
              </>
            )}
          </Button>
        </div>
      </div>
      
      <SidebarContent className="gap-0 py-2">
        {loading ? (
          <div className="p-4 space-y-4">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-1/3"></div>
              <div className="h-32 bg-muted rounded"></div>
            </div>
          </div>
        ) : (
          <Accordion 
            type="multiple" 
            defaultValue={["auftragsannahme"]}
            className="w-full"
          >
            {/* Auftragsannahme */}
            <AccordionItem value="auftragsannahme">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4" />
                  <span>Auftragsannahme</span>
                  <span className="text-muted-foreground">
                    ({orders.filter(o => o.phase === 'AUFTRAGSANNAHME').length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <PaginatedTable
                  data={orders}
                  phase={'AUFTRAGSANNAHME' as AuftragsPhase}
                  onOrderClick={handleOrderClick}
                  onOrderDelete={handleDeleteSingleOrder}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </SidebarContent>
    </Sidebar>
  )
}