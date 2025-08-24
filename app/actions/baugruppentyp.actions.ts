"use server"

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { removeShapeFromGraph, graphContainsBaugruppentyp, updateShapeInGraph } from '@/lib/graph-utils'

export async function createBaugruppentyp(data: {
  bezeichnung: string
  factoryId: string
}) {
  try {
    const baugruppentyp = await prisma.baugruppentyp.create({
      data: {
        bezeichnung: data.bezeichnung,
        factory: {
          connect: { id: data.factoryId }
        }
      }
    })
    
    revalidatePath('/factory-configurator')
    
    return {
      success: true,
      data: baugruppentyp,
      message: 'Baugruppentyp erfolgreich erstellt'
    }
  } catch (error) {
    console.error('Error creating Baugruppentyp:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Ein Baugruppentyp mit dieser Bezeichnung existiert bereits'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Erstellen des Baugruppentyps'
    }
  }
}

export async function updateBaugruppentyp(id: string, data: {
  bezeichnung?: string
}) {
  try {
    // Update the Baugruppentyp
    const baugruppentyp = await prisma.baugruppentyp.update({
      where: { id },
      data: {
        bezeichnung: data.bezeichnung
      }
    })
    
    // Find all products that have this Baugruppentyp in their graph
    const produkteWithBaugruppentyp = await prisma.produkt.findMany({
      where: {
        baugruppentypen: {
          some: { id }
        }
      }
    })
    
    // Update each product's graph to reflect the new bezeichnung
    let updatedGraphsCount = 0
    for (const produkt of produkteWithBaugruppentyp) {
      if (produkt.graphData) {
        const graphData = typeof produkt.graphData === 'string' 
          ? JSON.parse(produkt.graphData) 
          : produkt.graphData
        
        // Only update if the graph contains this Baugruppentyp
        if (graphContainsBaugruppentyp(graphData, id)) {
          const updatedGraphData = updateShapeInGraph(graphData, id, data.bezeichnung!)
          
          // Update the product with updated graph
          await prisma.produkt.update({
            where: { id: produkt.id },
            data: {
              graphData: updatedGraphData as any
            }
          })
          updatedGraphsCount++
        }
      }
    }
    
    revalidatePath('/factory-configurator')
    
    return {
      success: true,
      data: baugruppentyp,
      message: `Baugruppentyp erfolgreich aktualisiert. ${updatedGraphsCount} Produkt-Graphen wurden aktualisiert.`
    }
  } catch (error) {
    console.error('Error updating Baugruppentyp:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Ein Baugruppentyp mit dieser Bezeichnung existiert bereits'
        }
      }
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Baugruppentyp nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren des Baugruppentyps'
    }
  }
}

export async function deleteBaugruppentyp(id: string) {
  try {
    // First, delete all Baugruppen that use this Baugruppentyp
    await prisma.baugruppe.deleteMany({
      where: { baugruppentypId: id }
    })
    
    // Find all products that have this Baugruppentyp in their graph or associations
    const produkteWithBaugruppentyp = await prisma.produkt.findMany({
      where: {
        OR: [
          {
            baugruppentypen: {
              some: { id }
            }
          }
        ]
      },
      include: {
        baugruppentypen: true
      }
    })
    
    // Update each product's graph to remove the Baugruppentyp shapes and links
    for (const produkt of produkteWithBaugruppentyp) {
      if (produkt.graphData) {
        const graphData = typeof produkt.graphData === 'string' 
          ? JSON.parse(produkt.graphData) 
          : produkt.graphData
        
        // Only update if the graph contains this Baugruppentyp
        if (graphContainsBaugruppentyp(graphData, id)) {
          const updatedGraphData = removeShapeFromGraph(graphData, id)
          
          // Update the product with cleaned graph and remove from associations
          await prisma.produkt.update({
            where: { id: produkt.id },
            data: {
              graphData: updatedGraphData as any,
              baugruppentypen: {
                disconnect: { id }
              }
            }
          })
        } else {
          // Just disconnect from associations if not in graph
          await prisma.produkt.update({
            where: { id: produkt.id },
            data: {
              baugruppentypen: {
                disconnect: { id }
              }
            }
          })
        }
      }
    }
    
    // Finally, delete the Baugruppentyp
    await prisma.baugruppentyp.delete({
      where: { id }
    })
    
    revalidatePath('/factory-configurator')
    
    return {
      success: true,
      message: `Baugruppentyp erfolgreich gelöscht. ${produkteWithBaugruppentyp.length} Produkt-Graphen wurden bereinigt.`
    }
  } catch (error) {
    console.error('Error deleting Baugruppentyp:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Baugruppentyp nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Löschen des Baugruppentyps'
    }
  }
}

export async function getBaugruppentypen(factoryId?: string) {
  try {
    const baugruppentypen = await prisma.baugruppentyp.findMany({
      where: factoryId ? { factoryId } : undefined,
      include: {
        baugruppen: true,
        produkte: true,
        factory: true
      },
      orderBy: {
        bezeichnung: 'asc'
      }
    })
    
    return {
      success: true,
      data: baugruppentypen
    }
  } catch (error) {
    console.error('Error fetching Baugruppentypen:', error)
    
    return {
      success: false,
      error: 'Fehler beim Abrufen der Baugruppentypen'
    }
  }
}

export async function getBaugruppentyp(id: string) {
  try {
    const baugruppentyp = await prisma.baugruppentyp.findUnique({
      where: { id },
      include: {
        baugruppen: true,
        produkte: true
      }
    })
    
    if (!baugruppentyp) {
      return {
        success: false,
        error: 'Baugruppentyp nicht gefunden'
      }
    }
    
    return {
      success: true,
      data: baugruppentyp
    }
  } catch (error) {
    console.error('Error fetching Baugruppentyp:', error)
    
    return {
      success: false,
      error: 'Fehler beim Abrufen des Baugruppentyps'
    }
  }
}