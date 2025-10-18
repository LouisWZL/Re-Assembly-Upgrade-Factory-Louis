import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Batch update endpoint for simulation state
 * Reduces database load by batching multiple updates into single transactions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, updates } = body

    if (!type || !Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    let result

    switch (type) {
      case 'phase':
        // Batch update phases
        result = await batchUpdatePhases(updates)
        break

      case 'completion':
        // Batch update completions
        result = await batchUpdateCompletions(updates)
        break

      case 'progress':
        // Batch update progress (optional - can be skipped for performance)
        result = await batchUpdateProgress(updates)
        break

      default:
        return NextResponse.json(
          { error: `Unknown update type: ${type}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      type,
      count: updates.length,
      ...result
    })
  } catch (error: any) {
    console.error('Batch update error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to process batch update',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}

/**
 * Batch update order phases
 */
async function batchUpdatePhases(updates: Array<{ id: string; phase: string }>) {
  // Use transaction for atomic updates
  const results = await prisma.$transaction(
    updates.map(update =>
      prisma.auftrag.update({
        where: { id: update.id },
        data: {
          phase: update.phase,
          updatedAt: new Date()
        },
        select: { id: true, phase: true }
      })
    )
  )

  return { updated: results.length }
}

/**
 * Batch update order completions
 */
async function batchUpdateCompletions(updates: Array<{ id: string; completedAt: Date }>) {
  const results = await prisma.$transaction(
    updates.map(update =>
      prisma.auftrag.update({
        where: { id: update.id },
        data: {
          phase: 'ABGESCHLOSSEN',
          updatedAt: new Date(update.completedAt)
        },
        select: { id: true }
      })
    )
  )

  return { completed: results.length }
}

/**
 * Batch update progress (optional - can be memory-only)
 */
async function batchUpdateProgress(updates: Array<{ id: string; progress: number; currentStation: string }>) {
  // For now, skip progress updates to DB - they change too frequently
  // Keep them in memory only
  return { skipped: updates.length, reason: 'Progress updates are memory-only' }
}
