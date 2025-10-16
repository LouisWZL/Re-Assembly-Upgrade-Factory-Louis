'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getQueueConfig, updateQueueConfig } from '@/app/actions/queue.actions'
import { Settings, Save } from 'lucide-react'

interface QueueConfigPanelProps {
  factoryId: string
}

export function QueueConfigPanel({ factoryId }: QueueConfigPanelProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    preAcceptanceReleaseMinutes: 0,
    preInspectionReleaseMinutes: 0,
    postInspectionReleaseMinutes: 0,
    preAcceptancePythonScript: '',
    preInspectionPythonScript: '',
    postInspectionPythonScript: ''
  })

  useEffect(() => {
    loadConfig()
  }, [factoryId])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const result = await getQueueConfig(factoryId)
      if (result.success && result.data) {
        setConfig({
          preAcceptanceReleaseMinutes: result.data.preAcceptanceReleaseMinutes,
          preInspectionReleaseMinutes: result.data.preInspectionReleaseMinutes,
          postInspectionReleaseMinutes: result.data.postInspectionReleaseMinutes,
          preAcceptancePythonScript: result.data.preAcceptancePythonScript || '',
          preInspectionPythonScript: result.data.preInspectionPythonScript || '',
          postInspectionPythonScript: result.data.postInspectionPythonScript || ''
        })
      }
    } catch (error) {
      console.error('Failed to load queue config:', error)
      toast.error('Failed to load queue configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      console.log('🔧 Saving queue config for factoryId:', factoryId)
      console.log('🔧 Config to save:', config)

      if (!factoryId) {
        toast.error('No factory ID available. Please refresh the page.')
        setSaving(false)
        return
      }

      const result = await updateQueueConfig(factoryId, config)
      console.log('📦 Save result:', result)

      if (result.success) {
        toast.success('Queue configuration saved successfully')
      } else {
        toast.error(result.error || 'Failed to save configuration')
      }
    } catch (error) {
      console.error('❌ Failed to save queue config:', error)
      toast.error('Failed to save queue configuration: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Queue Configuration
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Queue Configuration
        </CardTitle>
        <CardDescription>
          Set wait times (simulation minutes) and optional Python optimization scripts for each queue.
          <br />
          <strong>Note:</strong> This is the correct place to configure queue wait times for the simulation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="preAcceptance">
              Pre-Acceptance Queue Wait Time
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="preAcceptance"
                type="number"
                min="0"
                value={config.preAcceptanceReleaseMinutes}
                onChange={(e) => setConfig({
                  ...config,
                  preAcceptanceReleaseMinutes: parseInt(e.target.value) || 0
                })}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Wait time before order enters Auftragsannahme
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preInspection">
              Pre-Inspection Queue Wait Time
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="preInspection"
                type="number"
                min="0"
                value={config.preInspectionReleaseMinutes}
                onChange={(e) => setConfig({
                  ...config,
                  preInspectionReleaseMinutes: parseInt(e.target.value) || 0
                })}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Wait time before order enters Inspektion
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postInspection">
              Post-Inspection Queue Wait Time
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="postInspection"
                type="number"
                min="0"
                value={config.postInspectionReleaseMinutes}
                onChange={(e) => setConfig({
                  ...config,
                  postInspectionReleaseMinutes: parseInt(e.target.value) || 0
                })}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Wait time before order enters Demontage
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t">
          <h3 className="text-sm font-semibold mb-4">Python Optimization Scripts (Optional)</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Configure Python scripts to optimize order sequences. Leave empty to use FIFO order.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="preAcceptanceScript">Pre-Acceptance Script</Label>
              <Input
                id="preAcceptanceScript"
                type="text"
                placeholder="/path/to/script.py"
                value={config.preAcceptancePythonScript}
                onChange={(e) => setConfig({
                  ...config,
                  preAcceptancePythonScript: e.target.value
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preInspectionScript">Pre-Inspection Script</Label>
              <Input
                id="preInspectionScript"
                type="text"
                placeholder="/path/to/script.py"
                value={config.preInspectionPythonScript}
                onChange={(e) => setConfig({
                  ...config,
                  preInspectionPythonScript: e.target.value
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postInspectionScript">Post-Inspection Script</Label>
              <Input
                id="postInspectionScript"
                type="text"
                placeholder="/path/to/script.py"
                value={config.postInspectionPythonScript}
                onChange={(e) => setConfig({
                  ...config,
                  postInspectionPythonScript: e.target.value
                })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
