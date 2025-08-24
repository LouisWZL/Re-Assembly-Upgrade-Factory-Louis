'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProduktForm } from '@/components/forms/produkt-form'

interface ProduktDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  produkt?: any
  factoryId: string
  onSuccess: () => void
}

export function ProduktDialog({
  open,
  onOpenChange,
  produkt,
  factoryId,
  onSuccess
}: ProduktDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {produkt ? 'Produkt bearbeiten' : 'Neues Produkt erstellen'}
          </DialogTitle>
          <DialogDescription>
            {produkt 
              ? 'Bearbeiten Sie die Produktinformationen.' 
              : 'Geben Sie die Informationen für das neue Produkt ein.'}
          </DialogDescription>
        </DialogHeader>
        <ProduktForm
          produkt={produkt}
          factoryId={factoryId}
          onSuccess={() => {
            onSuccess()
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}