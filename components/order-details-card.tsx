'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, Package, User, Clock, Truck } from 'lucide-react'
import { AuftragsPhase } from '@prisma/client'

interface OrderDetailsCardProps {
  order: {
    id: string
    phase: AuftragsPhase
    createdAt: Date | string
    kunde?: {
      vorname: string
      nachname: string
    }
    produktvariante?: {
      bezeichnung: string
      typ?: string
    }
    liefertermine?: Array<{
      datum: Date | string
      istAktuell: boolean
    }>
  } | null
}

const phaseLabels: Record<AuftragsPhase, string> = {
  [AuftragsPhase.AUFTRAGSANNAHME]: 'Auftragsannahme',
  [AuftragsPhase.INSPEKTION]: 'Inspektion',
  [AuftragsPhase.REASSEMBLY_START]: 'Re-Assembly Start',
  [AuftragsPhase.REASSEMBLY_ENDE]: 'Re-Assembly Ende',
  [AuftragsPhase.QUALITAETSPRUEFUNG]: 'Qualitätsprüfung',
  [AuftragsPhase.AUFTRAGSABSCHLUSS]: 'Auftragsabschluss'
}

const phaseColors: Record<AuftragsPhase, string> = {
  [AuftragsPhase.AUFTRAGSANNAHME]: 'bg-blue-100 text-blue-800',
  [AuftragsPhase.INSPEKTION]: 'bg-yellow-100 text-yellow-800',
  [AuftragsPhase.REASSEMBLY_START]: 'bg-purple-100 text-purple-800',
  [AuftragsPhase.REASSEMBLY_ENDE]: 'bg-indigo-100 text-indigo-800',
  [AuftragsPhase.QUALITAETSPRUEFUNG]: 'bg-orange-100 text-orange-800',
  [AuftragsPhase.AUFTRAGSABSCHLUSS]: 'bg-green-100 text-green-800'
}

export function OrderDetailsCard({ order }: OrderDetailsCardProps) {
  if (!order) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg">Auftragsdetails</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Wählen Sie einen Auftrag aus der Seitenleiste aus, um Details anzuzeigen.
          </p>
        </CardContent>
      </Card>
    )
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Get current delivery date
  const currentDeliveryDate = order.liefertermine?.find((lt: any) => lt.istAktuell)

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Auftrag {order.id.slice(0, 8).toUpperCase()}</span>
          <Badge className={phaseColors[order.phase] || 'bg-gray-100 text-gray-800'}>
            {phaseLabels[order.phase] || order.phase}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Customer */}
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Kunde</p>
                <p className="text-sm text-muted-foreground">
                  {order.kunde?.vorname} {order.kunde?.nachname}
                </p>
              </div>
            </div>

            {/* Product Variant */}
            <div className="flex items-start gap-3">
              <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Produktvariante</p>
                <p className="text-sm text-muted-foreground">
                  {order.produktvariante?.bezeichnung}
                  {order.produktvariante?.typ && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {order.produktvariante.typ}
                    </Badge>
                  )}
                </p>
              </div>
            </div>

            {/* Current Phase */}
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Aktuelle Phase</p>
                <p className="text-sm text-muted-foreground">
                  {phaseLabels[order.phase]}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Delivery Date */}
            {currentDeliveryDate && (
              <div className="flex items-start gap-3">
                <Truck className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Liefertermin</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(currentDeliveryDate.datum)}
                  </p>
                </div>
              </div>
            )}

            {/* Creation Date */}
            <div className="flex items-start gap-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Auftrag eingegangen am</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(order.createdAt)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}