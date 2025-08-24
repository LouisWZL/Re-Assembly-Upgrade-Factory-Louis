'use client'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Undo, 
  Redo,
  Save
} from 'lucide-react'

interface SidebarInsetHeaderProps {
  produktName: string
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomToFit: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onSave?: () => void
  isSaving?: boolean
  showTabs?: boolean
  activeView?: 'structure' | 'process'
  onViewChange?: (view: 'structure' | 'process') => void
}

export function SidebarInsetHeader({
  produktName,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  isSaving = false,
  showTabs = false,
  activeView = 'structure',
  onViewChange
}: SidebarInsetHeaderProps) {
  return (
    <div className="border-b bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Product Title and Tabs */}
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">{produktName}</h2>
          
          {/* Tabs for switching views */}
          {showTabs && onViewChange && (
            <Tabs value={activeView} onValueChange={(value) => onViewChange(value as 'structure' | 'process')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="structure">Produktstruktur</TabsTrigger>
                <TabsTrigger value="process">Prozessstruktur</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* Undo/Redo Group */}
          <div className="flex items-center gap-1 border-r pr-2 mr-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={onUndo}
              disabled={!canUndo}
              title="Rückgängig (Ctrl+Z)"
              className="h-8 w-8"
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onRedo}
              disabled={!canRedo}
              title="Wiederholen (Ctrl+Y)"
              className="h-8 w-8"
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Zoom Controls Group */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={onZoomIn}
              title="Vergrößern"
              className="h-8 w-8"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onZoomOut}
              title="Verkleinern"
              className="h-8 w-8"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onZoomToFit}
              title="Ansicht anpassen"
              className="h-8 w-8"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Save Button (optional) */}
          {onSave && (
            <>
              <div className="border-l pl-2 ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSave}
                  disabled={isSaving}
                  className="h-8"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Speichert...' : 'Speichern'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}