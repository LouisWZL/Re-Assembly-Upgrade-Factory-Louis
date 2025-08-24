import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const factoryId = searchParams.get('factoryId')
    
    const baugruppen = await prisma.baugruppe.findMany({
      where: factoryId ? { factoryId } : undefined,
      include: {
        baugruppentyp: true,
        prozesse: true,
        factory: true
      },
      orderBy: {
        bezeichnung: 'asc'
      }
    })
    
    return NextResponse.json(baugruppen)
  } catch (error) {
    console.error('Error fetching baugruppen:', error)
    return NextResponse.json(
      { error: 'Failed to fetch baugruppen' },
      { status: 500 }
    )
  }
}