/**
 * Test script to populate queues with sample data
 * Run with: npx tsx scripts/test-queues.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Finding factory and orders...')

  // Get first factory
  const factory = await prisma.reassemblyFactory.findFirst()
  if (!factory) {
    console.error('❌ No factory found. Please create a factory first.')
    return
  }

  console.log(`✅ Found factory: ${factory.name} (${factory.id})`)

  // Get or create queue config
  let queueConfig = await prisma.queueConfig.findUnique({
    where: { factoryId: factory.id }
  })

  if (!queueConfig) {
    console.log('📝 Creating queue config...')
    queueConfig = await prisma.queueConfig.create({
      data: {
        factoryId: factory.id,
        preAcceptanceReleaseMinutes: 5,
        preInspectionReleaseMinutes: 10,
        postInspectionReleaseMinutes: 15
      }
    })
    console.log('✅ Queue config created with wait times: 5, 10, 15 minutes')
  } else {
    console.log(`✅ Queue config exists with wait times: ${queueConfig.preAcceptanceReleaseMinutes}, ${queueConfig.preInspectionReleaseMinutes}, ${queueConfig.postInspectionReleaseMinutes} minutes`)
  }

  // Get some orders
  const orders = await prisma.auftrag.findMany({
    where: {
      factoryId: factory.id
    },
    take: 6,
    include: {
      kunde: true,
      produktvariante: {
        include: {
          produkt: true
        }
      }
    }
  })

  if (orders.length === 0) {
    console.error('❌ No orders found. Please create some orders first.')
    return
  }

  console.log(`✅ Found ${orders.length} orders`)

  // Clear existing queue entries
  console.log('🧹 Clearing existing queue entries...')
  await prisma.preAcceptanceQueue.deleteMany({})
  await prisma.preInspectionQueue.deleteMany({})
  await prisma.postInspectionQueue.deleteMany({})
  console.log('✅ Queues cleared')

  // Add orders to different queues
  console.log('📦 Adding orders to queues...')

  // Add first 2 orders to pre-acceptance queue
  // Use simulation time: queue at sim minute 0, 10, 20, etc.
  for (let i = 0; i < Math.min(2, orders.length); i++) {
    const order = orders[i]
    await prisma.preAcceptanceQueue.create({
      data: {
        orderId: order.id,
        possibleSequence: order.processSequences || {},
        processTimes: { demontage: 30 + i * 5, montage: 45 + i * 10 },
        processingOrder: i + 1,
        releaseAfterMinutes: queueConfig.preAcceptanceReleaseMinutes,
        queuedAtSimMinute: i * 10 // Stagger by 10 simulation minutes
      }
    })
    console.log(`  ✅ Added order ${order.id} to PreAcceptanceQueue (position ${i + 1}, queued at sim t=${i * 10})`)
  }

  // Add next 2 orders to pre-inspection queue
  for (let i = 2; i < Math.min(4, orders.length); i++) {
    const order = orders[i]
    await prisma.preInspectionQueue.create({
      data: {
        orderId: order.id,
        possibleSequence: order.processSequences || {},
        processTimes: { demontage: 30 + i * 5, montage: 45 + i * 10 },
        processingOrder: i - 1,
        releaseAfterMinutes: queueConfig.preInspectionReleaseMinutes,
        queuedAtSimMinute: (i - 2) * 10
      }
    })
    console.log(`  ✅ Added order ${order.id} to PreInspectionQueue (position ${i - 1}, queued at sim t=${(i - 2) * 10})`)
  }

  // Add remaining orders to post-inspection queue
  for (let i = 4; i < Math.min(6, orders.length); i++) {
    const order = orders[i]
    await prisma.postInspectionQueue.create({
      data: {
        orderId: order.id,
        possibleSequence: order.processSequences || {},
        processTimes: { demontage: 30 + i * 5, montage: 45 + i * 10 },
        processingOrder: i - 3,
        releaseAfterMinutes: queueConfig.postInspectionReleaseMinutes,
        queuedAtSimMinute: (i - 4) * 10
      }
    })
    console.log(`  ✅ Added order ${order.id} to PostInspectionQueue (position ${i - 3}, queued at sim t=${(i - 4) * 10})`)
  }

  console.log('\n✨ Done! You can now view the queues at /simulation/queues')
  console.log('💡 Tip: Click on the blue circles in the simulation to open the queue viewer')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
