import { PrismaClient } from '@prisma/client'
import { seedDatabase } from '../prisma/seed-functions'

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Please configure your Supabase/Postgres connection string before starting the app.'
    )
  }

  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error(
      `DATABASE_URL must start with "postgresql://" or "postgres://". Received: ${url.substring(0, 20)}…`
    )
  }

  return url
}

function maskDatabaseUrl(url: string): string {
  if (!url.startsWith('postgres')) {
    return url
  }

  try {
    const parsed = new URL(url)
    if (parsed.password) {
      parsed.password = '***'
    }
    return parsed.toString()
  } catch {
    return url.replace(/:\/\/.*@/, '://***@')
  }
}

function createPrismaClient(databaseUrl: string) {
  console.log('Database configuration:')
  console.log('- NODE_ENV:', process.env.NODE_ENV)
  console.log('- VERCEL:', !!process.env.VERCEL)
  console.log('- DATABASE_URL set:', !!process.env.DATABASE_URL)
  console.log('- Using URL (masked):', maskDatabaseUrl(databaseUrl))

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

const prisma = createPrismaClient(getDatabaseUrl())

// Re-export Prisma client everywhere
export { prisma }

let isInitialized = false
let initializationPromise: Promise<boolean> | null = null

export async function connectWithRetry(retries = 3, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect()
      return true
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt} failed`, error)
      if (attempt === retries) {
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return false
}

export async function ensureDatabaseInitialized(): Promise<boolean> {
  if (isInitialized) {
    return true
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = initializeDatabase()
  const result = await initializationPromise

  if (result) {
    isInitialized = true
  }

  return result
}

async function initializeDatabase(): Promise<boolean> {
  try {
    console.log('🔧 Connecting to database...')
    await prisma.$connect()
    console.log('✅ Database connection established')

    let factoryCount: number
    try {
      factoryCount = await prisma.reassemblyFactory.count()
    } catch (error) {
      console.error('❌ Failed to query database tables. Have migrations been applied?')
      throw new Error(
        'Database schema missing. Run `npx prisma migrate deploy` (or `npx prisma db push`) against Supabase before starting the app.'
      )
    }

    if (factoryCount === 0) {
      console.log('🌱 Database appears empty – running seed script...')
      await seedDatabase()
      const newFactoryCount = await prisma.reassemblyFactory.count()
      console.log(`✅ Seed completed. Factories: ${newFactoryCount}`)
    }

    return true
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    if (process.env.NODE_ENV === 'production') {
      return false
    }
    throw error
  }
}
