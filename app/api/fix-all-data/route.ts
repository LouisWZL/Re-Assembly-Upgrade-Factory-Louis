import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { seedDatabase } from '@/prisma/seed-functions'

export async function POST() {
  try {
    console.log('🔧 Fixing all data comprehensively...')
    
    // Get all factories
    const factories = await prisma.reassemblyFactory.findMany({
      include: {
        produkte: {
          include: {
            varianten: true,
            baugruppentypen: true
          }
        },
        baugruppentypen: true,
        baugruppen: true
      }
    })

    console.log(`Found ${factories.length} factories`)

    let fixed = {
      factories: 0,
      products: 0,
      variants: 0,
      baugruppentypen: 0,
      baugruppen: 0,
      customers: 0
    }

    // For each factory, ensure it has all necessary data
    for (const factory of factories) {
      console.log(`\n🏭 Checking factory: ${factory.name}`)
      
      // Ensure factory has Baugruppentypen
      if (factory.baugruppentypen.length === 0) {
        console.log('⚠️ No Baugruppentypen found, creating...')
        
        // Determine factory type based on name
        let bgtPrefix = 'BGT-'
        if (factory.name.includes('Porsche')) bgtPrefix = 'BGT-PS-'
        else if (factory.name.includes('Audi')) bgtPrefix = 'BGT-AU-'
        else if (factory.name.includes('Volkswagen')) bgtPrefix = 'BGT-VW-'
        
        const baugruppentypenNames = [
          'Chassis', 'Karosserie', 'Fahrwerk', 
          'Antrieb', 'Interieur', 'Elektronik'
        ]
        
        for (const name of baugruppentypenNames) {
          await prisma.baugruppentyp.create({
            data: {
              bezeichnung: `${bgtPrefix}${name}`,
              factoryId: factory.id
            }
          })
          fixed.baugruppentypen++
        }
      }
      
      // Refresh Baugruppentypen
      const baugruppentypen = await prisma.baugruppentyp.findMany({
        where: { factoryId: factory.id }
      })
      
      // Ensure factory has at least one product
      if (factory.produkte.length === 0) {
        console.log('⚠️ No products found, creating...')
        
        // Determine product name based on factory
        let produktName = 'Generic Car'
        let seriennummer = `CAR-${Date.now()}`
        
        if (factory.name.includes('Porsche')) {
          produktName = 'Porsche 911'
          seriennummer = `P911-${Date.now()}`
        } else if (factory.name.includes('Audi')) {
          produktName = 'Audi A6'
          seriennummer = `A6-${Date.now()}`
        } else if (factory.name.includes('Volkswagen')) {
          produktName = 'Volkswagen Tiguan'
          seriennummer = `TIG-${Date.now()}`
        }
        
        const produkt = await prisma.produkt.create({
          data: {
            bezeichnung: produktName,
            seriennummer,
            factoryId: factory.id,
            baugruppentypen: {
              connect: baugruppentypen.map(bgt => ({ id: bgt.id }))
            }
          }
        })
        fixed.products++
        
        // Create variants for the new product
        await prisma.produktvariante.create({
          data: {
            bezeichnung: `${produktName} Basic`,
            typ: 'basic',
            produktId: produkt.id,
            links: {}
          }
        })
        fixed.variants++
        
        await prisma.produktvariante.create({
          data: {
            bezeichnung: `${produktName} Premium`,
            typ: 'premium',
            produktId: produkt.id,
            links: {}
          }
        })
        fixed.variants++
      } else {
        // Ensure existing products have variants
        for (const produkt of factory.produkte) {
          // Ensure product is connected to Baugruppentypen
          if (produkt.baugruppentypen.length === 0) {
            console.log(`⚠️ Product ${produkt.bezeichnung} has no Baugruppentypen, connecting...`)
            await prisma.produkt.update({
              where: { id: produkt.id },
              data: {
                baugruppentypen: {
                  connect: baugruppentypen.map(bgt => ({ id: bgt.id }))
                }
              }
            })
          }
          
          if (produkt.varianten.length === 0) {
            console.log(`⚠️ Product ${produkt.bezeichnung} has no variants, creating...`)
            
            await prisma.produktvariante.create({
              data: {
                bezeichnung: `${produkt.bezeichnung} Basic`,
                typ: 'basic',
                produktId: produkt.id,
                links: {}
              }
            })
            fixed.variants++
            
            await prisma.produktvariante.create({
              data: {
                bezeichnung: `${produkt.bezeichnung} Premium`,
                typ: 'premium',
                produktId: produkt.id,
                links: {}
              }
            })
            fixed.variants++
          }
        }
      }
      
      // Ensure factory has Baugruppen
      if (factory.baugruppen.length === 0) {
        console.log('⚠️ No Baugruppen found, creating minimal set...')
        
        // Create at least one Baugruppe for each Baugruppentyp
        for (const bgt of baugruppentypen) {
          const shortName = bgt.bezeichnung.split('-').pop() || 'Unknown'
          await prisma.baugruppe.create({
            data: {
              bezeichnung: `BG-${shortName}-${Date.now()}`,
              artikelnummer: `ART-${shortName}-${Date.now()}`,
              variantenTyp: 'basicAndPremium',
              factoryId: factory.id,
              baugruppentypId: bgt.id,
              demontagezeit: 60,
              montagezeit: 90
            }
          })
          fixed.baugruppen++
        }
      }
    }
    
    // Ensure at least 3 customers exist
    const customers = await prisma.kunde.count()
    if (customers < 3) {
      console.log('⚠️ Less than 3 customers found, creating...')
      
      const customerData = [
        {
          vorname: 'Max',
          nachname: 'Mustermann',
          email: `max.mustermann.${Date.now()}@example.com`,
          telefon: '+49 123 456789',
          adresse: 'Musterstraße 1, 12345 Musterstadt'
        },
        {
          vorname: 'Erika',
          nachname: 'Schmidt',
          email: `erika.schmidt.${Date.now()}@example.com`,
          telefon: '+49 987 654321',
          adresse: 'Beispielweg 42, 54321 Beispielstadt'
        },
        {
          vorname: 'Thomas',
          nachname: 'Müller',
          email: `thomas.mueller.${Date.now()}@example.com`,
          telefon: '+49 555 123456',
          adresse: 'Hauptstraße 10, 67890 Neustadt'
        }
      ]
      
      for (let i = customers; i < 3; i++) {
        await prisma.kunde.create({
          data: customerData[i]
        })
        fixed.customers++
      }
    }
    
    // Final counts
    const finalCounts = {
      factories: await prisma.reassemblyFactory.count(),
      products: await prisma.produkt.count(),
      variants: await prisma.produktvariante.count(),
      baugruppentypen: await prisma.baugruppentyp.count(),
      baugruppen: await prisma.baugruppe.count(),
      customers: await prisma.kunde.count(),
      orders: await prisma.auftrag.count()
    }
    
    console.log('✅ Data fix completed!')
    console.log('Fixed:', fixed)
    console.log('Final counts:', finalCounts)
    
    return NextResponse.json({
      success: true,
      message: 'All data fixed successfully',
      fixed,
      finalCounts
    })
    
  } catch (error) {
    console.error('❌ Fix data failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to fix data',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}