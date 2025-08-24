'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

interface DummyJSONUser {
  id: number
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: {
    address: string
    city: string
    state: string
    postalCode: string
    country: string
  }
}

interface DummyJSONResponse {
  users: DummyJSONUser[]
  total: number
  skip: number
  limit: number
}

/**
 * Fetch customers from DummyJSON API
 */
export async function fetchCustomersFromDummyJSON(limit: number = 208): Promise<DummyJSONUser[]> {
  try {
    const response = await fetch(`https://dummyjson.com/users?limit=${limit}`)
    if (!response.ok) {
      throw new Error('Failed to fetch customers from DummyJSON')
    }
    
    const data: DummyJSONResponse = await response.json()
    return data.users
  } catch (error) {
    console.error('Error fetching customers from DummyJSON:', error)
    return []
  }
}

/**
 * Create or get a customer by DummyJSON ID
 */
export async function createOrGetKunde(dummyUser: DummyJSONUser) {
  try {
    // Try to find existing customer by email (if available) or by name
    let kunde = null
    
    if (dummyUser.email) {
      kunde = await prisma.kunde.findUnique({
        where: { email: dummyUser.email }
      })
    }
    
    if (!kunde) {
      // Search by name combination
      kunde = await prisma.kunde.findFirst({
        where: {
          vorname: dummyUser.firstName,
          nachname: dummyUser.lastName
        }
      })
    }

    // Create new customer if not found
    if (!kunde) {
      kunde = await prisma.kunde.create({
        data: {
          vorname: dummyUser.firstName,
          nachname: dummyUser.lastName,
          email: dummyUser.email || null,
          telefon: dummyUser.phone || null,
          adresse: dummyUser.address 
            ? `${dummyUser.address.address}, ${dummyUser.address.postalCode} ${dummyUser.address.city}, ${dummyUser.address.country}`
            : null
        }
      })
    }

    return { success: true, data: kunde }
  } catch (error) {
    console.error('Error creating/getting customer:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Unique constraint violation - try to get existing
        const existingKunde = await prisma.kunde.findUnique({
          where: { email: dummyUser.email }
        })
        if (existingKunde) {
          return { success: true, data: existingKunde }
        }
      }
    }
    return { success: false, error: 'Fehler beim Erstellen/Abrufen des Kunden' }
  }
}

/**
 * Get all customers
 */
export async function getKunden() {
  try {
    const kunden = await prisma.kunde.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        auftraege: true
      }
    })
    
    return { success: true, data: kunden }
  } catch (error) {
    console.error('Error fetching customers:', error)
    return { success: false, error: 'Fehler beim Abrufen der Kunden' }
  }
}

/**
 * Get customers with order count
 */
export async function getKundenWithOrderCount() {
  try {
    const kunden = await prisma.kunde.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { auftraege: true }
        }
      }
    })
    
    return { success: true, data: kunden }
  } catch (error) {
    console.error('Error fetching customers with order count:', error)
    return { success: false, error: 'Fehler beim Abrufen der Kunden' }
  }
}

/**
 * Initialize customers from DummyJSON if needed
 */
export async function initializeCustomers() {
  try {
    // Check if we already have customers
    const existingCount = await prisma.kunde.count()
    
    if (existingCount >= 200) {
      return { 
        success: true, 
        message: `Bereits ${existingCount} Kunden vorhanden`,
        count: existingCount 
      }
    }

    // Fetch customers from DummyJSON
    const dummyUsers = await fetchCustomersFromDummyJSON()
    
    if (dummyUsers.length === 0) {
      return { success: false, error: 'Keine Kunden von DummyJSON erhalten' }
    }

    // Create customers
    let created = 0
    let skipped = 0
    
    for (const dummyUser of dummyUsers) {
      const result = await createOrGetKunde(dummyUser)
      if (result.success) {
        created++
      } else {
        skipped++
      }
    }

    revalidatePath('/')
    
    return {
      success: true,
      message: `${created} Kunden erstellt, ${skipped} übersprungen`,
      created,
      skipped,
      total: created + skipped
    }
  } catch (error) {
    console.error('Error initializing customers:', error)
    return { success: false, error: 'Fehler beim Initialisieren der Kunden' }
  }
}

/**
 * Get a random customer for order creation
 * Prefers customers with fewer orders
 */
export async function getRandomKunde() {
  try {
    // Get all customers with order count
    const kundenWithCount = await prisma.kunde.findMany({
      include: {
        _count: {
          select: { auftraege: true }
        }
      }
    })

    if (kundenWithCount.length === 0) {
      return { success: false, error: 'Keine Kunden vorhanden' }
    }

    // Sort by order count (ascending) to prefer customers with fewer orders
    kundenWithCount.sort((a, b) => a._count.auftraege - b._count.auftraege)

    // Get customers with minimum order count
    const minOrderCount = kundenWithCount[0]._count.auftraege
    const customersWithMinOrders = kundenWithCount.filter(
      k => k._count.auftraege === minOrderCount
    )

    // Select random from customers with minimum orders
    const randomIndex = Math.floor(Math.random() * customersWithMinOrders.length)
    const selectedKunde = customersWithMinOrders[randomIndex]

    return { success: true, data: selectedKunde }
  } catch (error) {
    console.error('Error getting random customer:', error)
    return { success: false, error: 'Fehler beim Abrufen eines zufälligen Kunden' }
  }
}