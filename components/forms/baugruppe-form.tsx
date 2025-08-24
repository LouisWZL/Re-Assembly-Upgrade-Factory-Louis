'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createBaugruppe, updateBaugruppe } from '@/app/actions/baugruppe.actions'
import { getBaugruppentypen } from '@/app/actions/baugruppentyp.actions'
import { useFactory } from '@/contexts/factory-context'

interface BaugruppeFormProps {
  baugruppe?: {
    id: string
    bezeichnung: string
    artikelnummer: string
    variantenTyp: 'basic' | 'premium' | 'basicAndPremium'
    baugruppentypId: string | null
    demontagezeit: number | null
    montagezeit: number | null
  }
  onSuccess?: () => void
  onCancel?: () => void
}

export function BaugruppeForm({ baugruppe, onSuccess, onCancel }: BaugruppeFormProps) {
  const { activeFactory } = useFactory()
  const [isLoading, setIsLoading] = useState(false)
  const [baugruppentypen, setBaugruppentypen] = useState<any[]>([])
  const [formData, setFormData] = useState({
    bezeichnung: baugruppe?.bezeichnung || '',
    artikelnummer: baugruppe?.artikelnummer || '',
    variantenTyp: baugruppe?.variantenTyp || 'basic' as 'basic' | 'premium' | 'basicAndPremium',
    baugruppentypId: baugruppe?.baugruppentypId || '',
    demontagezeit: baugruppe?.demontagezeit?.toString() || '',
    montagezeit: baugruppe?.montagezeit?.toString() || ''
  })

  useEffect(() => {
    loadBaugruppentypen()
  }, [])

  const loadBaugruppentypen = async () => {
    const result = await getBaugruppentypen()
    if (result.success && result.data) {
      setBaugruppentypen(result.data)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Validate required fields
      if (!formData.baugruppentypId) {
        toast.error('Bitte wählen Sie einen Baugruppentyp aus')
        setIsLoading(false)
        return
      }

      if (!formData.demontagezeit || !formData.montagezeit) {
        toast.error('Bitte geben Sie sowohl Demontagezeit als auch Montagezeit an')
        setIsLoading(false)
        return
      }

      const data = {
        bezeichnung: formData.bezeichnung,
        artikelnummer: formData.artikelnummer,
        variantenTyp: formData.variantenTyp,
        baugruppentypId: formData.baugruppentypId,
        demontagezeit: parseInt(formData.demontagezeit),
        montagezeit: parseInt(formData.montagezeit)
      }

      let result
      
      if (baugruppe) {
        result = await updateBaugruppe(baugruppe.id, data)
      } else {
        result = await createBaugruppe({ ...data, factoryId: activeFactory?.id || '' })
      }

      if (result.success) {
        toast.success(result.message)
        if (onSuccess) onSuccess()
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
    <Card>
      <CardHeader>
        <CardTitle>
          {baugruppe ? 'Baugruppe bearbeiten' : 'Neue Baugruppe'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bezeichnung">Bezeichnung</Label>
            <Input
              id="bezeichnung"
              value={formData.bezeichnung}
              onChange={(e) => setFormData({ ...formData, bezeichnung: e.target.value })}
              placeholder="z.B. Karosserie"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="artikelnummer">ID</Label>
            <Input
              id="artikelnummer"
              value={formData.artikelnummer}
              onChange={(e) => setFormData({ ...formData, artikelnummer: e.target.value })}
              placeholder="z.B. KAR-001"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baugruppentypId">Baugruppentyp</Label>
            <Select
              value={formData.baugruppentypId}
              onValueChange={(value) => setFormData({ ...formData, baugruppentypId: value })}
              disabled={isLoading}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Bitte wählen..." />
              </SelectTrigger>
              <SelectContent>
                {baugruppentypen.map((typ) => (
                  <SelectItem key={typ.id} value={typ.id}>
                    {typ.bezeichnung}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Variantentyp</Label>
            <RadioGroup
              value={formData.variantenTyp}
              onValueChange={(value: 'basic' | 'premium' | 'basicAndPremium') => 
                setFormData({ ...formData, variantenTyp: value })
              }
              disabled={isLoading}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="basic" id="basic" />
                <Label htmlFor="basic">Basic</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="premium" id="premium" />
                <Label htmlFor="premium">Premium</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="basicAndPremium" id="basicAndPremium" />
                <Label htmlFor="basicAndPremium">Basic & Premium</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="demontagezeit">Demontagezeit (Minuten)</Label>
              <Input
                id="demontagezeit"
                type="number"
                value={formData.demontagezeit}
                onChange={(e) => setFormData({ ...formData, demontagezeit: e.target.value })}
                placeholder="z.B. 60"
                min="0"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="montagezeit">Montagezeit (Minuten)</Label>
              <Input
                id="montagezeit"
                type="number"
                value={formData.montagezeit}
                onChange={(e) => setFormData({ ...formData, montagezeit: e.target.value })}
                placeholder="z.B. 90"
                min="0"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Speichern...' : baugruppe ? 'Aktualisieren' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}