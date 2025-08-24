import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedDatabase() {
  console.log('🌱 Start seeding ...')

  try {
    // Create customers
    const customers = await prisma.kunde.createMany({
      data: [
        {
          vorname: 'Max',
          nachname: 'Mustermann',
          email: 'max.mustermann@example.com',
          telefon: '+49 123 456789',
          adresse: 'Musterstraße 1, 12345 Musterstadt'
        },
        {
          vorname: 'Erika',
          nachname: 'Schmidt',
          email: 'erika.schmidt@example.com',
          telefon: '+49 987 654321',
          adresse: 'Beispielweg 42, 54321 Beispielstadt'
        },
        {
          vorname: 'Thomas',
          nachname: 'Müller',
          email: 'thomas.mueller@example.com',
          telefon: '+49 555 123456',
          adresse: 'Hauptstraße 10, 67890 Neustadt'
        }
      ]
    })

    // Create Porsche Factory
    const porscheFactory = await prisma.reassemblyFactory.create({
      data: {
        name: 'Stuttgart Porsche Reassembly Center',
        kapazität: 50,
        schichtmodell: 'EINSCHICHT',
        anzahlMontagestationen: 10,
        targetBatchAverage: 65,
        pflichtUpgradeSchwelle: 30,
      }
    })

    // Create Porsche component types
    const porscheBaugruppentypen = await Promise.all([
      prisma.baugruppentyp.create({
        data: {
          bezeichnung: 'BGT-PS-Chassis',
          factoryId: porscheFactory.id
        }
      }),
      prisma.baugruppentyp.create({
        data: {
          bezeichnung: 'BGT-PS-Karosserie',
          factoryId: porscheFactory.id
        }
      }),
      prisma.baugruppentyp.create({
        data: {
          bezeichnung: 'BGT-PS-Antrieb',
          factoryId: porscheFactory.id
        }
      }),
      prisma.baugruppentyp.create({
        data: {
          bezeichnung: 'BGT-PS-Fahrwerk',
          factoryId: porscheFactory.id
        }
      }),
      prisma.baugruppentyp.create({
        data: {
          bezeichnung: 'BGT-PS-Elektronik',
          factoryId: porscheFactory.id
        }
      }),
      prisma.baugruppentyp.create({
        data: {
          bezeichnung: 'BGT-PS-Interieur',
          factoryId: porscheFactory.id
        }
      })
    ])

    // Create Porsche 911 product
    const porsche911 = await prisma.produkt.create({
      data: {
        bezeichnung: 'Porsche 911',
        seriennummer: 'P911-2024-001',
        factoryId: porscheFactory.id,
        baugruppentypen: {
          connect: porscheBaugruppentypen.map(bgt => ({ id: bgt.id }))
        },
        varianten: {
          create: [
            {
              bezeichnung: '911 Carrera Basic',
              typ: 'basic',
              links: {}
            },
            {
              bezeichnung: '911 Turbo S Premium',
              typ: 'premium',
              links: {}
            }
          ]
        }
      },
      include: {
        varianten: true
      }
    })

    // Get all customers for order creation
    const allCustomers = await prisma.kunde.findMany()

    // Create sample orders
    if (porsche911.varianten.length > 0 && allCustomers.length > 0) {
      await prisma.auftrag.create({
        data: {
          kundeId: allCustomers[0].id,
          produktvarianteId: porsche911.varianten[0].id,
          phase: 'AUFTRAGSANNAHME',
          factoryId: porscheFactory.id,
        }
      })

      await prisma.auftrag.create({
        data: {
          kundeId: allCustomers[1].id,
          produktvarianteId: porsche911.varianten[1].id,
          phase: 'REASSEMBLY_ENDE',
          factoryId: porscheFactory.id,
        }
      })
    }

    console.log('✅ Porsche factory seeded successfully!')

    // Create additional factories for variety
    await createAdditionalFactories()

    console.log('✅ All factories seeded successfully!')

  } catch (error) {
    console.error('❌ Seeding failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

async function createAdditionalFactories() {
  // Create Audi Factory
  const audiFactory = await prisma.reassemblyFactory.create({
    data: {
      name: 'Ingolstadt Audi Reassembly Factory',
      kapazität: 75,
      schichtmodell: 'EINSCHICHT',
      anzahlMontagestationen: 10,
      targetBatchAverage: 65,
      pflichtUpgradeSchwelle: 30,
    }
  })

  // Create Audi component types
  const audiBaugruppentypen = await Promise.all([
    prisma.baugruppentyp.create({
      data: {
        bezeichnung: 'BGT-AU-Antrieb',
        factoryId: audiFactory.id
      }
    }),
    prisma.baugruppentyp.create({
      data: {
        bezeichnung: 'BGT-AU-Chassis',
        factoryId: audiFactory.id
      }
    }),
    prisma.baugruppentyp.create({
      data: {
        bezeichnung: 'BGT-AU-Fahrwerk',
        factoryId: audiFactory.id
      }
    }),
    prisma.baugruppentyp.create({
      data: {
        bezeichnung: 'BGT-AU-Karosserie',
        factoryId: audiFactory.id
      }
    }),
    prisma.baugruppentyp.create({
      data: {
        bezeichnung: 'BGT-AU-Interieur',
        factoryId: audiFactory.id
      }
    }),
    prisma.baugruppentyp.create({
      data: {
        bezeichnung: 'BGT-AU-Elektronik',
        factoryId: audiFactory.id
      }
    })
  ])

  // Create Audi A6 product
  const audiA6 = await prisma.produkt.create({
    data: {
      bezeichnung: 'Audi A6',
      seriennummer: 'A6-2024-001',
      factoryId: audiFactory.id,
      baugruppentypen: {
        connect: audiBaugruppentypen.map(bgt => ({ id: bgt.id }))
      },
      varianten: {
        create: [
          {
            bezeichnung: 'Audi A6 Basic',
            typ: 'basic',
            links: {}
          },
          {
            bezeichnung: 'Audi A6 Premium',
            typ: 'premium',
            links: {}
          }
        ]
      }
    },
    include: {
      varianten: true
    }
  })

  // Create VW Factory
  const vwFactory = await prisma.reassemblyFactory.create({
    data: {
      name: 'Wolfsburg Volkswagen Re-Manufacturing Plant',
      kapazität: 100,
      schichtmodell: 'EINSCHICHT',
      anzahlMontagestationen: 10,
      targetBatchAverage: 65,
      pflichtUpgradeSchwelle: 30,
    }
  })

  // Get customers for additional orders
  const allCustomers = await prisma.kunde.findMany()
  
  if (audiA6.varianten.length > 0 && allCustomers.length > 0) {
    await prisma.auftrag.create({
      data: {
        kundeId: allCustomers[2].id,
        produktvarianteId: audiA6.varianten[0].id,
        phase: 'REASSEMBLY_START',
        factoryId: audiFactory.id,
      }
    })
  }
}