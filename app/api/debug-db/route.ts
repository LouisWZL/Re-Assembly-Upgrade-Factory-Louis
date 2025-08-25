import { NextResponse } from 'next/server'
import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'

export async function GET() {
  const debug: any = {
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
    const baugruppentypenCount = await prisma.baugruppentyp.count()
    const baugruppenCount = await prisma.baugruppe.count()
    const produkteCount = await prisma.produkt.count()
    const variantenCount = await prisma.produktvariante.count()

    debug.counts = {
      factories: factoryCount,
      customers: customerCount,
      orders: orderCount,
      baugruppentypen: baugruppentypenCount,
      baugruppen: baugruppenCount,
      produkte: produkteCount,
      varianten: variantenCount
    }

    // Test factory query with relationships
    const factories = await prisma.reassemblyFactory.findMany({
      select: { 
        id: true, 
        name: true,
        _count: {
          select: {
            produkte: true,
            baugruppentypen: true,
            baugruppen: true
          }
        }
      }
    })
    debug.factoryDetails = factories.map(f => ({
      name: f.name,
      products: f._count.produkte,
      baugruppentypen: f._count.baugruppentypen,
      baugruppen: f._count.baugruppen
    }))
    
    // Get product details
    const products = await prisma.produkt.findMany({
      include: {
        factory: { select: { name: true } },
        baugruppentypen: { select: { bezeichnung: true } },
        _count: { select: { varianten: true } }
      }
    })
    debug.productDetails = products.map(p => ({
      name: p.bezeichnung,
      factory: p.factory?.name || 'NO FACTORY',
      baugruppentypen: p.baugruppentypen.map(b => b.bezeichnung),
      variantenCount: p._count.varianten
    }))

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