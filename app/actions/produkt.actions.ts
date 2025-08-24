'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { extractBaugruppentypenFromGraph } from '@/lib/graph-utils'
import { generateProcessGraph } from '@/lib/process-graph-generator'

export async function getProdukt(produktId: string) {
  try {
    const produkt = await prisma.produkt.findUnique({
      where: { id: produktId },
      include: {
        baugruppentypen: true,
        varianten: true,
        factory: true
      }
    })

    if (!produkt) {
      return { success: false, error: 'Produkt nicht gefunden' }
    }

    return { success: true, data: produkt }
  } catch (error) {
    console.error('Error fetching product:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { success: false, error: `Datenbankfehler: ${error.message}` }
    }
    return { success: false, error: 'Fehler beim Abrufen des Produkts' }
  }
}

export async function updateProduktGraph(produktId: string, graphData: any) {
  try {
    // Extract Baugruppentyp IDs from the graph
    const baugruppentypenIds = extractBaugruppentypenFromGraph(graphData)
    
    // Generate process graph from product graph
    const processGraphData = generateProcessGraph(graphData)
    
    // Update product with new graph data and Baugruppentypen associations
    const updatedProdukt = await prisma.produkt.update({
      where: { id: produktId },
      data: { 
        graphData,
        processGraphData, // Save the generated process graph
        // Replace existing Baugruppentypen associations with the ones from the graph
        baugruppentypen: {
          set: baugruppentypenIds.map(id => ({ id }))
        }
      },
      include: {
        baugruppentypen: true
      }
    })

    // Revalidate the factory page to reflect changes
    if (updatedProdukt.factoryId) {
      revalidatePath(`/factory/${updatedProdukt.factoryId}`)
      revalidatePath(`/factory-configurator/${updatedProdukt.factoryId}`)
    }

    return { 
      success: true, 
      data: updatedProdukt,
      message: `Graph gespeichert. ${baugruppentypenIds.length} Baugruppentypen zugeordnet.`
    }
  } catch (error) {
    console.error('Error updating product graph:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return { success: false, error: 'Produkt nicht gefunden' }
      }
      return { success: false, error: `Datenbankfehler: ${error.message}` }
    }
    return { success: false, error: 'Fehler beim Speichern des Graphen' }
  }
}

export async function getProduktWithProcessGraph(produktId: string) {
  try {
    const produkt = await prisma.produkt.findUnique({
      where: { id: produktId },
      select: {
        id: true,
        bezeichnung: true,
        graphData: true,
        processGraphData: true,
        baugruppentypen: true
      }
    })

    if (!produkt) {
      return { success: false, error: 'Produkt nicht gefunden' }
    }

    return { success: true, data: produkt }
  } catch (error) {
    console.error('Error fetching product with process graph:', error)
    return { success: false, error: 'Fehler beim Abrufen des Produkts' }
  }
}

export async function updateProduktProcessGraph(produktId: string, processGraphData: any) {
  try {
    // Update the product with the process graph data
    const updatedProdukt = await prisma.produkt.update({
      where: { id: produktId },
      data: {
        processGraphData: processGraphData
      }
    })

    return { 
      success: true, 
      message: 'Prozessstruktur erfolgreich gespeichert'
    }
  } catch (error) {
    console.error('Error updating product process graph:', error)
    return { 
      success: false, 
      error: 'Fehler beim Speichern der Prozessstruktur' 
    }
  }
}

