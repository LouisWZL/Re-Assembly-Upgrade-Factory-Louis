"use server"

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

export async function updateFactoryName(id: string, name: string) {
  try {
    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { name }
    })
    
    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    
    return {
      success: true,
      data: factory,
      message: 'Factory-Name erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory name:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren des Factory-Namens'
    }
  }
}

export async function updateFactoryCapacity(id: string, kapazität: number) {
  try {
    // Validate capacity
    if (kapazität < 1) {
      return {
        success: false,
        error: 'Die Kapazität muss mindestens 1 betragen'
      }
    }
    
    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { kapazität }
    })
    
    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    
    return {
      success: true,
      data: factory,
      message: 'Factory-Kapazität erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory capacity:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren der Factory-Kapazität'
    }
  }
}

export async function updateFactorySchichtmodell(id: string, schichtmodell: 'EINSCHICHT' | 'ZWEISCHICHT' | 'DREISCHICHT') {
  try {
    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { schichtmodell }
    })
    
    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    
    return {
      success: true,
      data: factory,
      message: 'Schichtmodell erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory schichtmodell:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren des Schichtmodells'
    }
  }
}

export async function updateFactoryMontagestationen(id: string, anzahlMontagestationen: number) {
  try {
    // Validate anzahlMontagestationen
    if (anzahlMontagestationen < 1 || anzahlMontagestationen > 100) {
      return {
        success: false,
        error: 'Die Anzahl der Montagestationen muss zwischen 1 und 100 liegen'
      }
    }
    
    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { anzahlMontagestationen }
    })
    
    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    
    return {
      success: true,
      data: factory,
      message: 'Anzahl der Montagestationen erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory montagestationen:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren der Montagestationen'
    }
  }
}

export async function updateFactoryTargetBatchAverage(id: string, targetBatchAverage: number) {
  try {
    // Validate targetBatchAverage
    if (targetBatchAverage < 10 || targetBatchAverage > 90) {
      return {
        success: false,
        error: 'Der durchschnittliche Zustand muss zwischen 10% und 90% liegen'
      }
    }
    
    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { targetBatchAverage }
    })
    
    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    
    return {
      success: true,
      data: factory,
      message: 'Durchschnittlicher Zustand erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory targetBatchAverage:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren des durchschnittlichen Zustands'
    }
  }
}

export async function updateFactoryPflichtUpgradeSchwelle(id: string, pflichtUpgradeSchwelle: number) {
  try {
    // Validate pflichtUpgradeSchwelle
    if (pflichtUpgradeSchwelle < 0 || pflichtUpgradeSchwelle > 100) {
      return {
        success: false,
        error: 'Die Pflicht-Upgrade Schwelle muss zwischen 0% und 100% liegen'
      }
    }
    
    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { pflichtUpgradeSchwelle }
    })
    
    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    revalidatePath('/')
    
    return {
      success: true,
      data: factory,
      message: 'Pflicht-Upgrade Schwelle erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory pflichtUpgradeSchwelle:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Aktualisieren der Pflicht-Upgrade Schwelle'
    }
  }
}

export async function deleteAllFactoryOrders(factoryId: string) {
  try {
    // Use a transaction to ensure all deletes happen together
    const result = await prisma.$transaction(async (tx) => {
      // First, delete all BaugruppeInstances for orders of this factory
      const baugruppeInstances = await tx.baugruppeInstance.deleteMany({
        where: {
          auftrag: {
            factoryId
          }
        }
      })
      
      // Then delete all Liefertermine for orders of this factory
      const liefertermine = await tx.liefertermin.deleteMany({
        where: {
          auftrag: {
            factoryId
          }
        }
      })
      
      // Finally, delete all orders for this factory
      const auftraege = await tx.auftrag.deleteMany({
        where: {
          factoryId
        }
      })
      
      return { baugruppeInstances, liefertermine, auftraege }
    })
    
    revalidatePath('/')
    revalidatePath(`/factory-configurator/${factoryId}`)
    
    return {
      success: true,
      message: `Erfolgreich gelöscht: ${result.auftraege.count} Aufträge, ${result.baugruppeInstances.count} Baugruppen-Instanzen, ${result.liefertermine.count} Liefertermine`,
      data: result
    }
  } catch (error) {
    console.error('Error deleting factory orders:', error)
    
    // Check for specific database errors
    if (error instanceof Error) {
      if (error.message.includes('readonly database')) {
        return {
          success: false,
          error: 'Die Datenbank ist momentan schreibgeschützt. Bitte versuchen Sie es in ein paar Sekunden erneut.'
        }
      }
    }
    
    return {
      success: false,
      error: 'Fehler beim Löschen der Aufträge'
    }
  }
}

export async function getFactory(id: string) {
  try {
    const factory = await prisma.reassemblyFactory.findUnique({
      where: { id },
      include: {
        produkte: {
          include: {
            baugruppentypen: true,
            varianten: true
          }
        },
        auftraege: {
          include: {
            kunde: true,
            produktvariante: true
          }
        }
      }
    })
    
    if (!factory) {
      return {
        success: false,
        error: 'Factory nicht gefunden'
      }
    }
    
    return {
      success: true,
      data: factory
    }
  } catch (error) {
    console.error('Error fetching factory:', error)
    
    return {
      success: false,
      error: 'Fehler beim Abrufen der Factory'
    }
  }
}

export async function updateFactoryDefaultDemontagezeit(id: string, defaultDemontagezeit: number) {
  try {
    // Validate defaultDemontagezeit
    if (defaultDemontagezeit < 0) {
      return {
        success: false,
        error: 'Die Standard-Demontagezeit muss mindestens 0 Minuten betragen'
      }
    }

    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { defaultDemontagezeit }
    })

    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    revalidatePath('/')

    return {
      success: true,
      data: factory,
      message: 'Standard-Demontagezeit erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory defaultDemontagezeit:', error)

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }

    return {
      success: false,
      error: 'Fehler beim Aktualisieren der Standard-Demontagezeit'
    }
  }
}

export async function updateFactoryDefaultMontagezeit(id: string, defaultMontagezeit: number) {
  try {
    // Validate defaultMontagezeit
    if (defaultMontagezeit < 0) {
      return {
        success: false,
        error: 'Die Standard-Montagezeit muss mindestens 0 Minuten betragen'
      }
    }

    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: { defaultMontagezeit }
    })

    revalidatePath('/factory-configurator')
    revalidatePath(`/factory-configurator/${id}`)
    revalidatePath('/api/factories')
    revalidatePath('/')

    return {
      success: true,
      data: factory,
      message: 'Standard-Montagezeit erfolgreich aktualisiert'
    }
  } catch (error) {
    console.error('Error updating factory defaultMontagezeit:', error)

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Factory nicht gefunden'
        }
      }
    }

    return {
      success: false,
      error: 'Fehler beim Aktualisieren der Standard-Montagezeit'
    }
  }
}