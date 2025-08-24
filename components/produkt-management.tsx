'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Edit, Trash2, Package, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { DeleteDialog } from '@/components/delete-dialog'
import { ProduktDialog } from '@/components/dialogs/produkt-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ProduktvarianteTab } from '@/components/produktvariante-tab'
import { 
  getProdukte, 
  deleteProdukt 
} from '@/app/actions/produkt.actions'
import { getProduktvarianten } from '@/app/actions/produktvariante.actions'

interface ProduktManagementProps {
  factoryId: string
}

export function ProduktManagement({ factoryId }: ProduktManagementProps) {
  const [produkte, setProdukte] = useState<any[]>([])
  const [selectedProdukt, setSelectedProdukt] = useState<any>(null)
  const [selectedVarianten, setSelectedVarianten] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Dialog states
  const [produktDialogOpen, setProduktDialogOpen] = useState(false)
  const [editingProdukt, setEditingProdukt] = useState<any>(null)
  
  // Delete dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingProdukt, setDeletingProdukt] = useState<any>(null)
  
  // Alert dialog for product limit
  const [showProductLimitAlert, setShowProductLimitAlert] = useState(false)

  useEffect(() => {
    loadData()
  }, [factoryId])

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await getProdukte(factoryId)

      if (result.success && result.data) {
        setProdukte(result.data)
        // Select first product by default and load its variants
        if (result.data.length > 0 && !selectedProdukt) {
          const firstProduct = result.data[0]
          setSelectedProdukt(firstProduct)
          
          // Load variants for the first product
          const variantenResult = await getProduktvarianten(firstProduct.id)
          if (variantenResult.success && variantenResult.data) {
            setSelectedVarianten(variantenResult.data)
          }
        }
      }
    } catch (error) {
      toast.error('Fehler beim Laden der Produkte')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProdukt = async () => {
    if (!deletingProdukt) return

    const result = await deleteProdukt(deletingProdukt.id)
    
    if (result.success) {
      toast.success(result.message)
      // If deleting the selected product, clear selection or select first
      if (selectedProdukt?.id === deletingProdukt.id) {
        const remainingProdukte = produkte.filter(p => p.id !== deletingProdukt.id)
        setSelectedProdukt(remainingProdukte.length > 0 ? remainingProdukte[0] : null)
      }
      await loadData()
      // Dispatch event to update the sidebar menu
      window.dispatchEvent(new CustomEvent('factoryUpdated'))
    } else {
      toast.error(result.error)
    }
    
    setDeleteDialogOpen(false)
    setDeletingProdukt(null)
  }

  const confirmDelete = (produkt: any) => {
    setDeletingProdukt(produkt)
    setDeleteDialogOpen(true)
  }

  const handleFormSuccess = () => {
    setProduktDialogOpen(false)
    setEditingProdukt(null)
    loadData()
    // Dispatch event to update the sidebar menu
    window.dispatchEvent(new CustomEvent('factoryUpdated'))
  }
  
  const handleCreateButtonClick = () => {
    if (produkte.length > 0) {
      setShowProductLimitAlert(true)
    } else {
      setEditingProdukt(null)
      setProduktDialogOpen(true)
    }
  }

  const handleRowClick = async (produkt: any) => {
    setSelectedProdukt(produkt)
    // Load variants for the selected product
    const result = await getProduktvarianten(produkt.id)
    if (result.success && result.data) {
      setSelectedVarianten(result.data)
    }
  }

  const refreshVarianten = async () => {
    if (selectedProdukt) {
      const result = await getProduktvarianten(selectedProdukt.id)
      if (result.success && result.data) {
        setSelectedVarianten(result.data)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full p-6 gap-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6 gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Produkt Manager</h2>
        <Button onClick={handleCreateButtonClick}>
          <Plus className="mr-2 h-4 w-4" />
          Produkt erstellen
        </Button>
      </div>

      {/* Alert Dialog for Product Limit */}
      <AlertDialog open={showProductLimitAlert} onOpenChange={setShowProductLimitAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Produktlimit erreicht
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Jede Factory kann nur <strong>ein Produkt</strong> haben. Dieses Produkt wird automatisch mit Basic- und Premium-Varianten erstellt.
                </p>
                <p>
                  Um ein neues Produkt zu erstellen, müssen Sie zuerst das vorhandene Produkt <strong>"{produkte[0]?.bezeichnung}"</strong> löschen.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Verstanden</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (produkte[0]) {
                  confirmDelete(produkte[0])
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Produkt löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}
      <ProduktDialog
        open={produktDialogOpen}
        onOpenChange={(open) => {
          setProduktDialogOpen(open)
          if (!open) setEditingProdukt(null)
        }}
        produkt={editingProdukt}
        factoryId={factoryId}
        onSuccess={handleFormSuccess}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteProdukt}
        title="Produkt löschen"
        description={`Möchten Sie das Produkt "${deletingProdukt?.bezeichnung}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
      />

      {/* Content */}
      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Produkte Table */}
        <Card>
          <CardHeader>
            <CardTitle>Produkt</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Seriennummer</TableHead>
                  <TableHead className="w-[100px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produkte.map((produkt) => (
                  <TableRow 
                    key={produkt.id}
                    className={`cursor-pointer ${selectedProdukt?.id === produkt.id ? 'bg-muted/50' : ''}`}
                    onClick={() => handleRowClick(produkt)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {produkt.bezeichnung}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {produkt.seriennummer}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingProdukt(produkt)
                            setProduktDialogOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            confirmDelete(produkt)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {produkte.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Keine Produkte vorhanden
              </div>
            )}
          </CardContent>
        </Card>

        {/* Produkt Details with Variants */}
        <Card>
          <CardContent className="pt-6">
            {selectedProdukt ? (
              <div className="space-y-4">
                {/* Product Header */}
                <div>
                  <h3 className="text-lg font-semibold">{selectedProdukt.bezeichnung}</h3>
                  <p className="text-sm text-muted-foreground">
                    Seriennummer: {selectedProdukt.seriennummer}
                  </p>
                </div>

                {/* Product Info */}
                <div className="pb-4 border-b">
                  <div className="flex gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap pt-1">Baugruppentypen:</span>
                    {selectedProdukt.baugruppentypen?.length > 0 ? (
                      <div className="flex-1 max-h-[4.5rem] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                        <div className="flex flex-wrap gap-1">
                          {selectedProdukt.baugruppentypen.map((typ: any) => (
                            <Badge key={typ.id} variant="outline" className="text-xs">
                              {typ.bezeichnung}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground pt-1">Keine</span>
                    )}
                  </div>
                </div>

                {/* Variants Tabs */}
                {selectedVarianten.length > 0 ? (
                  <Tabs defaultValue={selectedVarianten[0]?.id} className="w-full mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                      {selectedVarianten.map((variante) => (
                        <TabsTrigger key={variante.id} value={variante.id}>
                          {variante.typ === 'basic' ? 'Basic' : 'Premium'}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {selectedVarianten.map((variante) => (
                      <TabsContent key={variante.id} value={variante.id}>
                        <ProduktvarianteTab 
                          variante={variante} 
                          onUpdate={refreshVarianten}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Keine Varianten vorhanden
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Wählen Sie ein Produkt aus der Tabelle aus
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}