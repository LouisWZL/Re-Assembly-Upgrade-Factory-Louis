import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { factoryId } = body

    if (!factoryId) {
      return NextResponse.json(
        { error: 'factoryId is required' },
        { status: 400 }
      )
    }

    // Delete all scheduling logs for this factory
    const result = await prisma.schedulingLog.deleteMany({
      where: {
        factoryId,
      },
    })

    // Reset dispatcher order fields for all orders in this factory
    const updatedOrders = await prisma.auftrag.updateMany({
      where: { factoryId },
      data: {
        dispatcherOrderPreAcceptance: null,
        dispatcherOrderPreInspection: null,
        dispatcherOrderPostInspection: null,
      },
    })

    console.log(`[ClearSchedulingLogs] Deleted ${result.count} logs and reset ${updatedOrders.count} orders for factory ${factoryId}`)

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      resetOrdersCount: updatedOrders.count,
    })
  } catch (error) {
    console.error('[ClearSchedulingLogs] Failed to clear logs:', error)
    return NextResponse.json(
      { error: 'Failed to clear scheduling logs' },
      { status: 500 }
    )
  }
}
