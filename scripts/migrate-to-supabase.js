const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

async function migrateToSupabase() {
  console.log('🔄 Starting migration to Supabase...')
  
  // Read the backup data
  const backupDir = path.join(__dirname, '..', 'backups')
  const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('database-backup-') && f.endsWith('.json'))
  
  if (backupFiles.length === 0) {
    console.error('❌ No backup file found! Please run the backup first.')
    return
  }
  
  // Get the latest backup file
  const latestBackup = backupFiles.sort().reverse()[0]
  const backupPath = path.join(backupDir, latestBackup)
  
  console.log('📄 Using backup file:', latestBackup)
  
  // Read backup data
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  
  console.log('📊 Backup contains:')
  console.log(`   - Factories: ${data.factories?.length || 0}`)
  console.log(`   - Products: ${data.produkte?.length || 0}`)
  console.log(`   - Variants: ${data.produktvarianten?.length || 0}`)
  console.log(`   - Baugruppentypen: ${data.baugruppentypen?.length || 0}`)
  console.log(`   - Baugruppen: ${data.baugruppen?.length || 0}`)
  console.log(`   - Customers: ${data.kunden?.length || 0}`)
  console.log(`   - Orders: ${data.auftraege?.length || 0}`)
  
  // Connect to Supabase
  const prisma = new PrismaClient()
  
  try {
    console.log('🔗 Connecting to Supabase...')
    await prisma.$connect()
    console.log('✅ Connected to Supabase!')
    
    // Clear existing data (if any)
    console.log('🧹 Clearing existing data...')
    await prisma.auftrag.deleteMany()
    await prisma.kunde.deleteMany()
    await prisma.prozess.deleteMany()
    await prisma.baugruppe.deleteMany()
    await prisma.baugruppentyp.deleteMany()
    await prisma.produktvariante.deleteMany()
    await prisma.produkt.deleteMany()
    await prisma.reassemblyFactory.deleteMany()
    
    // Insert data in correct order (respecting foreign key constraints)
    console.log('📥 Migrating Factories...')
    for (const factory of data.factories || []) {
      await prisma.reassemblyFactory.create({
        data: {
          id: factory.id,
          name: factory.name,
          kapazität: factory.kapazität,
          schichtmodell: factory.schichtmodell,
          anzahlMontagestationen: factory.anzahlMontagestationen,
          targetBatchAverage: factory.targetBatchAverage,
          pflichtUpgradeSchwelle: factory.pflichtUpgradeSchwelle,
          createdAt: new Date(factory.createdAt),
          updatedAt: new Date(factory.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.factories?.length || 0} factories`)
    
    console.log('📥 Migrating Products...')
    for (const produkt of data.produkte || []) {
      await prisma.produkt.create({
        data: {
          id: produkt.id,
          bezeichnung: produkt.bezeichnung,
          seriennummer: produkt.seriennummer,
          factoryId: produkt.factoryId,
          graphData: produkt.graphData,
          processGraphData: produkt.processGraphData,
          createdAt: new Date(produkt.createdAt),
          updatedAt: new Date(produkt.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.produkte?.length || 0} products`)
    
    console.log('📥 Migrating Product Variants...')
    for (const variant of data.produktvarianten || []) {
      await prisma.produktvariante.create({
        data: {
          id: variant.id,
          produktId: variant.produktId,
          bezeichnung: variant.bezeichnung,
          typ: variant.typ,
          glbFile: variant.glbFile,
          links: variant.links,
          createdAt: new Date(variant.createdAt),
          updatedAt: new Date(variant.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.produktvarianten?.length || 0} product variants`)
    
    console.log('📥 Migrating Baugruppentypen...')
    for (const bgt of data.baugruppentypen || []) {
      await prisma.baugruppentyp.create({
        data: {
          id: bgt.id,
          bezeichnung: bgt.bezeichnung,
          factoryId: bgt.factoryId,
          createdAt: new Date(bgt.createdAt),
          updatedAt: new Date(bgt.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.baugruppentypen?.length || 0} Baugruppentypen`)
    
    console.log('📥 Migrating Processes...')
    for (const prozess of data.prozesse || []) {
      await prisma.prozess.create({
        data: {
          id: prozess.id,
          name: prozess.name,
          createdAt: new Date(prozess.createdAt),
          updatedAt: new Date(prozess.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.prozesse?.length || 0} processes`)
    
    console.log('📥 Migrating Baugruppen...')
    for (const baugruppe of data.baugruppen || []) {
      await prisma.baugruppe.create({
        data: {
          id: baugruppe.id,
          bezeichnung: baugruppe.bezeichnung,
          artikelnummer: baugruppe.artikelnummer,
          variantenTyp: baugruppe.variantenTyp,
          verfuegbar: baugruppe.verfuegbar,
          factoryId: baugruppe.factoryId,
          baugruppentypId: baugruppe.baugruppentypId,
          demontagezeit: baugruppe.demontagezeit,
          montagezeit: baugruppe.montagezeit,
          createdAt: new Date(baugruppe.createdAt),
          updatedAt: new Date(baugruppe.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.baugruppen?.length || 0} Baugruppen`)
    
    console.log('📥 Migrating Customers...')
    for (const kunde of data.kunden || []) {
      await prisma.kunde.create({
        data: {
          id: kunde.id,
          vorname: kunde.vorname,
          nachname: kunde.nachname,
          email: kunde.email,
          telefon: kunde.telefon,
          adresse: kunde.adresse,
          createdAt: new Date(kunde.createdAt),
          updatedAt: new Date(kunde.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.kunden?.length || 0} customers`)
    
    console.log('📥 Migrating Orders...')
    for (const auftrag of data.auftraege || []) {
      await prisma.auftrag.create({
        data: {
          id: auftrag.id,
          kundeId: auftrag.kundeId,
          produktvarianteId: auftrag.produktvarianteId,
          phase: auftrag.phase,
          factoryId: auftrag.factoryId,
          terminierung: auftrag.terminierung,
          phaseHistory: auftrag.phaseHistory,
          graphData: auftrag.graphData,
          processGraphDataBg: auftrag.processGraphDataBg,
          processGraphDataBgt: auftrag.processGraphDataBgt,
          processSequences: auftrag.processSequences,
          createdAt: new Date(auftrag.createdAt),
          updatedAt: new Date(auftrag.updatedAt)
        }
      })
    }
    console.log(`✅ Migrated ${data.auftraege?.length || 0} orders`)
    
    // Create relationships (Baugruppen to Baugruppentypen connections via Product)
    console.log('🔗 Setting up relationships...')
    for (const factory of data.factories || []) {
      if (factory.produkte) {
        for (const produkt of factory.produkte) {
          if (produkt.baugruppentypen) {
            await prisma.produkt.update({
              where: { id: produkt.id },
              data: {
                baugruppentypen: {
                  connect: produkt.baugruppentypen.map(bgt => ({ id: bgt.id }))
                }
              }
            })
          }
        }
      }
    }
    console.log('✅ Relationships established!')
    
    console.log('🎉 Migration to Supabase completed successfully!')
    console.log('🔗 Your app now uses PostgreSQL on Supabase!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migrateToSupabase().catch(console.error)