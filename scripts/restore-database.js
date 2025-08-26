const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function restoreDatabase(backupFilePath) {
  try {
    if (!fs.existsSync(backupFilePath)) {
      console.error('❌ Backup file not found:', backupFilePath)
      return
    }
    
    console.log('🔄 Restoring database from backup...')
    const data = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'))
    
    console.log('📊 Backup contains:')
    console.log(`   - Factories: ${data.factories?.length || 0}`)
    console.log(`   - Products: ${data.produkte?.length || 0}`)
    console.log(`   - Variants: ${data.produktvarianten?.length || 0}`)
    console.log(`   - Baugruppentypen: ${data.baugruppentypen?.length || 0}`)
    console.log(`   - Baugruppen: ${data.baugruppen?.length || 0}`)
    console.log(`   - Customers: ${data.kunden?.length || 0}`)
    console.log(`   - Orders: ${data.auftraege?.length || 0}`)
    
    // Clear existing data (in reverse order of dependencies)
    console.log('🧹 Clearing existing data...')
    await prisma.auftrag.deleteMany()
    await prisma.kunde.deleteMany()
    await prisma.prozess.deleteMany()
    await prisma.baugruppe.deleteMany()
    await prisma.baugruppentyp.deleteMany()
    await prisma.produktvariante.deleteMany()
    await prisma.produkt.deleteMany()
    await prisma.reassemblyFactory.deleteMany()
    
    // Restore data (in order of dependencies)
    console.log('📥 Restoring data...')
    
    // Factories
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
          createdAt: factory.createdAt,
          updatedAt: factory.updatedAt
        }
      })
    }
    
    // Products
    for (const produkt of data.produkte || []) {
      await prisma.produkt.create({
        data: {
          id: produkt.id,
          bezeichnung: produkt.bezeichnung,
          seriennummer: produkt.seriennummer,
          factoryId: produkt.factoryId,
          createdAt: produkt.createdAt,
          updatedAt: produkt.updatedAt
        }
      })
    }
    
    // Baugruppentypen
    for (const bgt of data.baugruppentypen || []) {
      await prisma.baugruppentyp.create({
        data: {
          id: bgt.id,
          bezeichnung: bgt.bezeichnung,
          factoryId: bgt.factoryId,
          createdAt: bgt.createdAt,
          updatedAt: bgt.updatedAt
        }
      })
    }
    
    console.log('✅ Database restored successfully!')
    
  } catch (error) {
    console.error('❌ Restore failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Get backup file from command line argument
const backupFile = process.argv[2]
if (!backupFile) {
  console.log('Usage: node restore-database.js <path-to-backup-file>')
  process.exit(1)
}

restoreDatabase(backupFile)