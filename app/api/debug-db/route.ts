import { NextResponse } from 'next/server'
import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'

export async function GET() {
  const debug = {
    environment: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    databaseUrl: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
    timestamp: new Date().toISOString()
  }

  try {
    // Test basic connection
    await prisma.$connect()
    debug.connection = 'SUCCESS'

    // Test database initialization
    const initResult = await ensureDatabaseInitialized()
    debug.initialization = initResult ? 'SUCCESS' : 'FAILED'

    // Count records
    const factoryCount = await prisma.reassemblyFactory.count()
    const customerCount = await prisma.kunde.count()
    const orderCount = await prisma.auftrag.count()

    debug.counts = {
      factories: factoryCount,
      customers: customerCount,
      orders: orderCount
    }

    // Test factory query
    const factories = await prisma.reassemblyFactory.findMany({
      select: { id: true, name: true }
    })
    debug.factoryNames = factories.map(f => f.name)

  } catch (error) {
    debug.error = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }
  } finally {
    await prisma.$disconnect()
  }

  return NextResponse.json(debug, { 
    headers: { 'Cache-Control': 'no-store' } 
  })
}