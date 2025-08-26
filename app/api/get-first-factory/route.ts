import { NextResponse } from 'next/server'
import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('🏭 GetFirstFactory: Starting request...')
    
    // Ensure database is initialized
    await ensureDatabaseInitialized()
    
    // Get the first factory
    const factory = await prisma.reassemblyFactory.findFirst({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        id: true,
        name: true,
        kapazität: true
      }
    })
    
    console.log('🏭 GetFirstFactory: Found factory:', factory)
    
    if (!factory) {
      console.log('❌ GetFirstFactory: No factory found')
      return NextResponse.json({
        error: 'No factory found',
        needsInit: true
      }, { status: 404 })
    }
    
    console.log('✅ GetFirstFactory: Returning factory:', factory.id)
    return NextResponse.json({
      factory,
      redirectUrl: `/factory-configurator/${factory.id}`
    })
    
  } catch (error) {
    console.error('❌ GetFirstFactory: Error:', error)
    return NextResponse.json({
      error: 'Failed to get factory',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}