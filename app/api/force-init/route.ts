import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db-init'
import { seedDatabase } from '@/prisma/seed-functions'

export async function POST() {
  try {
    console.log('🚀 Force database initialization requested')
    
    // Test connection
    await prisma.$connect()
    console.log('✅ Database connected')
    
    // Clear existing data
    console.log('🗑️ Clearing existing data...')
    try {
      await prisma.liefertermin.deleteMany()
      await prisma.baugruppeInstance.deleteMany()
      await prisma.auftrag.deleteMany()
      await prisma.produktvariante.deleteMany()
      await prisma.produkt.deleteMany()
      await prisma.baugruppe.deleteMany()
      await prisma.baugruppentyp.deleteMany()
      await prisma.reassemblyFactory.deleteMany()
      await prisma.prozess.deleteMany()
      await prisma.kunde.deleteMany()
      console.log('✅ Existing data cleared')
    } catch (error) {
      console.log('⚠️ Some tables might not exist, continuing...')
    }
    
    // Run seed
    console.log('🌱 Running seed...')
    await seedDatabase()
    
    // Verify results
    const factoryCount = await prisma.reassemblyFactory.count()
    const customerCount = await prisma.kunde.count()
    const orderCount = await prisma.auftrag.count()
    const produktCount = await prisma.produkt.count()
    const baugruppeCount = await prisma.baugruppe.count()
    
    const factories = await prisma.reassemblyFactory.findMany({
      select: { id: true, name: true }
    })
    
    return NextResponse.json({
      success: true,
      message: 'Database force initialized successfully',
      data: {
        factories: factoryCount,
        customers: customerCount,
        orders: orderCount,
        products: produktCount,
        components: baugruppeCount,
        factoryList: factories,
        environment: process.env.NODE_ENV,
        vercel: !!process.env.VERCEL
      }
    })
  } catch (error) {
    console.error('Force initialization error:', error)
    return NextResponse.json({
      success: false,
      message: 'Force initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST method to force database initialization',
    warning: 'This will clear all existing data and re-seed the database'
  })
}