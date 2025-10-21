"use server"

import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

export async function createAlgorithmBundle(data: {
  name: string
  description?: string
  author?: string
  factoryId?: string
  papScriptPath?: string
  papDescription?: string
  pipScriptPath?: string
  pipDescription?: string
  pipoScriptPath?: string
  pipoDescription?: string
  isActive?: boolean
}) {
  try {
    await ensureDatabaseInitialized()

    // If setting as active, deactivate all other bundles for this factory
    if (data.isActive && data.factoryId) {
      await prisma.algorithmBundle.updateMany({
        where: {
          factoryId: data.factoryId,
          isActive: true
        },
        data: {
          isActive: false
        }
      })
    }

    const bundle = await prisma.algorithmBundle.create({
      data: {
        name: data.name,
        description: data.description,
        author: data.author,
        papScriptPath: data.papScriptPath,
        papDescription: data.papDescription,
        pipScriptPath: data.pipScriptPath,
        pipDescription: data.pipDescription,
        pipoScriptPath: data.pipoScriptPath,
        pipoDescription: data.pipoDescription,
        isActive: data.isActive ?? false,
        ...(data.factoryId && {
          factory: {
            connect: { id: data.factoryId }
          }
        })
      },
      include: {
        factory: true
      }
    })

    // If bundle is active, link QueueConfig to it
    if (data.isActive && data.factoryId) {
      await prisma.queueConfig.upsert({
        where: { factoryId: data.factoryId },
        create: {
          factoryId: data.factoryId,
          algorithmBundleId: bundle.id,
          preAcceptanceReleaseMinutes: 0,
          preInspectionReleaseMinutes: 0,
          postInspectionReleaseMinutes: 0
        },
        update: {
          algorithmBundleId: bundle.id
        }
      })
    }

    revalidatePath('/simulation/algorithms')
    revalidatePath('/factory-configurator')

    return {
      success: true,
      data: bundle,
      message: 'Algorithmus-Bundle erfolgreich erstellt'
    }
  } catch (error) {
    console.error('Error creating AlgorithmBundle:', error)

    return {
      success: false,
      error: 'Fehler beim Erstellen des Algorithmus-Bundles'
    }
  }
}

export async function updateAlgorithmBundle(id: string, data: {
  name?: string
  description?: string
  author?: string
  papScriptPath?: string
  papDescription?: string
  pipScriptPath?: string
  pipDescription?: string
  pipoScriptPath?: string
  pipoDescription?: string
  isActive?: boolean
}) {
  try {
    await ensureDatabaseInitialized()

    // If setting as active, deactivate all other bundles for this factory
    if (data.isActive) {
      const existingBundle = await prisma.algorithmBundle.findUnique({
        where: { id },
        select: { factoryId: true }
      })

      if (existingBundle?.factoryId) {
        await prisma.algorithmBundle.updateMany({
          where: {
            factoryId: existingBundle.factoryId,
            isActive: true,
            id: { not: id }
          },
          data: {
            isActive: false
          }
        })
      }
    }

    const bundle = await prisma.algorithmBundle.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        author: data.author,
        papScriptPath: data.papScriptPath,
        papDescription: data.papDescription,
        pipScriptPath: data.pipScriptPath,
        pipDescription: data.pipDescription,
        pipoScriptPath: data.pipoScriptPath,
        pipoDescription: data.pipoDescription,
        isActive: data.isActive
      },
      include: {
        factory: true
      }
    })

    // If bundle is being set to active, link QueueConfig to it
    if (data.isActive && bundle.factoryId) {
      await prisma.queueConfig.upsert({
        where: { factoryId: bundle.factoryId },
        create: {
          factoryId: bundle.factoryId,
          algorithmBundleId: bundle.id,
          preAcceptanceReleaseMinutes: 0,
          preInspectionReleaseMinutes: 0,
          postInspectionReleaseMinutes: 0
        },
        update: {
          algorithmBundleId: bundle.id
        }
      })
    }

    revalidatePath('/simulation/algorithms')
    revalidatePath('/factory-configurator')

    return {
      success: true,
      data: bundle,
      message: 'Algorithmus-Bundle erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating AlgorithmBundle:', error)

    return {
      success: false,
      error: 'Fehler beim Aktualisieren des Algorithmus-Bundles'
    }
  }
}

export async function deleteAlgorithmBundle(id: string) {
  try {
    await ensureDatabaseInitialized()

    await prisma.algorithmBundle.delete({
      where: { id }
    })

    revalidatePath('/simulation/algorithms')
    revalidatePath('/factory-configurator')

    return {
      success: true,
      message: 'Algorithmus-Bundle erfolgreich gelöscht'
    }
  } catch (error) {
    console.error('Error deleting AlgorithmBundle:', error)

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return {
          success: false,
          error: 'Bundle kann nicht gelöscht werden, da es noch von Queue-Konfigurationen verwendet wird'
        }
      }
    }

    return {
      success: false,
      error: 'Fehler beim Löschen des Algorithmus-Bundles'
    }
  }
}

