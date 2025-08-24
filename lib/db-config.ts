import { PrismaClient } from '@prisma/client'

// Database configuration for different environments
export function getDatabaseConfig() {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    // Production on Vercel - use environment variable or fallback
    return {
      datasources: {
        db: {
          url: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:/tmp/production.db'
        }
      }
    }
  } else {
    // Development - use local SQLite
    return {
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./prisma/dev.db'
        }
      }
    }
  }
}

// Enhanced Prisma client with proper error handling
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(getDatabaseConfig())

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Database initialization function
export async function ensureDatabaseInitialized() {
  try {
    // Test database connection
    await prisma.$connect()
    
    // In production, ensure database is seeded if empty
    if (process.env.NODE_ENV === 'production') {
      const factoryCount = await prisma.reassemblyFactory.count()
      if (factoryCount === 0) {
        console.log('🌱 Database is empty, running seed...')
        
        // Import and run seed function
        const { seedDatabase } = await import('../prisma/seed-functions')
        await seedDatabase()
        
        console.log('✅ Database seeded successfully!')
      }
    }
    
    return true
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    return false
  }
}

// Graceful database connection with retries
export async function connectWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await ensureDatabaseInitialized()
      return true
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error)
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
  return false
}