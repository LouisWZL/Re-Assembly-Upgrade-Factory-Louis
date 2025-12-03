import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearAndReset() {
  // Reset all dispatcherOrder fields to null
  await prisma.auftrag.updateMany({
    data: {
      dispatcherOrderPreAcceptance: null,
      dispatcherOrderPreInspection: null,
      dispatcherOrderPostInspection: null,
    }
  })
  console.log('✅ Reset all dispatcherOrder fields to null')

  // Clear all queue entries
  await prisma.preAcceptanceQueue.deleteMany({})
  await prisma.preInspectionQueue.deleteMany({})
  await prisma.postInspectionQueue.deleteMany({})
  console.log('✅ Cleared all queue entries')

  // Clear scheduling logs
  await prisma.schedulingLog.deleteMany({})
  console.log('✅ Cleared all scheduling logs')

  await prisma.$disconnect()
}

clearAndReset().catch(console.error)
