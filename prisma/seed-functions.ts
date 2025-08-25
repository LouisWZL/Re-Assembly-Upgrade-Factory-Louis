import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ==========================================
// BAUGRUPPENTYPEN DEFINITION (Factory-specific)
// ==========================================
const porscheBaugruppentypenDefinitions = [
  { bezeichnung: "BGT-PS-Chassis" },
  { bezeichnung: "BGT-PS-Karosserie" },
  { bezeichnung: "BGT-PS-Fahrwerk" },
  { bezeichnung: "BGT-PS-Antrieb" },
  { bezeichnung: "BGT-PS-Interieur" },
  { bezeichnung: "BGT-PS-Elektronik" }
]

const audiBaugruppentypenDefinitions = [
  { bezeichnung: "BGT-AU-Chassis" },
  { bezeichnung: "BGT-AU-Karosserie" },
  { bezeichnung: "BGT-AU-Fahrwerk" },
  { bezeichnung: "BGT-AU-Antrieb" },
  { bezeichnung: "BGT-AU-Interieur" },
  { bezeichnung: "BGT-AU-Elektronik" }
]

const vwBaugruppentypenDefinitions = [
  { bezeichnung: "BGT-VW-Chassis" },
  { bezeichnung: "BGT-VW-Karosserie" },
  { bezeichnung: "BGT-VW-Fahrwerk" },
  { bezeichnung: "BGT-VW-Antrieb" },
  { bezeichnung: "BGT-VW-Interieur" },
  { bezeichnung: "BGT-VW-Elektronik" }
]

// ==========================================
// STUTTGART PORSCHE REASSEMBLY CENTER
// ==========================================

// Porsche Factory
const porscheFactory: Prisma.ReassemblyFactoryCreateInput = {
  name: "Stuttgart Porsche Reassembly Center",
  kapazität: 50,
  targetBatchAverage: 65
}

// Porsche Prozesse
const porscheProzesse: Prisma.ProzessCreateInput[] = [
  { name: "Demontage" },
  { name: "Reinigung & Entfettung" },
  { name: "Oberflächenbehandlung" },
  { name: "Montage" },
  { name: "Qualitätskontrolle" }
]

// Porsche Baugruppen (mit Baugruppentyp-Zuordnung)
interface BaugruppeWithType {
  bezeichnung: string
  artikelnummer: string
  variantenTyp: 'basic' | 'premium' | 'basicAndPremium'
  demontagezeit?: number | null
  montagezeit?: number | null
  baugruppentyp: string
}

const porscheBaugruppen: BaugruppeWithType[] = [
  {
    bezeichnung: "BG-PS-Chassis",
    artikelnummer: "CHS-BP-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 72,
    montagezeit: 108,
    baugruppentyp: "BGT-PS-Chassis"
  },
  {
    bezeichnung: "BG-PS-Karosserie-B1",
    artikelnummer: "KAR-B1-001",
    variantenTyp: "basic",
    demontagezeit: 48,
    montagezeit: 72,
    baugruppentyp: "BGT-PS-Karosserie"
  },
  {
    bezeichnung: "BG-PS-Karosserie-B2",
    artikelnummer: "KAR-B2-001",
    variantenTyp: "basic",
    demontagezeit: 36,
    montagezeit: 54,
    baugruppentyp: "BGT-PS-Karosserie"
  },
  {
    bezeichnung: "BG-PS-Karosserie-P1",
    artikelnummer: "KAR-P1-001",
    variantenTyp: "premium",
    demontagezeit: 60,
    montagezeit: 90,
    baugruppentyp: "BGT-PS-Karosserie"
  },
  {
    bezeichnung: "BG-PS-Karosserie-P2",
    artikelnummer: "KAR-P2-001",
    variantenTyp: "premium",
    demontagezeit: 40,
    montagezeit: 60,
    baugruppentyp: "BGT-PS-Karosserie"
  },
  {
    bezeichnung: "BG-PS-Fahrwerk",
    artikelnummer: "FAH-BP-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 96,
    montagezeit: 144,
    baugruppentyp: "BGT-PS-Fahrwerk"
  },
  {
    bezeichnung: "BG-PS-Antrieb",
    artikelnummer: "ANT-BP-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 144,
    montagezeit: 216,
    baugruppentyp: "BGT-PS-Antrieb"
  },
  {
    bezeichnung: "BG-PS-Interieur-Basic",
    artikelnummer: "INT-B-001",
    variantenTyp: "basic",
    demontagezeit: 60,
    montagezeit: 90,
    baugruppentyp: "BGT-PS-Interieur"
  },
  {
    bezeichnung: "BG-PS-Interieur-Premium",
    artikelnummer: "INT-P-001",
    variantenTyp: "premium",
    demontagezeit: 72,
    montagezeit: 108,
    baugruppentyp: "BGT-PS-Interieur"
  },
  {
    bezeichnung: "BG-PS-Elektronik",
    artikelnummer: "ELE-BP-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 48,
    montagezeit: 72,
    baugruppentyp: "BGT-PS-Elektronik"
  }
]

