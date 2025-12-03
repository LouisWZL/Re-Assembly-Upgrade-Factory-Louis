import { NextResponse } from 'next/server'
import { prisma, ensureDatabaseInitialized } from '@/lib/prisma'

export async function GET() {
  try {
    // Ensure database is initialized before querying
    await ensureDatabaseInitialized()
    
    const factories = await prisma.reassemblyFactory.findMany({
      include: {
        produkte: {
          include: {
            baugruppentypen: true,
            varianten: true
          }
        },
        auftraege: {
          include: {
            kunde: true,
            produktvariante: true
          }
        }
      }
    })

    return NextResponse.json(factories)
  } catch (error) {
    console.error('Detailed error fetching factories:', error)
    // Return more detailed error in development
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ 
        error: 'Failed to fetch factories',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, { status: 500 })
    }
    return NextResponse.json({ error: 'Failed to fetch factories' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Ensure database is initialized before creating
    await ensureDatabaseInitialized()

    const body = await request.json()
    const { name, kapazität } = body

    if (!name || !kapazität) {
      return NextResponse.json(
        { error: 'Name und Kapazität sind erforderlich' },
        { status: 400 }
      )
    }

    const factory = await prisma.reassemblyFactory.create({
      data: {
        name,
        kapazität: Number(kapazität),
      },
    })

    return NextResponse.json(factory)
  } catch (error) {
    console.error('Error creating factory:', error)
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Fabrik' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDatabaseInitialized()

    const body = await request.json()
    const {
      id,
      anzahlDemontagestationen,
      anzahlMontagestationen,
      demFlexSharePct,
      monFlexSharePct,
      setupTimeMinutes
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Factory ID is required' },
        { status: 400 }
      )
    }

    // Build update data object with only provided fields
    const updateData: any = {}
    if (anzahlDemontagestationen !== undefined) updateData.anzahlDemontagestationen = Number(anzahlDemontagestationen)
    if (anzahlMontagestationen !== undefined) updateData.anzahlMontagestationen = Number(anzahlMontagestationen)
    if (demFlexSharePct !== undefined) updateData.demFlexSharePct = Number(demFlexSharePct)
    if (monFlexSharePct !== undefined) updateData.monFlexSharePct = Number(monFlexSharePct)
    if (setupTimeMinutes !== undefined) updateData.setupTimeMinutes = Number(setupTimeMinutes)

    const factory = await prisma.reassemblyFactory.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(factory)
  } catch (error) {
    console.error('Error updating factory capacity:', error)
    return NextResponse.json(
      { error: 'Failed to update factory capacity' },
      { status: 500 }
    )
  }
}