import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type QueueStage = 'pap' | 'pip' | 'pipo'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const factoryId = url.searchParams.get('factoryId')

    if (!factoryId) {
      return NextResponse.json(
        { error: 'Missing required parameter factoryId' },
        { status: 400 }
      )
    }

    // Load all three queues with orders
    const [papQueue, pipQueue, pipoQueue] = await Promise.all([
      prisma.preAcceptanceQueue.findMany({
        where: { order: { factoryId } },
        include: {
          order: {
            select: {
              id: true,
              dispatcherOrderPreAcceptance: true,
            },
          },
        },
        orderBy: { processingOrder: 'asc' },
      }),
      prisma.preInspectionQueue.findMany({
        where: { order: { factoryId } },
        include: {
          order: {
            select: {
              id: true,
              dispatcherOrderPreInspection: true,
            },
          },
        },
        orderBy: { processingOrder: 'asc' },
      }),
      prisma.postInspectionQueue.findMany({
        where: { order: { factoryId } },
        include: {
          order: {
            select: {
              id: true,
              dispatcherOrderPostInspection: true,
            },
          },
        },
        orderBy: { processingOrder: 'asc' },
      }),
    ])

    // Helper to build stage data
    const buildStageData = (
      queue: any[],
      dispatcherField: 'dispatcherOrderPreAcceptance' | 'dispatcherOrderPreInspection' | 'dispatcherOrderPostInspection'
    ) => {
      const hasRun = queue.some((entry) => entry.order[dispatcherField] !== null)

      const orders = queue.map((entry, index) => {
        const queuePosition = entry.processingOrder ?? index + 1
        const optimizedPosition = entry.order[dispatcherField]
        const delta = optimizedPosition !== null ? optimizedPosition - queuePosition : null

        return {
          id: entry.order.id,
          queuePosition,
          optimizedPosition,
          delta,
        }
      })

      return {
        hasRun,
        queueSize: queue.length,
        orders,
      }
    }

    const result = {
      pap: buildStageData(papQueue, 'dispatcherOrderPreAcceptance'),
      pip: buildStageData(pipQueue, 'dispatcherOrderPreInspection'),
      pipo: buildStageData(pipoQueue, 'dispatcherOrderPostInspection'),
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[QueueMonitor] Failed to load queue monitoring data:', error)
    return NextResponse.json(
      { error: 'Failed to load queue monitoring data' },
      { status: 500 }
    )
  }
}
