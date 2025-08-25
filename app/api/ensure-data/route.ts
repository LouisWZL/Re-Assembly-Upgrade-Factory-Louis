import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db-init'

export async function POST() {
  try {
    console.log('🔧 Ensuring all required data exists...')
    
    // Check what we currently have
    const currentFactories = await prisma.reassemblyFactory.findMany()
    const currentBaugruppentypen = await prisma.baugruppentyp.findMany()
    const currentBaugruppen = await prisma.baugruppe.findMany()
    const currentKunden = await prisma.kunde.findMany()
    const currentProdukte = await prisma.produkt.findMany()
    const currentVarianten = await prisma.produktvariante.findMany()
    const currentAuftraege = await prisma.auftrag.findMany()

    console.log('Current data:')
    console.log('- Factories:', currentFactories.length)
    console.log('- Baugruppentypen:', currentBaugruppentypen.length)
    console.log('- Baugruppen:', currentBaugruppen.length)
    console.log('- Kunden:', currentKunden.length)
    console.log('- Produkte:', currentProdukte.length)
    console.log('- Varianten:', currentVarianten.length)
    console.log('- Aufträge:', currentAuftraege.length)

    let created = {
      factories: 0,
      baugruppentypen: 0,
      baugruppen: 0,
      kunden: 0,
      produkte: 0,
      varianten: 0,
      auftraege: 0
    }

    // Create factory if none exist
    let factory = currentFactories[0]
    if (!factory) {
      console.log('🏭 Creating factory...')
      factory = await prisma.reassemblyFactory.create({
        data: {
          name: 'Stuttgart Porsche Reassembly Center',
          kapazität: 50,
          targetBatchAverage: 65
        }
      })
      created.factories = 1
      console.log('✅ Factory created:', factory.name)
    }

    // Create Baugruppentypen if none exist
    let baugruppentypen = currentBaugruppentypen.filter(bgt => bgt.factoryId === factory.id)
    if (baugruppentypen.length === 0) {
      console.log('🔧 Creating Baugruppentypen...')
      const baugruppentypenData = [
        'BGT-PS-Chassis',
        'BGT-PS-Karosserie', 
        'BGT-PS-Fahrwerk',
        'BGT-PS-Antrieb',
        'BGT-PS-Interieur',
        'BGT-PS-Elektronik'
      ]
      
      baugruppentypen = []
      for (const bezeichnung of baugruppentypenData) {
        const bgt = await prisma.baugruppentyp.create({
          data: {
            bezeichnung,
            factoryId: factory.id
          }
        })
        baugruppentypen.push(bgt)
        created.baugruppentypen++
      }
      console.log('✅ Created', created.baugruppentypen, 'Baugruppentypen')
    }

    // Create Baugruppen if none exist
    let baugruppen = currentBaugruppen.filter(bg => bg.factoryId === factory.id)
    if (baugruppen.length === 0) {
      console.log('🔩 Creating Baugruppen...')
      const chassisBgt = baugruppentypen.find(bgt => bgt.bezeichnung === 'BGT-PS-Chassis')
      const karosserieBgt = baugruppentypen.find(bgt => bgt.bezeichnung === 'BGT-PS-Karosserie')
      
      if (chassisBgt) {
        await prisma.baugruppe.create({
          data: {
            bezeichnung: 'BG-PS-Chassis',
            artikelnummer: 'CHS-BP-001',
            variantenTyp: 'basicAndPremium',
            factoryId: factory.id,
            baugruppentypId: chassisBgt.id,
            demontagezeit: 72,
            montagezeit: 108
          }
        })
        created.baugruppen++
      }
      
      if (karosserieBgt) {
        await prisma.baugruppe.create({
          data: {
            bezeichnung: 'BG-PS-Karosserie-B1',
            artikelnummer: 'KAR-B1-001',
            variantenTyp: 'basic',
            factoryId: factory.id,
            baugruppentypId: karosserieBgt.id,
            demontagezeit: 48,
            montagezeit: 72
          }
        })
        created.baugruppen++
      }
      
      console.log('✅ Created', created.baugruppen, 'Baugruppen')
    }

    // Create customer if none exist
    let kunde = currentKunden[0]
    if (!kunde) {
      console.log('👤 Creating customer...')
      kunde = await prisma.kunde.create({
        data: {
          vorname: 'Max',
          nachname: 'Mustermann',
          email: 'max.mustermann@example.com',
          telefon: '+49 123 456789',
          adresse: 'Musterstraße 1, 12345 Musterstadt'
        }
      })
      created.kunden = 1
      console.log('✅ Customer created:', kunde.vorname, kunde.nachname)
    }

    // Create product if none exist
    let produkt = currentProdukte.find(p => p.factoryId === factory.id)
    if (!produkt) {
      console.log('🚗 Creating product...')
      produkt = await prisma.produkt.create({
        data: {
          bezeichnung: 'Porsche 911',
          seriennummer: 'P911-2024-001',
          factoryId: factory.id,
          baugruppentypen: {
            connect: baugruppentypen.map(bgt => ({ id: bgt.id }))
          }
        }
      })
      created.produkte = 1
      console.log('✅ Product created:', produkt.bezeichnung)
    }

    // Create product variant if none exist
    let variante = currentVarianten.find(v => v.produktId === produkt.id)
    if (!variante) {
      console.log('🏎️ Creating product variant...')
      variante = await prisma.produktvariante.create({
        data: {
          bezeichnung: '911 Carrera Basic',
          typ: 'basic',
          produktId: produkt.id,
          links: {}
        }
      })
      created.varianten = 1
      console.log('✅ Product variant created:', variante.bezeichnung)
    }

    // Create order if none exist
    let auftrag = currentAuftraege.find(a => a.factoryId === factory.id)
    if (!auftrag) {
      console.log('📋 Creating order...')
      auftrag = await prisma.auftrag.create({
        data: {
          kundeId: kunde.id,
          produktvarianteId: variante.id,
          phase: 'AUFTRAGSANNAHME',
          factoryId: factory.id
        }
      })
      created.auftraege = 1
      console.log('✅ Order created')
    }

    // Final verification
    const finalFactories = await prisma.reassemblyFactory.count()
    const finalBaugruppentypen = await prisma.baugruppentyp.count()
    const finalBaugruppen = await prisma.baugruppe.count()
    const finalKunden = await prisma.kunde.count()
    const finalProdukte = await prisma.produkt.count()
    const finalVarianten = await prisma.produktvariante.count()
    const finalAuftraege = await prisma.auftrag.count()

    return NextResponse.json({
      success: true,
      message: 'All required data ensured',
      created,
      finalCounts: {
        factories: finalFactories,
        baugruppentypen: finalBaugruppentypen,
        baugruppen: finalBaugruppen,
        kunden: finalKunden,
        produkte: finalProdukte,
        varianten: finalVarianten,
        auftraege: finalAuftraege
      }
    })
  } catch (error) {
    console.error('❌ Ensure data failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to ensure data',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Just show current counts
    const factories = await prisma.reassemblyFactory.count()
    const baugruppentypen = await prisma.baugruppentyp.count()
    const baugruppen = await prisma.baugruppe.count()
    const kunden = await prisma.kunde.count()
    const produkte = await prisma.produkt.count()
    const varianten = await prisma.produktvariante.count()
    const auftraege = await prisma.auftrag.count()

    return NextResponse.json({
      message: 'Current data counts',
      counts: {
        factories,
        baugruppentypen,
        baugruppen,
        kunden,
        produkte,
        varianten,
        auftraege
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get counts',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}