// Porsche Produkt
const porscheProdukt: Omit<Prisma.ProduktCreateInput, 'factory'> = {
  bezeichnung: "Porsche 911",
  seriennummer: "P911-2024-001"
}

// ==========================================
// INGOLSTADT AUDI REASSEMBLY FACTORY
// ==========================================

// Audi Factory
const audiFactory: Prisma.ReassemblyFactoryCreateInput = {
  name: "Ingolstadt Audi Reassembly Factory",
  kapazität: 75,
  targetBatchAverage: 65
}

// Audi Prozesse
const audiProzesse: Prisma.ProzessCreateInput[] = [
  { name: "Vorreinigung" },
  { name: "Teildemontage" },
  { name: "Hauptreinigung" },
  { name: "Reparatur & Aufbereitung" },
  { name: "Neumontage" },
  { name: "Endkontrolle" }
]

// Audi Baugruppen
const audiBaugruppen: BaugruppeWithType[] = [
  {
    bezeichnung: "BG-AU-Chassis",
    artikelnummer: "AUDI-CHS-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 64,
    montagezeit: 96,
    baugruppentyp: "BGT-AU-Chassis"
  },
  {
    bezeichnung: "BG-AU-Karosserie-Basic",
    artikelnummer: "AUDI-KAR-B-001",
    variantenTyp: "basic",
    demontagezeit: 44,
    montagezeit: 66,
    baugruppentyp: "BGT-AU-Karosserie"
  },
  {
    bezeichnung: "BG-AU-Karosserie-Premium",
    artikelnummer: "AUDI-KAR-P-001",
    variantenTyp: "premium",
    demontagezeit: 56,
    montagezeit: 84,
    baugruppentyp: "BGT-AU-Karosserie"
  },
  {
    bezeichnung: "BG-AU-Fahrwerk",
    artikelnummer: "AUDI-FAH-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 88,
    montagezeit: 132,
    baugruppentyp: "BGT-AU-Fahrwerk"
  },
  {
    bezeichnung: "BG-AU-Antrieb-Basic",
    artikelnummer: "AUDI-ANT-B-001",
    variantenTyp: "basic",
    demontagezeit: 128,
    montagezeit: 192,
    baugruppentyp: "BGT-AU-Antrieb"
  },
  {
    bezeichnung: "BG-AU-Antrieb-Premium",
    artikelnummer: "AUDI-ANT-P-001",
    variantenTyp: "premium",
    demontagezeit: 152,
    montagezeit: 228,
    baugruppentyp: "BGT-AU-Antrieb"
  },
  {
    bezeichnung: "BG-AU-Interieur",
    artikelnummer: "AUDI-INT-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 64,
    montagezeit: 96,
    baugruppentyp: "BGT-AU-Interieur"
  },
  {
    bezeichnung: "BG-AU-Elektronik-Basic",
    artikelnummer: "AUDI-ELE-B-001",
    variantenTyp: "basic",
    demontagezeit: 40,
    montagezeit: 60,
    baugruppentyp: "BGT-AU-Elektronik"
  },
  {
    bezeichnung: "BG-AU-Elektronik-Premium",
    artikelnummer: "AUDI-ELE-P-001",
    variantenTyp: "premium",
    demontagezeit: 56,
    montagezeit: 84,
    baugruppentyp: "BGT-AU-Elektronik"
  }
]

