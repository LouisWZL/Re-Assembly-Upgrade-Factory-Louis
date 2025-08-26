'use client'

import { useEffect, useState } from 'react'
import { PencilIcon, SaveIcon } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface Factory {
  id: string
  name: string
  kapazität: number
  produkte: Product[]
  auftraege: Auftrag[]
}

interface Product {
  id: string
  bezeichnung: string
  seriennummer: string
  varianten: ProductVariant[]
}

interface ProductVariant {
  id: string
  bezeichnung: string
  zustand: string | null
  baugruppen: Baugruppe[]
}

interface Baugruppe {
  id: string
  bezeichnung: string
  artikelnummer: string
  variantenTyp: string
  prozesszeit: number | null
  volumen: number | null
  prozesse: Prozess[]
  baugruppentyp?: {
    id: string
    bezeichnung: string
  }
}

interface Prozess {
  id: string
  name: string
}

interface Auftrag {
  id: string
  phase: string
  reAssemblyTyp: string
  kunde: {
    vorname: string
    nachname: string
  }
  produktvariante: {
    bezeichnung: string
  }
}

export function FactorySelector() {
  const [factories, setFactories] = useState<Factory[]>([])
  const [selectedFactory, setSelectedFactory] = useState<string>('')
  const [currentFactory, setCurrentFactory] = useState<Factory | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const isConfigurator = pathname.startsWith('/factory-configurator/')

  useEffect(() => {
    fetchFactories()
  }, [])

  // Synchronize selected factory with URL on configurator page
  useEffect(() => {
    if (isConfigurator && pathname.includes('/factory-configurator/')) {
      const urlFactoryId = pathname.split('/').pop()
      if (urlFactoryId && urlFactoryId !== selectedFactory) {
        setSelectedFactory(urlFactoryId)
      }
    }
  }, [pathname, isConfigurator])

  useEffect(() => {
    if (selectedFactory) {
      const factory = factories.find(f => f.id === selectedFactory)
      setCurrentFactory(factory || null)
    }
  }, [selectedFactory, factories])

  // Update URL when factory changes in configurator (only from select dropdown)
  const handleFactoryChange = (value: string) => {
    setSelectedFactory(value)
    if (isConfigurator) {
      router.replace(`/factory-configurator/${value}`)
    }
  }

  const fetchFactories = async () => {
    try {
      const response = await fetch('/api/factories')
      const data = await response.json()
      
      // Check if data is an array
      if (!Array.isArray(data)) {
        console.error('Invalid response format:', data)
        setFactories([])
        setLoading(false)
        return
      }
      
      setFactories(data)
      
      // Only set default factory if no factory is selected
      if (data.length > 0 && !selectedFactory) {
        // If we're on configurator page, get factory from URL
        if (isConfigurator && pathname.includes('/factory-configurator/')) {
          const urlFactoryId = pathname.split('/').pop()
          if (urlFactoryId) {
            setSelectedFactory(urlFactoryId)
          } else {
            setSelectedFactory(data[0].id)
          }
        } else {
          setSelectedFactory(data[0].id)
        }
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching factories:', error)
      setFactories([])
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-10 w-[200px] bg-muted rounded-md" />
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedFactory} onValueChange={handleFactoryChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Wähle eine Factory" />
        </SelectTrigger>
        <SelectContent>
          {factories.map((factory) => (
            <SelectItem key={factory.id} value={factory.id}>
              {factory.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        onClick={async () => {
          if (isConfigurator) {
            router.push('/')
          } else {
            try {
              // Get the first factory automatically
              const response = await fetch('/api/get-first-factory')
              const data = await response.json()
              
              if (response.ok && data.factory) {
                router.push(`/factory-configurator/${data.factory.id}`)
              } else {
                // Fallback to selected factory if available
                if (selectedFactory) {
                  router.push(`/factory-configurator/${selectedFactory}`)
                } else {
                  console.error('No factory available for configuration')
                }
              }
            } catch (error) {
              console.error('Error getting first factory:', error)
              // Fallback to selected factory if available
              if (selectedFactory) {
                router.push(`/factory-configurator/${selectedFactory}`)
              }
            }
          }
        }}
        disabled={!currentFactory}
      >
        {isConfigurator ? <SaveIcon className="h-4 w-4" /> : <PencilIcon className="h-4 w-4" />}
      </Button>
    </div>
  )
}