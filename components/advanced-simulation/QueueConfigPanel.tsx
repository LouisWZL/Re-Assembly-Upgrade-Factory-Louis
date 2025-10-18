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
    postInspectionReleaseMinutes: 0
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
          postInspectionReleaseMinutes: result.data.postInspectionReleaseMinutes
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
      if (!factoryId) {
        toast.error('No factory ID available. Please refresh the page.')
        setSaving(false)
        return
      }

      const result = await updateQueueConfig(factoryId, {
        preAcceptanceReleaseMinutes: config.preAcceptanceReleaseMinutes,
        preInspectionReleaseMinutes: config.preInspectionReleaseMinutes,
        postInspectionReleaseMinutes: config.postInspectionReleaseMinutes
      })

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
          Set the simulation wait times (in minutes) for each queue stage. Orders werden nach Ablauf automatisch freigegeben.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="preAcceptance">
              Pre-Acceptance Queue (Minuten)
            </Label>
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
            <p className="text-xs text-muted-foreground">
              Wartezeit vor Auftragsannahme
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preInspection">
              Pre-Inspection Queue (Minuten)
            </Label>
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
            <p className="text-xs text-muted-foreground">
              Wartezeit vor Inspektion
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postInspection">
              Post-Inspection Queue (Minuten)
            </Label>
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
            <p className="text-xs text-muted-foreground">
              Wartezeit nach Inspektion
            </p>
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