export async function createProdukt(
  factoryId: string,
  data: {
    bezeichnung: string
    seriennummer: string
  }
) {
  try {
    // Check if factory already has a product
    const existingProdukt = await prisma.produkt.findFirst({
      where: { factoryId }
    })

    if (existingProdukt) {
      return {
        success: false,
        error: 'Diese Factory hat bereits ein Produkt. Bitte löschen Sie das vorhandene Produkt, bevor Sie ein neues erstellen.'
      }
    }

    // Check if seriennummer already exists
    const existing = await prisma.produkt.findUnique({
      where: { seriennummer: data.seriennummer }
    })

    if (existing) {
      return {
        success: false,
        error: 'Ein Produkt mit dieser Seriennummer existiert bereits'
      }
    }

    // Create product with automatic Basic and Premium variants
    const newProdukt = await prisma.produkt.create({
      data: {
        bezeichnung: data.bezeichnung,
        seriennummer: data.seriennummer,
        factoryId,
        varianten: {
          create: [
            {
              bezeichnung: `${data.bezeichnung} Basic`,
              typ: 'basic',
              zustand: 'GUT',
              links: {} // Empty links object as required by schema
            },
            {
              bezeichnung: `${data.bezeichnung} Premium`,
              typ: 'premium',
              zustand: 'SEHR_GUT',
              links: {} // Empty links object as required by schema
            }
          ]
        }
      },
      include: {
        baugruppentypen: true,
        varianten: true,
        factory: true
      }
    })

    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${factoryId}`)
    revalidatePath('/api/factories') // Revalidate factories API for sidebar

    return { success: true, data: newProdukt, message: 'Produkt mit Basic und Premium Varianten erfolgreich erstellt' }
  } catch (error) {
    console.error('Error creating product:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return { success: false, error: 'Ein Produkt mit dieser Seriennummer existiert bereits' }
      }
      return { success: false, error: `Datenbankfehler: ${error.message}` }
    }
    return { success: false, error: 'Fehler beim Erstellen des Produkts' }
  }
}

export async function updateProdukt(
  produktId: string,
  data: {
    bezeichnung: string
    seriennummer: string
  }
) {
  try {
    // Check if new seriennummer already exists (excluding current product)
    const existing = await prisma.produkt.findFirst({
      where: {
        seriennummer: data.seriennummer,
        NOT: { id: produktId }
      }
    })

    if (existing) {
      return {
        success: false,
        error: 'Ein anderes Produkt mit dieser Seriennummer existiert bereits'
      }
    }

    // Update product and its variants' names
    const updatedProdukt = await prisma.produkt.update({
      where: { id: produktId },
      data: {
        bezeichnung: data.bezeichnung,
        seriennummer: data.seriennummer,
        varianten: {
          updateMany: [
            {
              where: { 
                produktId: produktId,
                typ: 'basic'
              },
              data: {
                bezeichnung: `${data.bezeichnung} Basic`
              }
            },
            {
              where: { 
                produktId: produktId,
                typ: 'premium'
              },
              data: {
                bezeichnung: `${data.bezeichnung} Premium`
              }
            }
          ]
        }
      },
      include: {
        baugruppentypen: true,
        varianten: true,
        factory: true
      }
    })

    revalidatePath('/factory-configurator')
    if (updatedProdukt.factoryId) {
      revalidatePath(`/factory-configurator/${updatedProdukt.factoryId}`)
    }
    revalidatePath('/api/factories') // Revalidate factories API for sidebar

    return { success: true, data: updatedProdukt, message: 'Produkt erfolgreich aktualisiert' }
  } catch (error) {
    console.error('Error updating product:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return { success: false, error: 'Produkt nicht gefunden' }
      }
      if (error.code === 'P2002') {
        return { success: false, error: 'Ein Produkt mit dieser Seriennummer existiert bereits' }
      }
      return { success: false, error: `Datenbankfehler: ${error.message}` }
    }
    return { success: false, error: 'Fehler beim Aktualisieren des Produkts' }
  }
}

export async function deleteProdukt(produktId: string) {
  try {
    // Get product with all relations
    const produkt = await prisma.produkt.findUnique({
      where: { id: produktId },
      include: {
        varianten: {
          include: {
            baugruppen: true,
            auftraege: true
          }
        },
        baugruppentypen: true
      }
    })

    if (!produkt) {
      return {
        success: false,
        error: 'Produkt nicht gefunden'
      }
    }

    // Delete all orders (Aufträge) that use this product's variants
    for (const variante of produkt.varianten) {
      if (variante.auftraege && variante.auftraege.length > 0) {
        // First delete all Liefertermine for each Auftrag
        const auftragIds = variante.auftraege.map(a => a.id)
        await prisma.liefertermin.deleteMany({
          where: {
            auftragId: {
              in: auftragIds
            }
          }
        })
        
        // Then delete all Aufträge
        await prisma.auftrag.deleteMany({
          where: {
            produktvarianteId: variante.id
          }
        })
      }
    }

    // First disconnect all baugruppen from variants (many-to-many relationship)
    for (const variante of produkt.varianten) {
      if (variante.baugruppen.length > 0) {
        await prisma.produktvariante.update({
          where: { id: variante.id },
          data: {
            baugruppen: {
              set: [] // Disconnect all baugruppen
            }
          }
        })
      }
    }

    // Disconnect all baugruppentypen from the product
    if (produkt.baugruppentypen.length > 0) {
      await prisma.produkt.update({
        where: { id: produktId },
        data: {
          baugruppentypen: {
            set: [] // Disconnect all baugruppentypen
          }
        }
      })
    }

    // Delete all variants
    await prisma.produktvariante.deleteMany({
      where: { produktId: produktId }
    })

    // Delete the product
    await prisma.produkt.delete({
      where: { id: produktId }
    })

    revalidatePath('/factory-configurator')
    if (produkt.factoryId) {
      revalidatePath(`/factory-configurator/${produkt.factoryId}`)
    }
    revalidatePath('/api/factories') // Revalidate factories API for sidebar

    return { success: true, message: 'Produkt und zugehörige Varianten erfolgreich gelöscht' }
  } catch (error) {
    console.error('Error deleting product:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return { success: false, error: 'Produkt nicht gefunden' }
      }
      if (error.code === 'P2003') {
        return { success: false, error: 'Produkt kann nicht gelöscht werden, da es noch verwendet wird' }
      }
      return { success: false, error: `Datenbankfehler: ${error.message}` }
    }
    return { success: false, error: 'Fehler beim Löschen des Produkts' }
  }
}

export async function getProdukte(factoryId: string) {
  try {
    const produkte = await prisma.produkt.findMany({
      where: { factoryId },
      include: {
        varianten: true,
        baugruppentypen: true
      },
      orderBy: { createdAt: 'desc' }
    })

    return {
      success: true,
      data: produkte
    }
  } catch (error) {
    console.error('Error fetching Produkte:', error)
    
    return {
      success: false,
      error: 'Fehler beim Abrufen der Produkte'
    }
  }
}