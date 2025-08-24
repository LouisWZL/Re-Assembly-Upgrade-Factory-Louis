'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createProdukt, updateProdukt } from '@/app/actions/produkt.actions'

interface ProduktFormProps {
  produkt?: any
  factoryId: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function ProduktForm({ produkt, factoryId, onSuccess, onCancel }: ProduktFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [bezeichnung, setBezeichnung] = useState(produkt?.bezeichnung || '')
  const [seriennummer, setSeriennummer] = useState(produkt?.seriennummer || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!bezeichnung.trim() || !seriennummer.trim()) {
      toast.error('Bitte füllen Sie alle Pflichtfelder aus')
      return
    }

    setIsLoading(true)

    try {
      const data = {
        bezeichnung: bezeichnung.trim(),
        seriennummer: seriennummer.trim()
      }

      const result = produkt
        ? await updateProdukt(produkt.id, data)
        : await createProdukt(factoryId, data)

      if (result.success) {
        toast.success(result.message)
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bezeichnung">Produktbezeichnung</Label>
        <Input
          id="bezeichnung"
          type="text"
          value={bezeichnung}
          onChange={(e) => setBezeichnung(e.target.value)}
          placeholder="z.B. Volkswagen Polo"
          disabled={isLoading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="seriennummer">Seriennummer</Label>
        <Input
          id="seriennummer"
          type="text"
          value={seriennummer}
          onChange={(e) => setSeriennummer(e.target.value)}
          placeholder="z.B. VW-POLO-001"
          disabled={isLoading}
          required
        />
        <p className="text-sm text-muted-foreground">
          Die Seriennummer muss eindeutig sein
        </p>
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          type="submit"
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Speichern...
            </>
          ) : (
            produkt ? 'Aktualisieren' : 'Erstellen'
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
        )}
      </div>
    </form>
  )
}