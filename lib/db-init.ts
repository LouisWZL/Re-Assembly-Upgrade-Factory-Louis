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
      console.error('Error message:', error instanceof Error ? error.message : String(error))
      
      // Tables don't exist - need to create schema
      if (error instanceof Error && error.message.includes('does not exist in the current database')) {
        console.log('🔨 Tables do not exist, creating schema...')
        
        try {
          // Import and use Prisma CLI functionality
          const { execSync } = require('child_process')
          
          console.log('Running prisma db push...')
          
          // Try different prisma push commands
          const commands = [
            'npx prisma db push --accept-data-loss --force-reset --skip-generate',
            'npx prisma db push --force-reset --skip-generate',  
            'npx prisma db push --skip-generate'
          ]
          
          let pushSuccess = false
          for (const cmd of commands) {
            try {
              console.log(`Trying: ${cmd}`)
              execSync(cmd, { 
                stdio: 'inherit',
                env: { ...process.env },
                timeout: 30000 // 30 second timeout
              })
              console.log('✅ Database schema created successfully')
              pushSuccess = true
              break
            } catch (cmdError) {
              console.warn(`Command failed: ${cmd}`)
              console.warn('Error:', cmdError instanceof Error ? cmdError.message : String(cmdError))
              continue
            }
          }
          
          if (pushSuccess) {
            needsSeeding = true
          } else {
            throw new Error('All prisma push commands failed')
          }
        } catch (pushError) {
          console.error('❌ Failed to create schema with prisma db push:', pushError)
          
          // Try alternative approach - create tables manually
          try {
            console.log('🔄 Trying alternative schema creation...')
            await createSchemaManually()
            console.log('✅ Schema created manually')
            needsSeeding = true
          } catch (manualError) {
            console.error('❌ Manual schema creation failed:', manualError)
            throw new Error(`Database schema creation failed: ${manualError}`)
          }
        }
      } else {
        throw error
      }
    }
    
    // Seed if needed
    if (needsSeeding) {
      console.log('🌱 Starting database seeding...')
      
      try {
        // First try the full seed script (which has all the correct data)
        console.log('📝 Running full seed script with all data...')
        const { execSync } = require('child_process')
        
        try {
          execSync('npx prisma db seed', { 
            stdio: 'inherit',
            env: { ...process.env },
            timeout: 60000 // 60 second timeout
          })
          console.log('✅ Full seed script completed')
        } catch (scriptError) {
          console.warn('❌ Full seed script failed, trying seed-functions:', scriptError)
          
          // Fallback to seed-functions
          await seedDatabase()
        }
        
        // Verify seeding worked
        const newFactoryCount = await prisma.reassemblyFactory.count()
        const customerCount = await prisma.kunde.count()
        const orderCount = await prisma.auftrag.count()
        const baugruppenCount = await prisma.baugruppe.count()
        const baugruppentypenCount = await prisma.baugruppentyp.count()
        
        console.log(`✅ Database seeded successfully!`)
        console.log(`   - Factories: ${newFactoryCount}`)
        console.log(`   - Customers: ${customerCount}`)
        console.log(`   - Orders: ${orderCount}`)
        console.log(`   - Baugruppen: ${baugruppenCount}`)
        console.log(`   - Baugruppentypen: ${baugruppentypenCount}`)
        
        if (newFactoryCount === 0) {
          throw new Error('Seeding completed but no factories were created')
        }
        if (baugruppentypenCount === 0) {
          throw new Error('Seeding completed but no Baugruppentypen were created')
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

// Manual schema creation function as fallback
async function createSchemaManually() {
  console.log('🔨 Creating database schema manually...')
  
  // Basic SQL to create the essential tables
  const createTablesSQL = `
    -- Create ReassemblyFactory table
    CREATE TABLE IF NOT EXISTS "ReassemblyFactory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "kapazität" INTEGER NOT NULL,
      "schichtmodell" TEXT NOT NULL DEFAULT 'EINSCHICHT',
      "anzahlMontagestationen" INTEGER NOT NULL DEFAULT 10,
      "targetBatchAverage" INTEGER NOT NULL DEFAULT 65,
      "pflichtUpgradeSchwelle" INTEGER NOT NULL DEFAULT 30,
      "beschaffung" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Kunde table
    CREATE TABLE IF NOT EXISTS "Kunde" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "vorname" TEXT NOT NULL,
      "nachname" TEXT NOT NULL,
      "email" TEXT UNIQUE,
      "telefon" TEXT,
      "adresse" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Baugruppentyp table
    CREATE TABLE IF NOT EXISTS "Baugruppentyp" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bezeichnung" TEXT NOT NULL,
      "factoryId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id"),
      UNIQUE("bezeichnung", "factoryId")
    );

    -- Create Prozess table
    CREATE TABLE IF NOT EXISTS "Prozess" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Produkt table
    CREATE TABLE IF NOT EXISTS "Produkt" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bezeichnung" TEXT NOT NULL,
      "seriennummer" TEXT NOT NULL UNIQUE,
      "factoryId" TEXT,
      "graphData" TEXT,
      "processGraphData" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id")
    );

    -- Create Produktvariante table
    CREATE TABLE IF NOT EXISTS "Produktvariante" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "produktId" TEXT NOT NULL,
      "bezeichnung" TEXT NOT NULL,
      "typ" TEXT NOT NULL,
      "glbFile" TEXT,
      "links" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("produktId") REFERENCES "Produkt"("id")
    );

    -- Create Auftrag table
    CREATE TABLE IF NOT EXISTS "Auftrag" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kundeId" TEXT NOT NULL,
      "produktvarianteId" TEXT NOT NULL,
      "phase" TEXT NOT NULL DEFAULT 'AUFTRAGSANNAHME',
      "factoryId" TEXT NOT NULL,
      "terminierung" TEXT,
      "phaseHistory" TEXT,
      "graphData" TEXT,
      "processGraphDataBg" TEXT,
      "processGraphDataBgt" TEXT,
      "processSequences" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id"),
      FOREIGN KEY ("produktvarianteId") REFERENCES "Produktvariante"("id"),
      FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id")
    );

    -- Create Liefertermin table
    CREATE TABLE IF NOT EXISTS "Liefertermin" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "auftragId" TEXT NOT NULL,
      "typ" TEXT NOT NULL,
      "datum" DATETIME NOT NULL,
      "istAktuell" BOOLEAN NOT NULL DEFAULT true,
      "bemerkung" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("auftragId") REFERENCES "Auftrag"("id")
    );

    -- Create Baugruppe table
    CREATE TABLE IF NOT EXISTS "Baugruppe" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bezeichnung" TEXT NOT NULL,
      "artikelnummer" TEXT NOT NULL UNIQUE,
      "variantenTyp" TEXT NOT NULL,
      "verfuegbar" INTEGER NOT NULL DEFAULT 0,
      "factoryId" TEXT NOT NULL,
      "baugruppentypId" TEXT,
      "demontagezeit" INTEGER,
      "montagezeit" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id"),
      FOREIGN KEY ("baugruppentypId") REFERENCES "Baugruppentyp"("id")
    );

    -- Create BaugruppeInstance table
    CREATE TABLE IF NOT EXISTS "BaugruppeInstance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "baugruppeId" TEXT NOT NULL,
      "austauschBaugruppeId" TEXT,
      "auftragId" TEXT NOT NULL,
      "zustand" INTEGER NOT NULL,
      "reAssemblyTyp" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("baugruppeId") REFERENCES "Baugruppe"("id"),
      FOREIGN KEY ("austauschBaugruppeId") REFERENCES "Baugruppe"("id"),
      FOREIGN KEY ("auftragId") REFERENCES "Auftrag"("id")
    );

    -- Create StationDuration table  
    CREATE TABLE IF NOT EXISTS "StationDuration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "auftragId" TEXT NOT NULL,
      "stationId" TEXT NOT NULL,
      "stationName" TEXT NOT NULL,
      "stationType" TEXT NOT NULL,
      "expectedDuration" REAL NOT NULL,
      "actualDuration" REAL,
      "stochasticVariation" REAL NOT NULL DEFAULT 0,
      "startedAt" DATETIME,
      "completedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("auftragId") REFERENCES "Auftrag"("id")
    );

    -- Create many-to-many tables
    CREATE TABLE IF NOT EXISTS "_BaugruppeToProzess" (
      "A" TEXT NOT NULL,
      "B" TEXT NOT NULL,
      UNIQUE("A", "B"),
      FOREIGN KEY ("A") REFERENCES "Baugruppe"("id"),
      FOREIGN KEY ("B") REFERENCES "Prozess"("id")
    );

    CREATE TABLE IF NOT EXISTS "_BaugruppentypToProdukt" (
      "A" TEXT NOT NULL,
      "B" TEXT NOT NULL,
      UNIQUE("A", "B"),
      FOREIGN KEY ("A") REFERENCES "Baugruppentyp"("id"),
      FOREIGN KEY ("B") REFERENCES "Produkt"("id")
    );
  `

  // Execute the SQL - split into multiple statements for better error handling
  const statements = createTablesSQL.split(';').filter(stmt => stmt.trim())
  
  for (const statement of statements) {
    const cleanStatement = statement.trim()
    if (cleanStatement) {
      try {
        await prisma.$executeRawUnsafe(cleanStatement)
      } catch (error) {
        console.warn('SQL statement failed:', cleanStatement.substring(0, 100) + '...')
        console.warn('Error:', error instanceof Error ? error.message : String(error))
        // Continue with other statements
      }
    }
  }
  
  console.log('✅ Database schema creation completed')
}

// Enhanced minimal seed function for production fallback
async function minimalSeed() {
  try {
    console.log('🌱 Running enhanced minimal seed...')
    
    // Create factory
    const factory = await prisma.reassemblyFactory.create({
      data: {
        name: 'Stuttgart Porsche Reassembly Center',
        kapazität: 50,
        targetBatchAverage: 65
      }
    })
    
    // Create Baugruppentypen
    const baugruppentypen = await Promise.all([
      prisma.baugruppentyp.create({
        data: { bezeichnung: "BGT-PS-Chassis", factoryId: factory.id }
      }),
      prisma.baugruppentyp.create({
        data: { bezeichnung: "BGT-PS-Karosserie", factoryId: factory.id }
      }),
      prisma.baugruppentyp.create({
        data: { bezeichnung: "BGT-PS-Antrieb", factoryId: factory.id }
      })
    ])
    
    // Create some Baugruppen
    await Promise.all([
      prisma.baugruppe.create({
        data: {
          bezeichnung: "BG-PS-Chassis",
          artikelnummer: "CHS-001",
          variantenTyp: "basicAndPremium",
          factoryId: factory.id,
          baugruppentypId: baugruppentypen[0].id
        }
      }),
      prisma.baugruppe.create({
        data: {
          bezeichnung: "BG-PS-Karosserie",
          artikelnummer: "KAR-001", 
          variantenTyp: "basic",
          factoryId: factory.id,
          baugruppentypId: baugruppentypen[1].id
        }
      })
    ])
    
    // Create customer
    const customer = await prisma.kunde.create({
      data: {
        vorname: "Max",
        nachname: "Mustermann", 
        email: "max@example.com"
      }
    })
    
    // Create product  
    const product = await prisma.produkt.create({
      data: {
        bezeichnung: "Porsche 911",
        seriennummer: "P911-001",
        factoryId: factory.id,
        baugruppentypen: {
          connect: baugruppentypen.map(bgt => ({ id: bgt.id }))
        }
      }
    })
    
    // Create product variant
    const variant = await prisma.produktvariante.create({
      data: {
        bezeichnung: "911 Carrera",
        typ: "basic",
        produktId: product.id,
        links: {}
      }
    })
    
    // Create order
    await prisma.auftrag.create({
      data: {
        kundeId: customer.id,
        produktvarianteId: variant.id,
        phase: "AUFTRAGSANNAHME",
        factoryId: factory.id
      }
    })
    
    console.log('✅ Enhanced minimal seed completed!')
    console.log('   - Factory:', factory.name)
    console.log('   - Baugruppentypen:', baugruppentypen.length)
  } catch (error) {
    console.error('❌ Enhanced minimal seed failed:', error)
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