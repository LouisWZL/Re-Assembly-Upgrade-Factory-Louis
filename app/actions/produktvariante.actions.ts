'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

export async function getProduktvariante(varianteId: string) {
  try {
    const variante = await prisma.produktvariante.findUnique({
      where: { id: varianteId },
      include: {
        produkt: true,
        baugruppen: true
      }
    })

    if (!variante) {
      return { success: false, error: 'Produktvariante nicht gefunden' }
    }

    return { success: true, data: variante }
  } catch (error) {
    console.error('Error fetching product variant:', error)
    return { success: false, error: 'Fehler beim Abrufen der Produktvariante' }
  }
}

export async function getProduktvarianten(produktId: string) {
  try {
    const varianten = await prisma.produktvariante.findMany({
      where: { produktId },
      orderBy: { typ: 'asc' } // basic first, then premium
    })

    return { success: true, data: varianten }
  } catch (error) {
    console.error('Error fetching product variants:', error)
    return { success: false, error: 'Fehler beim Abrufen der Produktvarianten' }
  }
}

export async function updateProduktvariante(
  varianteId: string,
  data: {
    bezeichnung?: string
    glbFile?: string | null
  }
) {
  try {
    const updatedVariante = await prisma.produktvariante.update({
      where: { id: varianteId },
      data: {
        ...(data.bezeichnung && { bezeichnung: data.bezeichnung }),
        ...(data.glbFile !== undefined && { glbFile: data.glbFile })
      },
      include: {
        produkt: true
      }
    })

    // Revalidate paths
    if (updatedVariante.produkt.factoryId) {
      revalidatePath(`/factory-configurator/${updatedVariante.produkt.factoryId}`)
    }
    revalidatePath('/factory-configurator')

    return { 
      success: true, 
      data: updatedVariante,
      message: 'Produktvariante erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating product variant:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return { success: false, error: 'Produktvariante nicht gefunden' }
      }
    }
    return { success: false, error: 'Fehler beim Aktualisieren der Produktvariante' }
  }
}

export async function uploadVarianteGlbFile(
  varianteId: string,
  glbFileUrl: string
) {
  try {
    const updatedVariante = await prisma.produktvariante.update({
      where: { id: varianteId },
      data: { glbFile: glbFileUrl },
      include: {
        produkt: true
      }
    })

    // Revalidate paths
    if (updatedVariante.produkt.factoryId) {
      revalidatePath(`/factory-configurator/${updatedVariante.produkt.factoryId}`)
    }

    return { 
      success: true, 
      data: updatedVariante,
      message: '3D-Modell erfolgreich hochgeladen'
    }
  } catch (error) {
    console.error('Error uploading GLB file:', error)
    return { success: false, error: 'Fehler beim Hochladen des 3D-Modells' }
  }
}

export async function deleteVarianteGlbFile(varianteId: string) {
  try {
    const updatedVariante = await prisma.produktvariante.update({
      where: { id: varianteId },
      data: { glbFile: null },
      include: {
        produkt: true
      }
    })

    // Revalidate paths
    if (updatedVariante.produkt.factoryId) {
      revalidatePath(`/factory-configurator/${updatedVariante.produkt.factoryId}`)
    }

    return { 
      success: true, 
      data: updatedVariante,
      message: '3D-Modell erfolgreich gelöscht'
    }
  } catch (error) {
    console.error('Error deleting GLB file:', error)
    return { success: false, error: 'Fehler beim Löschen des 3D-Modells' }
  }
}