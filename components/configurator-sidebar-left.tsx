'use client'

import { useState, useEffect } from 'react'
import { Home, Settings, Package, Box, Workflow, ChevronRight } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from '@/components/ui/sidebar'

interface Produkt {
  id: string
  bezeichnung: string
  seriennummer: string
  varianten: Variante[]
  baugruppentypen: Baugruppentyp[]
}

interface Variante {
  id: string
  bezeichnung: string
  zustand: string | null
  typ: string
}

interface Baugruppentyp {
  id: string
  bezeichnung: string
  beschreibung?: string | null
}

interface ConfiguratorSidebarLeftProps {
  factoryId: string
}

export function ConfiguratorSidebarLeft({ factoryId }: ConfiguratorSidebarLeftProps) {
  const [produkte, setProdukte] = useState<Produkt[]>([])
  const [selectedVariante, setSelectedVariante] = useState<string | null>(null)
  const [selectedProdukt, setSelectedProdukt] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<string>('home')
  const [loading, setLoading] = useState(true)
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchProdukte()
    // Trigger initial home view
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: 'home' }))
  }, [factoryId])

  useEffect(() => {
    // Listen for factory updates
    const handleFactoryUpdate = () => {
      fetchProdukte()
    }

    window.addEventListener('factoryUpdated', handleFactoryUpdate)
    
    return () => {
      window.removeEventListener('factoryUpdated', handleFactoryUpdate)
    }
  }, [factoryId])

  const fetchProdukte = async () => {
    try {
      console.log('Fetching products for factory:', factoryId)
      const response = await fetch('/api/factories')
      const data = await response.json()
      
      console.log('Factories response:', data)
      
      if (!Array.isArray(data)) {
        console.error('Invalid response format:', data)
        setProdukte([])
        setLoading(false)
        return
      }
      
      const factory = data.find((f: any) => f.id === factoryId)
      console.log('Found factory:', factory)
      
      if (factory) {
        console.log('Factory products:', factory.produkte)
        setProdukte(factory.produkte || [])
      } else {
        console.error('Factory not found with ID:', factoryId)
        setProdukte([])
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching produkte:', error)
      setProdukte([])
      setLoading(false)
    }
  }

  const handleVarianteClick = (produktId: string, varianteId: string) => {
    setSelectedVariante(varianteId)
    setSelectedProdukt(produktId)
    setActiveView('variante')
    window.dispatchEvent(new CustomEvent('varianteSelected', { detail: varianteId }))
  }
  
  const handleViewClick = (view: string) => {
    setActiveView(view)
    setSelectedProdukt(null)
    setSelectedVariante(null)
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: view }))
  }

  const handleProduktClick = (produkt: Produkt) => {
    setSelectedProdukt(produkt.id)
    setSelectedVariante(null)
    setActiveView('produkt')
    window.dispatchEvent(new CustomEvent('produktSelected', { detail: produkt.id }))
    
    // Toggle expansion
    const newExpanded = new Set(expandedProducts)
    if (newExpanded.has(produkt.id)) {
      newExpanded.delete(produkt.id)
    } else {
      newExpanded.add(produkt.id)
    }
    setExpandedProducts(newExpanded)
  }

  const navigationItems = [
    {
      title: "Home",
      icon: Home,
      view: "home",
    },
    {
      title: "Fabrikeinstellungen",
      icon: Settings,
      view: "einstellungen",
    },
  ]

  return (
    <Sidebar 
      side="left" 
      collapsible="icon"
      className="border-r"
    >
      <SidebarHeader className="border-b">
        <div className="px-3 py-2">
          <h2 className="text-sm font-semibold">Factory Configurator</h2>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Navigation items */}
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton 
                    onClick={() => handleViewClick(item.view)}
                    isActive={activeView === item.view}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              {/* Verwaltung items */}
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => handleViewClick('produkte')}
                  isActive={activeView === 'produkte'}
                >
                  <Package className="h-4 w-4" />
                  <span>Produkte</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={() => handleViewClick('baugruppen')}
                  isActive={activeView === 'baugruppen'}
                >
                  <Box className="h-4 w-4" />
                  <span>Baugruppen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {/* Prozesse items */}
              {!loading && produkte.length > 0 && produkte.map((produkt) => (
                <SidebarMenuItem key={produkt.id}>
                  <SidebarMenuButton
                    onClick={() => handleProduktClick(produkt)}
                    isActive={selectedProdukt === produkt.id && activeView === 'produkt'}
                  >
                    <Workflow className="h-4 w-4" />
                    <span>{produkt.bezeichnung}</span>
                    <ChevronRight 
                      className={`ml-auto h-4 w-4 transition-transform ${
                        expandedProducts.has(produkt.id) ? 'rotate-90' : ''
                      }`}
                    />
                  </SidebarMenuButton>
                  {expandedProducts.has(produkt.id) && produkt.varianten.length > 0 && (
                    <SidebarMenuSub>
                      {produkt.varianten.map((variante) => (
                        <SidebarMenuSubItem key={variante.id}>
                          <SidebarMenuSubButton
                            onClick={(e) => {
                              e.stopPropagation()
                              handleVarianteClick(produkt.id, variante.id)
                            }}
                            isActive={selectedVariante === variante.id}
                          >
                            <span className="text-xs">{variante.bezeichnung}</span>
                            {variante.typ && (
                              <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
                                variante.typ === 'premium' 
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
                                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                              }`}>
                                {variante.typ}
                              </span>
                            )}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}