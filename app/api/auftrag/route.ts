import { NextRequest, NextResponse } from 'next/server';
import { generateOrders, generateSingleOrderForSimulation, deleteAllOrdersForFactory } from '@/app/actions/auftrag.actions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, factoryId, count } = body;

    if (action === 'generateSingleForSimulation') {
      if (!factoryId) {
        return NextResponse.json(
          { success: false, error: 'Factory ID is required' },
          { status: 400 }
        );
      }

      const result = await generateSingleOrderForSimulation(factoryId);
      return NextResponse.json(result);
    }

    if (action === 'generateOrders') {
      if (!factoryId) {
        return NextResponse.json(
          { success: false, error: 'Factory ID is required' },
          { status: 400 }
        );
      }

      const result = await generateOrders(factoryId, count || 1);
      return NextResponse.json(result);
    }

    if (action === 'deleteAllOrders') {
      if (!factoryId) {
        return NextResponse.json(
          { success: false, error: 'Factory ID is required' },
          { status: 400 }
        );
      }

      try {
        const result = await deleteAllOrdersForFactory(factoryId);
        return NextResponse.json(result);
      } catch (error) {
        console.error('Error deleting orders:', error);
        return NextResponse.json(
          { success: false, error: 'Fehler beim Löschen der Aufträge' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in auftrag API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}