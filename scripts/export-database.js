const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function exportDatabase() {
  try {
    console.log('🔄 Exporting database data...')
    
    // Export all data
    const data = {
      timestamp: new Date().toISOString(),
      factories: await prisma.reassemblyFactory.findMany({
        include: {
          produkte: {
            include: {
              varianten: true,
              baugruppentypen: true
            }
          },
          baugruppentypen: true,
          baugruppen: {
            include: {
              baugruppentyp: true,
              prozesse: true
            }
          },
          auftraege: {
            include: {
              kunde: true,
              produktvariante: true
            }
          }
        }
      }),
      produkte: await prisma.produkt.findMany({
        include: {
          varianten: true,
          baugruppentypen: true,
          factory: true
        }
      }),
      produktvarianten: await prisma.produktvariante.findMany({
        include: {
          produkt: true
        }
      }),
      baugruppentypen: await prisma.baugruppentyp.findMany({
        include: {
          factory: true,
          produkte: true
        }
      }),
      baugruppen: await prisma.baugruppe.findMany({
        include: {
          factory: true,
          baugruppentyp: true,
          prozesse: true
        }
      }),
      prozesse: await prisma.prozess.findMany(),
      kunden: await prisma.kunde.findMany(),
      auftraege: await prisma.auftrag.findMany({
        include: {
          kunde: true,
          produktvariante: true,
          factory: true
        }
      })
    }
    
    // Create backups directory if it doesn't exist
    const backupsDir = path.join(__dirname, '..', 'backups')
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true })
    }
    
    // Write to JSON file
    const filename = `database-backup-${Date.now()}.json`
    const filepath = path.join(backupsDir, filename)
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
    
    console.log('✅ Database exported successfully!')
    console.log(`📄 File: ${filepath}`)
    console.log(`📊 Statistics:`)
    console.log(`   - Factories: ${data.factories.length}`)
    console.log(`   - Products: ${data.produkte.length}`)
    console.log(`   - Variants: ${data.produktvarianten.length}`)
    console.log(`   - Baugruppentypen: ${data.baugruppentypen.length}`)
    console.log(`   - Baugruppen: ${data.baugruppen.length}`)
    console.log(`   - Processes: ${data.prozesse.length}`)
    console.log(`   - Customers: ${data.kunden.length}`)
    console.log(`   - Orders: ${data.auftraege.length}`)
    
  } catch (error) {
    console.error('❌ Export failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

exportDatabase()