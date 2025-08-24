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
    console.log('🔧 Starting database initialization...')
    
    // Test database connection with timeout
    const connectionTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout')), 10000)
    )
    
    await Promise.race([prisma.$connect(), connectionTimeout])
    console.log('✅ Database connected')
    
    // Check if database schema exists by trying to count factories
    let factoryCount = 0
    try {
      factoryCount = await prisma.reassemblyFactory.count()
      console.log(`📊 Found ${factoryCount} factories in database`)
    } catch (schemaError) {
      console.log('⚠️ Database schema may not exist, attempting to push schema...')
      
      // In production, the database should already be set up by build process
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Database schema missing in production:', schemaError)
        throw new Error('Database schema not found in production environment')
      }
      throw schemaError
    }
    
    // Seed database if empty (production only)
    if (process.env.NODE_ENV === 'production' && factoryCount === 0) {
      console.log('🌱 Database is empty, running seed...')
      
      try {
        // Import and run seed function
        const { seedDatabase } = await import('../prisma/seed-functions')
        await seedDatabase()
        
        // Verify seeding worked
        const newFactoryCount = await prisma.reassemblyFactory.count()
        console.log(`✅ Database seeded successfully! Now have ${newFactoryCount} factories`)
      } catch (seedError) {
        console.error('❌ Seeding failed:', seedError)
        throw seedError
      }
    }
    
    return true
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Stack trace:', error.stack)
    }
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