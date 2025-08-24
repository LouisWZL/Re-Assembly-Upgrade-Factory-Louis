import { NextResponse } from 'next/server'
import { connectWithRetry, prisma } from '@/lib/db-config'

export async function POST() {
  try {
    console.log('🚀 Manual database initialization requested')
    const success = await connectWithRetry(3)
    
    if (success) {
      // Double-check we have data
      const factoryCount = await prisma.reassemblyFactory.count()
      const customerCount = await prisma.kunde.count()
      
      return NextResponse.json({
        success: true,
        message: 'Database initialized successfully',
        data: {
          factories: factoryCount,
          customers: customerCount,
          environment: process.env.NODE_ENV,
          vercel: !!process.env.VERCEL
        }
      })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Database initialization failed'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Database initialization error:', error)
    return NextResponse.json({
      success: false,
      message: 'Database initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  // Also provide a GET endpoint that shows current status
  try {
    const factoryCount = await prisma.reassemblyFactory.count()
    const customerCount = await prisma.kunde.count()
    const orderCount = await prisma.auftrag.count()
    
    return NextResponse.json({
      message: 'Database status check',
      status: 'connected',
      data: {
        factories: factoryCount,
        customers: customerCount,
        orders: orderCount,
        environment: process.env.NODE_ENV,
        vercel: !!process.env.VERCEL,
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not configured'
      }
    })
  } catch (error) {
    return NextResponse.json({
      message: 'Database connection failed',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}