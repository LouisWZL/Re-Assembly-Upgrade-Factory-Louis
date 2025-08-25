import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST() {
  try {
    console.log('🔧 Forcing database schema creation...')
    
    const dbUrl = process.env.DATABASE_URL || 'file:/tmp/production.db'
    console.log('Database URL:', dbUrl)
    
    // Force schema push with all possible flags
    const commands = [
      'npx prisma generate',
      'npx prisma db push --force-reset --accept-data-loss --skip-generate',
      'npx prisma db push --accept-data-loss --skip-generate'
    ]
    
    const results: any[] = []
    
    for (const cmd of commands) {
      try {
        console.log(`Running: ${cmd}`)
        execSync(cmd, {
          stdio: 'pipe',
          env: {
            ...process.env,
            DATABASE_URL: dbUrl
          },
          timeout: 30000
        })
        results.push({ command: cmd, status: 'success' })
        console.log(`✅ ${cmd} completed`)
      } catch (error: any) {
        const errorMsg = error.stdout?.toString() || error.stderr?.toString() || error.message
        results.push({ command: cmd, status: 'failed', error: errorMsg })
        console.error(`❌ ${cmd} failed:`, errorMsg)
      }
    }
    
    // Test if schema was created
    try {
      const { PrismaClient } = require('@prisma/client')
      const testPrisma = new PrismaClient({
        datasources: {
          db: {
            url: dbUrl
          }
        }
      })
      
      await testPrisma.$connect()
      const count = await testPrisma.reassemblyFactory.count()
      await testPrisma.$disconnect()
      
      return NextResponse.json({
        success: true,
        message: 'Schema created successfully',
        results,
        factoryCount: count
      })
    } catch (testError: any) {
      return NextResponse.json({
        success: false,
        message: 'Schema creation may have failed',
        results,
        testError: testError.message
      })
    }
    
  } catch (error) {
    console.error('❌ Force schema failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to force schema',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}