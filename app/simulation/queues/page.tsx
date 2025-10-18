'use client'

import { QueueViewer } from '@/components/advanced-simulation/QueueViewer'
import { QueueConfigPanel } from '@/components/advanced-simulation/QueueConfigPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function QueuesContent() {
  const searchParams = useSearchParams()
  const highlight = searchParams.get('highlight')
  const [factoryId, setFactoryId] = useState<string>('')

  useEffect(() => {
    const loadFactoryId = async () => {
      // Fetch all factories first
      try {
        console.log('🔍 Fetching factories from API...')
        const res = await fetch('/api/factories')
        if (!res.ok) {
          console.error('❌ API response not ok:', res.status, res.statusText)
          return
        }
        const data = await res.json()
        console.log('📦 Factories API response:', data)

        if (!Array.isArray(data) || data.length === 0) {
          console.warn('⚠️ No factories found in response')
          return
        }

        // Try localStorage first, but validate it exists in DB
        const storedFactoryId = localStorage.getItem('currentFactoryId')
        if (storedFactoryId) {
          console.log('🔍 Found factoryId in localStorage:', storedFactoryId)
          const factoryExists = data.some((f: any) => f.id === storedFactoryId)
          if (factoryExists) {
            console.log('✅ FactoryId validated and exists in DB')
            setFactoryId(storedFactoryId)
            return
          } else {
            console.warn('⚠️ FactoryId in localStorage is invalid/outdated. Clearing...')
            localStorage.removeItem('currentFactoryId')
          }
        }

        // Use first factory as fallback
        const firstFactoryId = data[0].id
        console.log('✅ Using first factory from API:', firstFactoryId)
        console.log('📋 Factory details:', data[0])
        setFactoryId(firstFactoryId)
        localStorage.setItem('currentFactoryId', firstFactoryId)
      } catch (err) {
        console.error('❌ Failed to fetch factories:', err)
      }
    }

    loadFactoryId()
  }, [])

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Simulation Queue Monitor</h1>
        <p className="text-muted-foreground mt-2">
          Live view of all simulation queues with release times and order status
        </p>
      </div>

      <div className="mb-6">
        {factoryId ? (
          <QueueConfigPanel factoryId={factoryId} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Loading Configuration...</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Fetching factory information...</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        <div className={highlight === 'preAcceptance' ? 'ring-2 ring-blue-500 rounded-lg' : ''}>
          <QueueViewer
            queueType="preAcceptance"
            title="Pre-Acceptance Queue"
            autoRefresh={true}
            refreshInterval={2000}
          />
        </div>

        <div className={highlight === 'preInspection' ? 'ring-2 ring-blue-500 rounded-lg' : ''}>
          <QueueViewer
            queueType="preInspection"
            title="Pre-Inspection Queue"
            autoRefresh={true}
            refreshInterval={2000}
          />
        </div>

        <div className={highlight === 'postInspection' ? 'ring-2 ring-blue-500 rounded-lg' : ''}>
          <QueueViewer
            queueType="postInspection"
            title="Post-Inspection Queue"
            autoRefresh={true}
            refreshInterval={2000}
          />
        </div>
      </div>
    </div>
  )
}

export default function QueuesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QueuesContent />
    </Suspense>
  )
}
