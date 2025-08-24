'use client'

import { useState, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Upload, X, Save, Loader2, Package2, Edit2, Check } from 'lucide-react'
import { ThreeViewer, ThreeViewerEmpty } from '@/components/three-viewer'
import { updateProduktvariante, uploadVarianteGlbFile, deleteVarianteGlbFile } from '@/app/actions/produktvariante.actions'

interface ProduktvarianteTabProps {
  variante: any
  onUpdate?: () => void
}

export function ProduktvarianteTab({ variante, onUpdate }: ProduktvarianteTabProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(false)
  const [bezeichnung, setBezeichnung] = useState(variante.bezeichnung)
  const [glbFile, setGlbFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.toLowerCase().endsWith('.glb')) {
        toast.error('Nur .glb Dateien sind erlaubt')
        return
      }
      if (file.size > 50 * 1024 * 1024) { // 50MB
        toast.error('Datei ist zu groß. Maximal 50MB erlaubt.')
        return
      }
      
      // Upload immediately when file is selected
      setUploadProgress(true)
      const formData = new FormData()
      formData.append('file', file)

      try {
        const response = await fetch('/api/upload/glb', {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Upload fehlgeschlagen')
        }

        const data = await response.json()
        
        // Save to database
        const result = await uploadVarianteGlbFile(variante.id, data.url)
        if (result.success) {
          toast.success('3D-Modell erfolgreich hochgeladen')
          onUpdate?.()
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        console.error('Upload error:', error)
        toast.error('Fehler beim Hochladen der 3D-Datei')
      } finally {
        setUploadProgress(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    }
  }

  const handleSaveName = async () => {
    if (bezeichnung === variante.bezeichnung) {
      setIsEditingName(false)
      return
    }

    setIsLoading(true)
    try {
      const result = await updateProduktvariante(variante.id, { bezeichnung })
      if (result.success) {
        toast.success('Name erfolgreich aktualisiert')
        setIsEditingName(false)
        onUpdate?.()
      } else {
        toast.error(result.error)
        setBezeichnung(variante.bezeichnung) // Reset on error
      }
    } catch (error) {
      toast.error('Ein unerwarteter Fehler ist aufgetreten')
      setBezeichnung(variante.bezeichnung) // Reset on error
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelEditName = () => {
    setBezeichnung(variante.bezeichnung)
    setIsEditingName(false)
  }

  const handleDeleteGlb = async () => {
    setIsLoading(true)
    try {
      const result = await deleteVarianteGlbFile(variante.id)
      if (result.success) {
        toast.success(result.message)
        onUpdate?.()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Fehler beim Löschen des 3D-Modells')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with variant name and edit button */}
      <div className="flex items-center gap-3 mt-6">
        <Package2 className="h-5 w-5 text-muted-foreground" />
        {isEditingName ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={bezeichnung}
              onChange={(e) => setBezeichnung(e.target.value)}
              className="w-64"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') handleCancelEditName()
              }}
              autoFocus
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSaveName}
              disabled={isLoading || bezeichnung === variante.bezeichnung}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCancelEditName}
              disabled={isLoading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{variante.bezeichnung}</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsEditingName(true)}
              className="h-8 w-8"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* 3D Model Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>3D-Modell</Label>
          {variante.glbFile && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteGlb}
              disabled={isLoading}
            >
              <X className="mr-2 h-4 w-4" />
              3D-Modell entfernen
            </Button>
          )}
        </div>

        {/* 3D Viewer or Upload */}
        {variante.glbFile ? (
          <div className="h-[400px] border rounded-lg overflow-hidden">
            <ThreeViewer glbUrl={variante.glbFile} />
          </div>
        ) : (
          <div className="h-[400px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center space-y-4 p-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">Kein 3D-Modell verfügbar</p>
                <p className="text-sm text-muted-foreground">
                  Laden Sie ein 3D-Modell im .glb Format hoch
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb"
                  onChange={handleFileChange}
                  disabled={uploadProgress}
                  className="hidden"
                  id={`file-upload-${variante.id}`}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadProgress}
                  variant="outline"
                >
                  {uploadProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      3D-Modell hochladen
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Kostenlose Modelle finden Sie auf{' '}
                <a 
                  href="https://sketchfab.com/3d-models" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Sketchfab
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}