export async function getAllAlgorithmBundles(factoryId?: string) {
  try {
    await ensureDatabaseInitialized()

    const bundles = await prisma.algorithmBundle.findMany({
      where: factoryId ? {
        OR: [
          { factoryId: factoryId },
          { factoryId: null } // Include global bundles
        ]
      } : undefined,
      include: {
        factory: true,
        queueConfigs: true
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return {
      success: true,
      data: bundles
    }
  } catch (error) {
    console.error('Error fetching AlgorithmBundles:', error)

    return {
      success: false,
      error: 'Fehler beim Laden der Algorithmus-Bundles',
      data: []
    }
  }
}

export async function getAlgorithmBundleById(id: string) {
  try {
    await ensureDatabaseInitialized()

    const bundle = await prisma.algorithmBundle.findUnique({
      where: { id },
      include: {
        factory: true,
        queueConfigs: true
      }
    })

    if (!bundle) {
      return {
        success: false,
        error: 'Algorithmus-Bundle nicht gefunden'
      }
    }

    return {
      success: true,
      data: bundle
    }
  } catch (error) {
    console.error('Error fetching AlgorithmBundle:', error)

    return {
      success: false,
      error: 'Fehler beim Laden des Algorithmus-Bundles'
    }
  }
}

export async function getActiveAlgorithmBundle(factoryId: string) {
  try {
    await ensureDatabaseInitialized()

    const bundle = await prisma.algorithmBundle.findFirst({
      where: {
        factoryId: factoryId,
        isActive: true
      },
      include: {
        factory: true
      }
    })

    return {
      success: true,
      data: bundle || null
    }
  } catch (error) {
    console.error('Error fetching active AlgorithmBundle:', error)

    return {
      success: false,
      error: 'Fehler beim Laden des aktiven Algorithmus-Bundles',
      data: null
    }
  }
}

export async function setActiveAlgorithmBundle(bundleId: string, factoryId: string) {
  try {
    await ensureDatabaseInitialized()

    // Deactivate all bundles for this factory
    await prisma.algorithmBundle.updateMany({
      where: {
        factoryId: factoryId,
        isActive: true
      },
      data: {
        isActive: false
      }
    })

    // Activate the selected bundle
    const bundle = await prisma.algorithmBundle.update({
      where: { id: bundleId },
      data: {
        isActive: true
      },
      include: {
        factory: true
      }
    })

    // Link QueueConfig to this bundle (critical for simulation to use the correct scripts)
    await prisma.queueConfig.upsert({
      where: { factoryId },
      create: {
        factoryId,
        algorithmBundleId: bundleId,
        preAcceptanceReleaseMinutes: 0,
        preInspectionReleaseMinutes: 0,
        postInspectionReleaseMinutes: 0
      },
      update: {
        algorithmBundleId: bundleId
      }
    })

    revalidatePath('/simulation/algorithms')
    revalidatePath('/factory-configurator')

    return {
      success: true,
      data: bundle,
      message: 'Aktives Algorithmus-Bundle erfolgreich geändert'
    }
  } catch (error) {
    console.error('Error setting active AlgorithmBundle:', error)

    return {
      success: false,
      error: 'Fehler beim Aktivieren des Algorithmus-Bundles'
    }
  }
}

export async function cloneAlgorithmBundle(id: string, newName: string) {
  try {
    await ensureDatabaseInitialized()

    const original = await prisma.algorithmBundle.findUnique({
      where: { id }
    })

    if (!original) {
      return {
        success: false,
        error: 'Original-Bundle nicht gefunden'
      }
    }

    const cloned = await prisma.algorithmBundle.create({
      data: {
        name: newName,
        description: original.description,
        author: original.author,
        factoryId: original.factoryId,
        papScriptPath: original.papScriptPath,
        papDescription: original.papDescription,
        pipScriptPath: original.pipScriptPath,
        pipDescription: original.pipDescription,
        pipoScriptPath: original.pipoScriptPath,
        pipoDescription: original.pipoDescription,
        isActive: false // Never clone as active
      },
      include: {
        factory: true
      }
    })

    revalidatePath('/simulation/algorithms')

    return {
      success: true,
      data: cloned,
      message: 'Algorithmus-Bundle erfolgreich kopiert'
    }
  } catch (error) {
    console.error('Error cloning AlgorithmBundle:', error)

    return {
      success: false,
      error: 'Fehler beim Kopieren des Algorithmus-Bundles'
    }
  }
}