// Audi Produkt (nur eines pro Factory)
const audiProdukt: Omit<Prisma.ProduktCreateInput, 'factory'> = {
  bezeichnung: "Audi A6",
  seriennummer: "A6-2024-001"
}

// ==========================================
// WOLFSBURG VOLKSWAGEN RE-MANUFACTURING PLANT
// ==========================================

// VW Factory
const vwFactory: Prisma.ReassemblyFactoryCreateInput = {
  name: "Wolfsburg Volkswagen Re-Manufacturing Plant",
  kapazität: 100,
  targetBatchAverage: 65
}

// VW Prozesse
const vwProzesse: Prisma.ProzessCreateInput[] = [
  { name: "Eingangsprüfung" },
  { name: "Komplettdemontage" },
  { name: "Teilereinigung" },
  { name: "Aufarbeitung" },
  { name: "Neumontage" },
  { name: "Funktionsprüfung" },
  { name: "Qualitätssicherung" }
]

// VW Baugruppen
const vwBaugruppen: BaugruppeWithType[] = [
  {
    bezeichnung: "BG-VW-Chassis",
    artikelnummer: "VW-CHS-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 56,
    montagezeit: 84,
    baugruppentyp: "BGT-VW-Chassis"
  },
  {
    bezeichnung: "BG-VW-Karosserie",
    artikelnummer: "VW-KAR-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 40,
    montagezeit: 60,
    baugruppentyp: "BGT-VW-Karosserie"
  },
  {
    bezeichnung: "BG-VW-Fahrwerk-Basic",
    artikelnummer: "VW-FAH-B-001",
    variantenTyp: "basic",
    demontagezeit: 80,
    montagezeit: 120,
    baugruppentyp: "BGT-VW-Fahrwerk"
  },
  {
    bezeichnung: "BG-VW-Fahrwerk-Premium",
    artikelnummer: "VW-FAH-P-001",
    variantenTyp: "premium",
    demontagezeit: 100,
    montagezeit: 150,
    baugruppentyp: "BGT-VW-Fahrwerk"
  },
  {
    bezeichnung: "BG-VW-Antrieb",
    artikelnummer: "VW-ANT-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 120,
    montagezeit: 180,
    baugruppentyp: "BGT-VW-Antrieb"
  },
  {
    bezeichnung: "BG-VW-Interieur-Basic",
    artikelnummer: "VW-INT-B-001",
    variantenTyp: "basic",
    demontagezeit: 56,
    montagezeit: 84,
    baugruppentyp: "BGT-VW-Interieur"
  },
  {
    bezeichnung: "BG-VW-Interieur-Premium",
    artikelnummer: "VW-INT-P-001",
    variantenTyp: "premium",
    demontagezeit: 68,
    montagezeit: 102,
    baugruppentyp: "BGT-VW-Interieur"
  },
  {
    bezeichnung: "BG-VW-Elektronik",
    artikelnummer: "VW-ELE-001",
    variantenTyp: "basicAndPremium",
    demontagezeit: 44,
    montagezeit: 66,
    baugruppentyp: "BGT-VW-Elektronik"
  }
]

// VW Produkt (nur eines pro Factory)
const vwProdukt: Omit<Prisma.ProduktCreateInput, 'factory'> = {
  bezeichnung: "Volkswagen Tiguan",
  seriennummer: "TIG-2024-001"
}

// ==========================================
// SEEDING FUNCTION
// ==========================================

