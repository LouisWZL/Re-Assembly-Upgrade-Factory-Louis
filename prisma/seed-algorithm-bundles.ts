/**
 * Seed script for Algorithm Bundles
 *
 * This script creates demo algorithm bundles that map to the existing
 * terminierung files. In the future, these would reference Python scripts
 * for PAP/PIP/PIPO optimization.
 *
 * Run with: npx ts-node prisma/seed-algorithm-bundles.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const demoBundles = [
  {
    name: 'Ansatz_Terminierung_MA_Becker',
    description: 'MA Becker Terminierungsansatz mit Python-Algorithmen für alle drei Queue-Stufen.',
    author: 'MA Becker',
    isActive: true,
    // PreAcceptanceQueue
    papScriptPath: 'python/terminierung/pap.py',
    papDescription: 'PreAcceptanceQueue: Pre-Acceptance Processing',
    // PreInspectionQueue
    pipScriptPath: 'python/terminierung/pip.py',
    pipDescription: 'PreInspectionQueue: Pre-Inspection Processing',
    // PostInspectionQueue
    pipoScriptPath: 'python/terminierung/pipo.py',
    pipoDescription: 'PostInspectionQueue: Post-Inspection Processing'
  }
]

async function seed() {
  console.log('🌱 Seeding algorithm bundles...')

  try {
    // Clear existing bundles (optional - comment out if you want to keep existing data)
    // await prisma.algorithmBundle.deleteMany({})
    // console.log('✨ Cleared existing algorithm bundles')

    // Create demo bundles
    for (const bundle of demoBundles) {
      const created = await prisma.algorithmBundle.create({
        data: bundle
      })
      console.log(`✅ Created bundle: ${created.name}`)
    }

    console.log(`\n🎉 Successfully seeded ${demoBundles.length} algorithm bundles!`)
    console.log('\n📝 Next steps:')
    console.log('   1. Visit /simulation/algorithms to view and manage bundles')
    console.log('   2. Assign bundles to specific factories')
    console.log('   3. Set an active bundle for each factory')
    console.log('   4. Replace TypeScript paths with Python script paths as you develop them')

  } catch (error) {
    console.error('❌ Error seeding algorithm bundles:', error)
    throw error
  }
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
