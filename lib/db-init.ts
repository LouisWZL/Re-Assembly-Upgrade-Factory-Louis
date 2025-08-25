import { PrismaClient } from '@prisma/client'
import { seedDatabase } from '../prisma/seed-functions'

// Create a function to get database URL with proper fallback
function getDatabaseUrl(): string {
  // In production/Vercel environment
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return process.env.DATABASE_URL || 
           process.env.TURSO_DATABASE_URL || 
           'file:/tmp/production.db'
  }
  
  // In development
  return process.env.DATABASE_URL || 'file:./prisma/dev.db'
}

// Create a function to get or create prisma instance
function getPrismaInstance() {
  const databaseUrl = getDatabaseUrl()
  
  console.log('Database configuration:')
  console.log('- NODE_ENV:', process.env.NODE_ENV)
  console.log('- VERCEL:', !!process.env.VERCEL)
  console.log('- DATABASE_URL set:', !!process.env.DATABASE_URL)
  console.log('- TURSO_DATABASE_URL set:', !!process.env.TURSO_DATABASE_URL)
  console.log('- Using URL:', databaseUrl)
  
  // In production on Vercel, always create a new instance
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    return new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    })
  }
  
  // In development, use singleton pattern
  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
  }
  
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    })
  }
  
  return globalForPrisma.prisma
}

export const prisma = getPrismaInstance()

// Track initialization status
let isInitialized = false
let initializationPromise: Promise<boolean> | null = null

export async function ensureDatabaseInitialized(): Promise<boolean> {
  // If already initialized, return immediately
  if (isInitialized) {
    return true
  }
  
  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise
  }
  
  // Start initialization
  initializationPromise = performInitialization()
  const result = await initializationPromise
  
  if (result) {
    isInitialized = true
  }
  
  return result
}

async function performInitialization(): Promise<boolean> {
  try {
    console.log('🔧 Starting database initialization...')
    console.log('Environment:', process.env.NODE_ENV)
    console.log('Is Vercel:', !!process.env.VERCEL)
    console.log('Database URL configured:', !!process.env.DATABASE_URL)
    
    // Test connection
    await prisma.$connect()
    console.log('✅ Database connected')
    
    // Check if tables exist and have data
    let needsSeeding = false
    
    try {
      const factoryCount = await prisma.reassemblyFactory.count()
      console.log(`📊 Found ${factoryCount} factories in database`)
      
      if (factoryCount === 0) {
        needsSeeding = true
        console.log('📝 Database is empty, needs seeding')
      }
    } catch (error) {
      console.error('❌ Error checking database:', error)
      
      // In production, if tables don't exist, we have a problem
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Database schema missing in production')
        
        // In production, assume schema is already pushed during build
        console.log('⚠️ Database schema might be missing in production')
        console.log('📝 Assuming schema exists and trying to seed...')
        needsSeeding = true
      } else {
        throw error
      }
    }
    
    // Seed if needed
    if (needsSeeding) {
      console.log('🌱 Starting database seeding...')
      
      try {
        await seedDatabase()
        
        // Verify seeding worked
        const newFactoryCount = await prisma.reassemblyFactory.count()
        const customerCount = await prisma.kunde.count()
        const orderCount = await prisma.auftrag.count()
        
        console.log(`✅ Database seeded successfully!`)
        console.log(`   - Factories: ${newFactoryCount}`)
        console.log(`   - Customers: ${customerCount}`)
        console.log(`   - Orders: ${orderCount}`)
        
        if (newFactoryCount === 0) {
          throw new Error('Seeding completed but no factories were created')
        }
      } catch (seedError) {
        console.error('❌ Seeding failed:', seedError)
        
        // In production, try a simpler seed
        if (process.env.NODE_ENV === 'production') {
          console.log('🔄 Attempting minimal seed for production...')
          await minimalSeed()
        } else {
          throw seedError
        }
      }
    }
    
    return true
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Stack trace:', error.stack)
    }
    
    // Don't throw in production - return false instead
    if (process.env.NODE_ENV === 'production') {
      return false
    }
    
    throw error
  }
}

// Minimal seed function for production fallback
async function minimalSeed() {
  try {
    console.log('🌱 Running minimal seed...')
    
    // Create a minimal factory
    const factory = await prisma.reassemblyFactory.create({
      data: {
        name: 'Default Factory',
        kapazität: 50,
        targetBatchAverage: 65
      }
    })
    
    console.log('✅ Minimal seed completed with factory:', factory.name)
  } catch (error) {
    console.error('❌ Minimal seed failed:', error)
    throw error
  }
}

// Export connection retry function
export async function connectWithRetry(maxRetries = 3): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await ensureDatabaseInitialized()
      if (result) {
        return true
      }
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error)
      if (i === maxRetries - 1) {
        return false
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
  return false
}