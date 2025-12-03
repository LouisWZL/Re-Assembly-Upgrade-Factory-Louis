/**
 * Script to clear all queue entries from the database
 * Run with: npx ts-node scripts/clear-queues.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearAllQueues() {
  console.log('🧹 Clearing all queue entries...')

  try {
    // Delete all entries from all three queues
    const preAcceptanceResult = await prisma.preAcceptanceQueue.deleteMany({})
    console.log(`✅ Deleted ${preAcceptanceResult.count} entries from PreAcceptanceQueue`)

    const preInspectionResult = await prisma.preInspectionQueue.deleteMany({})
    console.log(`✅ Deleted ${preInspectionResult.count} entries from PreInspectionQueue`)

    const postInspectionResult = await prisma.postInspectionQueue.deleteMany({})
    console.log(`✅ Deleted ${postInspectionResult.count} entries from PostInspectionQueue`)

    // Reset batch start times in QueueConfig
    const queueConfigResult = await prisma.queueConfig.updateMany({
      data: {
        preAcceptanceBatchStartSimMinute: null,
        preInspectionBatchStartSimMinute: null,
        postInspectionBatchStartSimMinute: null,
      }
    })
    console.log(`✅ Reset ${queueConfigResult.count} QueueConfig batch start times`)

    console.log('✨ All queues cleared successfully!')
    console.log('👉 You can now restart the simulation with fresh queue entries')
  } catch (error) {
    console.error('❌ Error clearing queues:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

clearAllQueues()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
