import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST() {
  try {
    console.log('🔄 Resetting database with complete schema and data...')
    
    // Set database URL for Vercel
    const dbUrl = process.env.DATABASE_URL || 'file:/tmp/production.db'
    
    // Run these commands in order - EXACTLY like your local setup
    const commands = [
      // 1. Generate Prisma Client
      {
        cmd: 'npx prisma generate',
        name: 'Generate Prisma Client'
      },
      // 2. Create database schema - FORCE IT
      {
        cmd: 'npx prisma db push --force-reset --accept-data-loss',
        name: 'Create Schema (Force Reset)'
      },
      // 3. Run the SAME seed that works locally
      {
        cmd: 'npx prisma db seed',
        name: 'Seed Database (same as local)'
      }
    ]
    
    const results = []
    
    for (const { cmd, name } of commands) {
      try {
        console.log(`Running: ${name}`)
        const output = execSync(cmd, {
          env: {
            ...process.env,
            DATABASE_URL: dbUrl
          },
          encoding: 'utf8',
          timeout: 60000 // 60 seconds timeout
        })
        results.push({ 
          step: name, 
          success: true, 
          output: output?.substring(0, 500) // First 500 chars
        })
        console.log(`✅ ${name} completed`)
      } catch (error: any) {
        const errorMsg = error.stdout || error.stderr || error.message
        results.push({ 
          step: name, 
          success: false, 
          error: errorMsg?.substring(0, 500)
        })
        console.error(`❌ ${name} failed:`, errorMsg)
        // Continue even if one step fails
      }
    }
    
    // Test if it worked
    let verification = null
    try {
      const { PrismaClient } = require('@prisma/client')
      const prisma = new PrismaClient({
        datasources: {
          db: { url: dbUrl }
        }
      })
      
      await prisma.$connect()
      
      const counts = {
        factories: await prisma.reassemblyFactory.count(),
        products: await prisma.produkt.count(),
        variants: await prisma.produktvariante.count(),
        baugruppentypen: await prisma.baugruppentyp.count(),
        baugruppen: await prisma.baugruppe.count(),
        customers: await prisma.kunde.count(),
        orders: await prisma.auftrag.count()
      }
      
      // Get factory names to verify
      const factories = await prisma.reassemblyFactory.findMany({
        select: { name: true }
      })
      
      await prisma.$disconnect()
      
      verification = {
        success: true,
        counts,
        factoryNames: factories.map(f => f.name)
      }
    } catch (error: any) {
      verification = {
        success: false,
        error: error.message
      }
    }
    
    const success = results.every(r => r.success) && verification?.success
    
    return NextResponse.json({
      success,
      message: success 
        ? '✅ Database reset successfully! Same as your local setup.' 
        : '⚠️ Some steps failed, but database might still work.',
      steps: results,
      verification,
      databaseUrl: dbUrl
    })
    
  } catch (error) {
    console.error('❌ Complete failure:', error)
    return NextResponse.json({
      success: false,
      message: 'Database reset failed completely',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}