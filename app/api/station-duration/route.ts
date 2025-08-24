import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      auftragId,
      stationId,
      stationName,
      stationType,
      expectedDuration,
      actualDuration,
      stochasticVariation,
      startedAt,
      completedAt
    } = body;

    const stationDuration = await prisma.stationDuration.create({
      data: {
        auftragId,
        stationId,
        stationName,
        stationType,
        expectedDuration,
        actualDuration,
        stochasticVariation,
        startedAt: new Date(startedAt),
        completedAt: new Date(completedAt)
      }
    });

    return NextResponse.json({ success: true, data: stationDuration });
  } catch (error) {
    console.error('Error saving station duration:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save station duration' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const auftragId = searchParams.get('auftragId');

    if (auftragId) {
      const durations = await prisma.stationDuration.findMany({
        where: { auftragId },
        orderBy: { createdAt: 'asc' }
      });
      return NextResponse.json({ success: true, data: durations });
    }

    const allDurations = await prisma.stationDuration.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to last 100 entries
    });

    return NextResponse.json({ success: true, data: allDurations });
  } catch (error) {
    console.error('Error fetching station durations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch station durations' },
      { status: 500 }
    );
  }
}