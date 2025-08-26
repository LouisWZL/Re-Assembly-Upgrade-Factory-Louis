import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
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
    
    if (!factory) {
      return NextResponse.json({
        error: 'No factory found',
        needsInit: true
      }, { status: 404 })
    }
    
    return NextResponse.json({
      factory,
      redirectUrl: `/factory-configurator/${factory.id}`
    })
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get factory',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}