export async function seedDatabase() {
  console.log('🌱 Start seeding ...')

  try {
    // Clean database in correct order (dependent records first)
    // Use try-catch to handle tables that might not exist yet
    try {
      await prisma.liefertermin.deleteMany()
    } catch (error) {
      console.log('Liefertermin table not found, skipping...')
    }
    
    try {
      await prisma.baugruppeInstance.deleteMany()
    } catch (error) {
      console.log('BaugruppeInstance table not found, skipping...')
    }
    
    try {
      await prisma.auftrag.deleteMany()
    } catch (error) {
      console.log('Auftrag table not found, skipping...')
    }
    
    try {
      await prisma.produktvariante.deleteMany()
    } catch (error) {
      console.log('Produktvariante table not found, skipping...')
    }
    
    try {
      await prisma.produkt.deleteMany()
    } catch (error) {
      console.log('Produkt table not found, skipping...')
    }
    
    try {
      await prisma.baugruppe.deleteMany()
    } catch (error) {
      console.log('Baugruppe table not found, skipping...')
    }
    
    try {
      await prisma.baugruppentyp.deleteMany()
    } catch (error) {
      console.log('Baugruppentyp table not found, skipping...')
    }
    
    try {
      await prisma.reassemblyFactory.deleteMany()
    } catch (error) {
      console.log('ReassemblyFactory table not found, skipping...')
    }
    
    try {
      await prisma.prozess.deleteMany()
    } catch (error) {
      console.log('Prozess table not found, skipping...')
    }
    
    try {
      await prisma.kunde.deleteMany()
    } catch (error) {
      console.log('Kunde table not found, skipping...')
    }

    // ==========================================
    // ERSTELLE PORSCHE FACTORY
    // ==========================================
    
    const createdPorscheFactory = await prisma.reassemblyFactory.create({
      data: porscheFactory
    })

    // Erstelle Porsche Baugruppentypen
    const createdPorscheBaugruppentypen = await Promise.all(
      porscheBaugruppentypenDefinitions.map(typ => 
        prisma.baugruppentyp.create({
          data: {
            ...typ,
            factory: { connect: { id: createdPorscheFactory.id } }
          }
        })
      )
    )

    // Erstelle Porsche Prozesse
    const createdPorscheProzesse = await Promise.all(
      porscheProzesse.map(prozess => prisma.prozess.create({ data: prozess }))
    )

    // Erstelle Porsche Baugruppen mit Prozess-Verknüpfungen und Baugruppentyp
    const createdPorscheBaugruppen = await Promise.all(
      porscheBaugruppen.map(async (baugruppe) => {
        const { baugruppentyp, ...baugruppeData } = baugruppe
        const baugruppenTypObject = createdPorscheBaugruppentypen.find(t => t.bezeichnung === baugruppentyp)
        
        return prisma.baugruppe.create({
          data: {
            ...baugruppeData,
            factory: { connect: { id: createdPorscheFactory.id } },
            baugruppentyp: baugruppenTypObject ? {
              connect: { id: baugruppenTypObject.id }
            } : undefined,
            prozesse: {
              connect: createdPorscheProzesse.map(p => ({ id: p.id }))
            }
          }
        })
      })
    )

    // Erstelle Porsche Produkt mit Baugruppentypen
    const createdPorscheProdukt = await prisma.produkt.create({
      data: {
        ...porscheProdukt,
        factory: {
          connect: { id: createdPorscheFactory.id }
        },
        baugruppentypen: {
          connect: createdPorscheBaugruppentypen.map(typ => ({ id: typ.id }))
        }
      }
    })

    // Erstelle Porsche Produktvarianten
    const porscheVarianteBasic = await prisma.produktvariante.create({
      data: {
        bezeichnung: "911 Carrera Basic",
        typ: "basic",
        produkt: { connect: { id: createdPorscheProdukt.id } },
        links: {},
      }
    })

    const porscheVariantePremium = await prisma.produktvariante.create({
      data: {
        bezeichnung: "911 Turbo S Premium",
        typ: "premium",
        produkt: { connect: { id: createdPorscheProdukt.id } },
        links: {},
      }
    })

    // ==========================================
    // ERSTELLE AUDI FACTORY
    // ==========================================
    
    const createdAudiFactory = await prisma.reassemblyFactory.create({
      data: audiFactory
    })

    // Erstelle Audi Baugruppentypen
    const createdAudiBaugruppentypen = await Promise.all(
      audiBaugruppentypenDefinitions.map(typ => 
        prisma.baugruppentyp.create({
          data: {
            ...typ,
            factory: { connect: { id: createdAudiFactory.id } }
          }
        })
      )
    )

    // Erstelle Audi Prozesse
    const createdAudiProzesse = await Promise.all(
      audiProzesse.map(prozess => prisma.prozess.create({ data: prozess }))
    )

    // Erstelle Audi Baugruppen mit Prozess-Verknüpfungen und Baugruppentyp
    const createdAudiBaugruppen = await Promise.all(
      audiBaugruppen.map(async (baugruppe) => {
        const { baugruppentyp, ...baugruppeData } = baugruppe
        const baugruppenTypObject = createdAudiBaugruppentypen.find(t => t.bezeichnung === baugruppentyp)
        
        return prisma.baugruppe.create({
          data: {
            ...baugruppeData,
            factory: { connect: { id: createdAudiFactory.id } },
            baugruppentyp: baugruppenTypObject ? {
              connect: { id: baugruppenTypObject.id }
            } : undefined,
            prozesse: {
              connect: createdAudiProzesse.map(p => ({ id: p.id }))
            }
          }
        })
      })
    )

    // Erstelle Audi Produkt mit Baugruppentypen
    const createdAudiProdukt = await prisma.produkt.create({
      data: {
        ...audiProdukt,
        factory: {
          connect: { id: createdAudiFactory.id }
        },
        baugruppentypen: {
          connect: createdAudiBaugruppentypen.map(typ => ({ id: typ.id }))
        }
      }
    })

    // Erstelle Audi Produktvarianten
    const audiVarianteBasic = await prisma.produktvariante.create({
      data: {
        bezeichnung: `${createdAudiProdukt.bezeichnung} Basic`,
        typ: "basic",
        produkt: { connect: { id: createdAudiProdukt.id } },
        links: {}
      }
    })

    const audiVariantePremium = await prisma.produktvariante.create({
      data: {
        bezeichnung: `${createdAudiProdukt.bezeichnung} Premium`,
        typ: "premium",
        produkt: { connect: { id: createdAudiProdukt.id } },
        links: {},
      }
    })

    // ==========================================
    // ERSTELLE VW FACTORY
    // ==========================================
    
    const createdVWFactory = await prisma.reassemblyFactory.create({
      data: vwFactory
    })

    // Erstelle VW Baugruppentypen
    const createdVWBaugruppentypen = await Promise.all(
      vwBaugruppentypenDefinitions.map(typ => 
        prisma.baugruppentyp.create({
          data: {
            ...typ,
            factory: { connect: { id: createdVWFactory.id } }
          }
        })
      )
    )

    // Erstelle VW Prozesse
    const createdVWProzesse = await Promise.all(
      vwProzesse.map(prozess => prisma.prozess.create({ data: prozess }))
    )

    // Erstelle VW Baugruppen mit Prozess-Verknüpfungen und Baugruppentyp
    const createdVWBaugruppen = await Promise.all(
      vwBaugruppen.map(async (baugruppe) => {
        const { baugruppentyp, ...baugruppeData } = baugruppe
        const baugruppenTypObject = createdVWBaugruppentypen.find(t => t.bezeichnung === baugruppentyp)
        
        return prisma.baugruppe.create({
          data: {
            ...baugruppeData,
            factory: { connect: { id: createdVWFactory.id } },
            baugruppentyp: baugruppenTypObject ? {
              connect: { id: baugruppenTypObject.id }
            } : undefined,
            prozesse: {
              connect: createdVWProzesse.map(p => ({ id: p.id }))
            }
          }
        })
      })
    )

    // Erstelle VW Produkt mit Baugruppentypen
    const createdVWProdukt = await prisma.produkt.create({
      data: {
        ...vwProdukt,
        factory: {
          connect: { id: createdVWFactory.id }
        },
        baugruppentypen: {
          connect: createdVWBaugruppentypen.map(typ => ({ id: typ.id }))
        }
      }
    })

    // Erstelle VW Produktvarianten
    const vwVarianteBasic = await prisma.produktvariante.create({
      data: {
        bezeichnung: `${createdVWProdukt.bezeichnung} Basic`,
        typ: "basic",
        produkt: { connect: { id: createdVWProdukt.id } },
        links: {}
      }
    })

    const vwVariantePremium = await prisma.produktvariante.create({
      data: {
        bezeichnung: `${createdVWProdukt.bezeichnung} Premium`,
        typ: "premium",
        produkt: { connect: { id: createdVWProdukt.id } },
        links: {},
      }
    })

    // ==========================================
    // ERSTELLE KUNDEN
    // ==========================================
    
    const createdKunden = await Promise.all([
      prisma.kunde.create({
        data: {
          vorname: "Max",
          nachname: "Mustermann",
          email: "max.mustermann@example.com",
          telefon: "+49 123 456789",
          adresse: "Musterstraße 1, 12345 Musterstadt"
        }
      }),
      prisma.kunde.create({
        data: {
          vorname: "Erika",
          nachname: "Schmidt",
          email: "erika.schmidt@example.com",
          telefon: "+49 987 654321",
          adresse: "Beispielweg 42, 54321 Beispielstadt"
        }
      }),
      prisma.kunde.create({
        data: {
          vorname: "Thomas",
          nachname: "Müller",
          email: "thomas.mueller@example.com",
          telefon: "+49 555 123456",
          adresse: "Hauptstraße 10, 67890 Neustadt"
        }
      })
    ])

    // ==========================================
    // ERSTELLE AUFTRÄGE
    // ==========================================
    
    // Porsche Aufträge
    await prisma.auftrag.create({
      data: {
        kunde: { connect: { id: createdKunden[0].id } },
        produktvariante: { connect: { id: porscheVarianteBasic.id } },
        phase: "AUFTRAGSANNAHME",
        factory: { connect: { id: createdPorscheFactory.id } },
        liefertermine: {
          create: {
            typ: "GROB_ZEITSCHIENE",
            datum: new Date("2024-06-15"),
            istAktuell: true,
            bemerkung: "Erste Schätzung nach Kundengespräch"
          }
        }
      }
    })

    await prisma.auftrag.create({
      data: {
        kunde: { connect: { id: createdKunden[1].id } },
        produktvariante: { connect: { id: porscheVariantePremium.id } },
        phase: "REASSEMBLY_ENDE",
        factory: { connect: { id: createdPorscheFactory.id } },
        liefertermine: {
          create: [
            {
              typ: "GROB_ZEITSCHIENE",
              datum: new Date("2024-05-01"),
              istAktuell: false,
              bemerkung: "Erste Schätzung"
            },
            {
              typ: "GROBTERMIN",
              datum: new Date("2024-05-15"),
              istAktuell: false,
              bemerkung: "Nach Grobterminierung"
            },
            {
              typ: "FEINTERMIN",
              datum: new Date("2024-05-20"),
              istAktuell: true,
              bemerkung: "Nach Inspektion angepasst"
            }
          ]
        }
      }
    })

    // Audi Aufträge
    await prisma.auftrag.create({
      data: {
        kunde: { connect: { id: createdKunden[2].id } },
        produktvariante: { connect: { id: audiVarianteBasic.id } },
        phase: "REASSEMBLY_START",
        factory: { connect: { id: createdAudiFactory.id } },
        liefertermine: {
          create: {
            typ: "FEINTERMIN",
            datum: new Date("2024-04-25"),
            istAktuell: true,
            bemerkung: "In Bearbeitung"
          }
        }
      }
    })

    // VW Aufträge
    await prisma.auftrag.create({
      data: {
        kunde: { connect: { id: createdKunden[0].id } },
        produktvariante: { connect: { id: vwVarianteBasic.id } },
        phase: "INSPEKTION",
        factory: { connect: { id: createdVWFactory.id } },
        liefertermine: {
          create: {
            typ: "GROB_ZEITSCHIENE",
            datum: new Date("2024-07-01"),
            istAktuell: true
          }
        }
      }
    })

    await prisma.auftrag.create({
      data: {
        kunde: { connect: { id: createdKunden[1].id } },
        produktvariante: { connect: { id: vwVariantePremium.id } },
        phase: "INSPEKTION",
        factory: { connect: { id: createdVWFactory.id } },
        liefertermine: {
          create: {
            typ: "GROBTERMIN",
            datum: new Date("2024-06-15"),
            istAktuell: true,
            bemerkung: "Wartet auf Inspektion"
          }
        }
      }
    })

    console.log('✅ Seeding completed successfully!')
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}