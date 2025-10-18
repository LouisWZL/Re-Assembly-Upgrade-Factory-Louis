import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get database URL from environment
    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl || (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))) {
      throw new Error('DATABASE_URL is not configured for PostgreSQL. Please set the Supabase connection string in the environment.')
    }
    const nodeEnv = process.env.NODE_ENV
    const isVercel = !!process.env.VERCEL
    
    // Test basic connection
    await prisma.$connect()
    
    // Try to query data
    let factoryCount = 0
    let customerCount = 0
    let orderCount = 0
    let produktCount = 0
    let variantenCount = 0
    let baugruppentypenCount = 0
    let baugruppenCount = 0
    
    let hasSchema = false
    let error = null
    
    try {
      factoryCount = await prisma.reassemblyFactory.count()
      customerCount = await prisma.kunde.count()
      orderCount = await prisma.auftrag.count()
      produktCount = await prisma.produkt.count()
      variantenCount = await prisma.produktvariante.count()
      baugruppentypenCount = await prisma.baugruppentyp.count()
      baugruppenCount = await prisma.baugruppe.count()
      hasSchema = true
    } catch (err: any) {
      error = err.message
      hasSchema = false
    }
    
    // Get detailed factory info if available
    let factories: any[] = []
    if (hasSchema) {
      try {
        factories = await prisma.reassemblyFactory.findMany({
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                produkte: true,
                baugruppentypen: true,
                baugruppen: true,
                auftraege: true
              }
            }
          }
        })
      } catch (err) {
        // Ignore
      }
    }
    
    // Get detailed product info if available
    let products: any[] = []
    if (hasSchema) {
      try {
        products = await prisma.produkt.findMany({
          select: {
            id: true,
            bezeichnung: true,
            factoryId: true,
            _count: {
              select: {
                varianten: true,
                baugruppentypen: true
              }
            }
          }
        })
      } catch (err) {
        // Ignore
      }
    }
    
    return NextResponse.json({
      database: {
        url: dbUrl,
        provider: dbUrl.split(':')[0]
      },
      environment: {
        NODE_ENV: nodeEnv,
        VERCEL: isVercel,
        isProduction: nodeEnv === 'production',
        isVercel: isVercel
      },
      schema: {
        exists: hasSchema,
        error: error
      },
      data: {
        factories: factoryCount,
        customers: customerCount,
        orders: orderCount,
        products: produktCount,
        variants: variantenCount,
        baugruppentypen: baugruppentypenCount,
        baugruppen: baugruppenCount
      },
      factoryDetails: factories.map(f => ({
        id: f.id,
        name: f.name,
        products: f._count.produkte,
        baugruppentypen: f._count.baugruppentypen,
        baugruppen: f._count.baugruppen,
        orders: f._count.auftraege
      })),
      productDetails: products.map(p => ({
        id: p.id,
        name: p.bezeichnung,
        factoryId: p.factoryId,
        variants: p._count.varianten,
        baugruppentypen: p._count.baugruppentypen
      }))
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to test database',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
