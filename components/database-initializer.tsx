'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export function DatabaseInitializer({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [initStep, setInitStep] = useState<string>('Starting...')

  useEffect(() => {
    let mounted = true

    async function initializeDatabase() {
      try {
        console.log('🚀 Starting database initialization check...')
        setInitStep('Checking existing data...')
        
        // First, try to check if data exists
        const factoriesResponse = await fetch('/api/factories', {
          method: 'GET',
          cache: 'no-store'
        })

        if (!factoriesResponse.ok) {
          console.error('Failed to fetch factories:', factoriesResponse.status, await factoriesResponse.text())
          
          // Try force initialization
          console.log('🔄 Attempting force initialization...')
          setInitStep('Initializing database...')
          const forceInitResponse = await fetch('/api/force-init', {
            method: 'POST',
            cache: 'no-store'
          })
          
          if (!forceInitResponse.ok) {
            const errorText = await forceInitResponse.text()
            console.error('Force init failed:', errorText)
            throw new Error(`Force initialization failed: ${errorText}`)
          }
          
          const forceInitData = await forceInitResponse.json()
          console.log('✅ Force initialization successful:', forceInitData)
          
          if (mounted) {
            toast.success('Database initialized successfully')
          }
        } else {
          const factories = await factoriesResponse.json()
          
          if (Array.isArray(factories) && factories.length > 0) {
            console.log(`✅ Found ${factories.length} factories in database`)
          } else {
            console.log('⚠️ No factories found, attempting initialization...')
            
            // Try force initialization
            const forceInitResponse = await fetch('/api/force-init', {
              method: 'POST',
              cache: 'no-store'
            })
            
            if (!forceInitResponse.ok) {
              const errorText = await forceInitResponse.text()
              console.error('Force init failed:', errorText)
              throw new Error(`Force initialization failed: ${errorText}`)
            }
            
            const forceInitData = await forceInitResponse.json()
            console.log('✅ Force initialization successful:', forceInitData)
            
            if (mounted) {
              toast.success('Database initialized successfully')
            }
          }
        }

        if (mounted) {
          setIsInitialized(true)
        }
      } catch (error) {
        console.error('Database initialization error:', error)
        
        if (mounted) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          setInitError(errorMessage)
          toast.error('Database initialization failed: ' + errorMessage)
        }
      }
    }

    // Only run initialization in production or if NODE_ENV is not set
    if (typeof window !== 'undefined') {
      initializeDatabase()
    } else {
      // On server side, assume initialized
      setIsInitialized(true)
    }

    return () => {
      mounted = false
    }
  }, [])

  if (!isInitialized && !initError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Initializing database...</p>
          <p className="text-sm text-muted-foreground">{initStep}</p>
        </div>
      </div>
    )
  }

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-red-500 text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-red-600">Database Error</h1>
          <p className="text-muted-foreground">
            Failed to initialize database: {initError}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-primary text-primary-foreground px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}