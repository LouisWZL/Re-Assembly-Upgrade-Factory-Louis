'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  getAllAlgorithmBundles,
  createAlgorithmBundle,
  updateAlgorithmBundle,
  deleteAlgorithmBundle,
  setActiveAlgorithmBundle,
  cloneAlgorithmBundle
} from '@/app/actions/algorithm-bundle.actions'
import { Plus, Edit, Trash2, Copy, CheckCircle2, Circle, Code } from 'lucide-react'
import { toast } from 'sonner'

interface AlgorithmBundle {
  id: string
  name: string
  description: string | null
  author: string | null
  isActive: boolean
  factoryId: string | null
  papScriptPath: string | null
  papDescription: string | null
  pipScriptPath: string | null
  pipDescription: string | null
  pipoScriptPath: string | null
  pipoDescription: string | null
  createdAt: Date
  updatedAt: Date
  factory: any
  queueConfigs: any[]
}

export default function AlgorithmBundlesPage() {
  const [bundles, setBundles] = useState<AlgorithmBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBundle, setEditingBundle] = useState<AlgorithmBundle | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    author: '',
    papScriptPath: '',
    papDescription: '',
    pipScriptPath: '',
    pipDescription: '',
    pipoScriptPath: '',
    pipoDescription: ''
  })

  useEffect(() => {
    loadBundles()
  }, [])

  const loadBundles = async () => {
    setLoading(true)
    const result = await getAllAlgorithmBundles()
    if (result.success && result.data) {
      setBundles(result.data)
    }
    setLoading(false)
  }

  const handleCreateBundle = () => {
    setEditingBundle(null)
    setFormData({
      name: '',
      description: '',
      author: '',
      papScriptPath: '',
      papDescription: '',
      pipScriptPath: '',
      pipDescription: '',
      pipoScriptPath: '',
      pipoDescription: ''
    })
    setIsDialogOpen(true)
  }

  const handleEditBundle = (bundle: AlgorithmBundle) => {
    setEditingBundle(bundle)
    setFormData({
      name: bundle.name,
      description: bundle.description || '',
      author: bundle.author || '',
      papScriptPath: bundle.papScriptPath || '',
      papDescription: bundle.papDescription || '',
      pipScriptPath: bundle.pipScriptPath || '',
      pipDescription: bundle.pipDescription || '',
      pipoScriptPath: bundle.pipoScriptPath || '',
      pipoDescription: bundle.pipoDescription || ''
    })
    setIsDialogOpen(true)
  }

  const handleSaveBundle = async () => {
    if (!formData.name.trim()) {
      toast.error('Bitte geben Sie einen Namen ein')
      return
    }

    const data = {
      ...formData,
      description: formData.description || undefined,
      author: formData.author || undefined,
      papScriptPath: formData.papScriptPath || undefined,
      papDescription: formData.papDescription || undefined,
      pipScriptPath: formData.pipScriptPath || undefined,
      pipDescription: formData.pipDescription || undefined,
      pipoScriptPath: formData.pipoScriptPath || undefined,
      pipoDescription: formData.pipoDescription || undefined
    }

    const result = editingBundle
      ? await updateAlgorithmBundle(editingBundle.id, data)
      : await createAlgorithmBundle(data)

    if (result.success) {
      toast.success(result.message)
      setIsDialogOpen(false)
      loadBundles()
    } else {
      toast.error(result.error)
    }
  }

  const handleDeleteBundle = async (id: string) => {
    if (!confirm('Möchten Sie dieses Bundle wirklich löschen?')) {
      return
    }

    const result = await deleteAlgorithmBundle(id)
    if (result.success) {
      toast.success(result.message)
      loadBundles()
    } else {
      toast.error(result.error)
    }
  }

  const handleSetActive = async (bundleId: string, factoryId: string | null) => {
    if (!factoryId) {
      toast.error('Bundle muss einer Fabrik zugeordnet sein')
      return
    }

    const result = await setActiveAlgorithmBundle(bundleId, factoryId)
    if (result.success) {
      toast.success(result.message)
      loadBundles()
    } else {
      toast.error(result.error)
    }
  }

  const handleCloneBundle = async (id: string, originalName: string) => {
    const newName = prompt(`Neuer Name für Kopie von "${originalName}":`, `${originalName} (Kopie)`)
    if (!newName) return

    const result = await cloneAlgorithmBundle(id, newName)
    if (result.success) {
      toast.success(result.message)
      loadBundles()
    } else {
      toast.error(result.error)
    }
  }

  if (loading) {
    return <div className="p-8">Lade Algorithmus-Bundles...</div>
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Algorithmus-Bundles</h1>
          <p className="text-gray-500 mt-1">
            Verwalten Sie Terminierungs-Algorithmen für PAP, PIP und PIPO
          </p>
        </div>
        <Button onClick={handleCreateBundle}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Bundle
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {bundles.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              Keine Algorithmus-Bundles vorhanden. Erstellen Sie ein neues Bundle.
            </CardContent>
          </Card>
        ) : (
          bundles.map((bundle) => (
            <Card key={bundle.id} className={bundle.isActive ? 'border-green-500 border-2' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{bundle.name}</CardTitle>
                      {bundle.isActive && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Aktiv
                        </Badge>
                      )}
                      {bundle.factory && (
                        <Badge variant="outline">{bundle.factory.name}</Badge>
                      )}
                    </div>
                    {bundle.description && (
                      <CardDescription className="mt-2">{bundle.description}</CardDescription>
                    )}
                    {bundle.author && (
                      <p className="text-sm text-gray-500 mt-1">Autor: {bundle.author}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!bundle.isActive && bundle.factoryId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetActive(bundle.id, bundle.factoryId)}
                      >
                        <Circle className="h-4 w-4 mr-1" />
                        Aktivieren
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCloneBundle(bundle.id, bundle.name)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditBundle(bundle)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteBundle(bundle.id)}
                      disabled={bundle.isActive || bundle.queueConfigs?.length > 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      PreAcceptanceQueue
                    </div>
                    {bundle.papScriptPath ? (
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded block truncate">
                        {bundle.papScriptPath}
                      </code>
                    ) : (
                      <p className="text-xs text-gray-400">nicht konfiguriert</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                      PreInspectionQueue
                    </div>
                    {bundle.pipScriptPath ? (
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded block truncate">
                        {bundle.pipScriptPath}
                      </code>
                    ) : (
                      <p className="text-xs text-gray-400">nicht konfiguriert</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      PostInspectionQueue
                    </div>
                    {bundle.pipoScriptPath ? (
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded block truncate">
                        {bundle.pipoScriptPath}
                      </code>
                    ) : (
                      <p className="text-xs text-gray-400">nicht konfiguriert</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBundle ? 'Bundle bearbeiten' : 'Neues Bundle erstellen'}
            </DialogTitle>
            <DialogDescription>
              Python-Skripte für die drei Warteschlangen konfigurieren
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. FIFO Optimierung"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author">Autor</Label>
                <Input
                  id="author"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  placeholder="z.B. Max Mustermann"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Beschreiben Sie die Strategie dieses Bundles..."
                rows={2}
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-blue-700 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                PreAcceptanceQueue
              </h3>
              <div className="space-y-2">
                <Label htmlFor="papScript">Python Skript-Pfad</Label>
                <Input
                  id="papScript"
                  value={formData.papScriptPath}
                  onChange={(e) => setFormData({ ...formData, papScriptPath: e.target.value })}
                  placeholder="python/operators/pap.py"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                PreInspectionQueue
              </h3>
              <div className="space-y-2">
                <Label htmlFor="pipScript">Python Skript-Pfad</Label>
                <Input
                  id="pipScript"
                  value={formData.pipScriptPath}
                  onChange={(e) => setFormData({ ...formData, pipScriptPath: e.target.value })}
                  placeholder="python/operators/pip.py"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                PostInspectionQueue
              </h3>
              <div className="space-y-2">
                <Label htmlFor="pipoScript">Python Skript-Pfad</Label>
                <Input
                  id="pipoScript"
                  value={formData.pipoScriptPath}
                  onChange={(e) => setFormData({ ...formData, pipoScriptPath: e.target.value })}
                  placeholder="python/operators/pipo.py"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveBundle}>
              {editingBundle ? 'Aktualisieren' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
