import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST() {
  try {
    console.log('🔨 Forcing database schema creation...')
    
    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not configured. Please run `npm run dev` to select a database.')
    }

    // Support both PostgreSQL and SQLite
    const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')
    const isSQLite = dbUrl.startsWith('file:')

    if (!isPostgres && !isSQLite) {
      throw new Error('DATABASE_URL must be either PostgreSQL or SQLite (file:)')
    }
    
    const results: any[] = []
    
    // Step 1: Generate Prisma Client
    try {
      console.log('Generating Prisma Client...')
      execSync('npx prisma generate', {
        stdio: 'pipe',
        env: { ...process.env }
      })
      results.push({ step: 'generate', status: 'success' })
    } catch (error: any) {
      results.push({ step: 'generate', status: 'failed', error: error.message })
    }
    
    // Step 2: Push schema with force reset
    try {
      console.log('Pushing schema with force reset...')
      execSync('npx prisma db push --force-reset --accept-data-loss', {
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: dbUrl
        }
      })
      results.push({ step: 'push_force', status: 'success' })
    } catch (error: any) {
      console.error('Force push failed, trying without reset...')
      
      // Try without force reset
      try {
        execSync('npx prisma db push --accept-data-loss', {
          stdio: 'pipe',
          env: {
            ...process.env,
            DATABASE_URL: dbUrl
          }
        })
        results.push({ step: 'push_normal', status: 'success' })
      } catch (error2: any) {
        results.push({ step: 'push', status: 'failed', error: error2.message })
      }
    }
    
    // Step 3: Test if tables were created
    try {
      const { PrismaClient } = require('@prisma/client')
      const prisma = new PrismaClient({
        datasources: {
          db: {
            url: dbUrl
          }
        }
      })
      
      await prisma.$connect()
      
      // Try to query each table
      const tableTests: any = {}
      
      try {
        await prisma.reassemblyFactory.count()
        tableTests.reassemblyFactory = true
      } catch {
        tableTests.reassemblyFactory = false
      }
      
      try {
        await prisma.produkt.count()
        tableTests.produkt = true
      } catch {
        tableTests.produkt = false
      }
      
      try {
        await prisma.baugruppentyp.count()
        tableTests.baugruppentyp = true
      } catch {
        tableTests.baugruppentyp = false
      }
      
      try {
        await prisma.baugruppe.count()
        tableTests.baugruppe = true
      } catch {
        tableTests.baugruppe = false
      }
      
      try {
        await prisma.produktvariante.count()
        tableTests.produktvariante = true
      } catch {
        tableTests.produktvariante = false
      }
      
      try {
        await prisma.kunde.count()
        tableTests.kunde = true
      } catch {
        tableTests.kunde = false
      }
      
      try {
        await prisma.auftrag.count()
        tableTests.auftrag = true
      } catch {
        tableTests.auftrag = false
      }
      
      await prisma.$disconnect()
      
      const allTablesExist = Object.values(tableTests).every(v => v === true)
      
      results.push({ 
        step: 'verify', 
        status: allTablesExist ? 'success' : 'partial',
        tables: tableTests
      })
      
      // Step 4: If tables exist, seed with minimal data
      if (allTablesExist) {
        console.log('Tables created! Seeding minimal data...')
        
        const seedPrisma = new PrismaClient({
          datasources: {
            db: {
              url: dbUrl
            }
          }
        })
        
        try {
          await seedPrisma.$connect()
          
          // Create minimal factory
          const factory = await seedPrisma.reassemblyFactory.create({
            data: {
              name: 'Stuttgart Porsche Reassembly Center',
              kapazität: 50,
              targetBatchAverage: 65
            }
          })
          
          // Create Baugruppentypen
          const bgtChassis = await seedPrisma.baugruppentyp.create({
            data: {
              bezeichnung: 'BGT-PS-Chassis',
              factoryId: factory.id
            }
          })
          
          const bgtKarosserie = await seedPrisma.baugruppentyp.create({
            data: {
              bezeichnung: 'BGT-PS-Karosserie',
              factoryId: factory.id
            }
          })
          
          // Create Product
          const product = await seedPrisma.produkt.create({
            data: {
              bezeichnung: 'Porsche 911',
              seriennummer: `P911-${Date.now()}`,
              factoryId: factory.id,
              baugruppentypen: {
                connect: [
                  { id: bgtChassis.id },
                  { id: bgtKarosserie.id }
                ]
              }
            }
          })
          
          // Create Variants
          await seedPrisma.produktvariante.create({
            data: {
              bezeichnung: 'Porsche 911 Basic',
              typ: 'basic',
              produktId: product.id,
              links: {}
            }
          })
          
          await seedPrisma.produktvariante.create({
            data: {
              bezeichnung: 'Porsche 911 Premium',
              typ: 'premium',
              produktId: product.id,
              links: {}
            }
          })
          
          // Create Customer
          await seedPrisma.kunde.create({
            data: {
              vorname: 'Max',
              nachname: 'Mustermann',
              email: `max${Date.now()}@example.com`
            }
          })
          
          await seedPrisma.$disconnect()
          
          results.push({ step: 'seed', status: 'success' })
        } catch (seedError: any) {
          results.push({ step: 'seed', status: 'failed', error: seedError.message })
        }
      }
      
      return NextResponse.json({
        success: allTablesExist,
        message: allTablesExist ? 'Schema created successfully!' : 'Schema partially created',
        results
      })
      
    } catch (testError: any) {
      results.push({ step: 'verify', status: 'failed', error: testError.message })
      
      return NextResponse.json({
        success: false,
        message: 'Schema creation uncertain',
        results,
        error: testError.message
      })
    }
    
  } catch (error) {
    console.error('❌ Force schema creation failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to force schema creation',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
