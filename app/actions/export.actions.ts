'use server'

import { prisma as db } from '@/lib/prisma'

export async function getOrdersForExport(factoryId?: string) {
  try {
    const whereCondition = factoryId ? { factoryId } : {};
    
    const orders = await db.auftrag.findMany({
      where: whereCondition,
      include: {
        kunde: true,
        produktvariante: {
          include: {
            produkt: true
          }
        },
        factory: true,
        liefertermine: true,
        stationDurations: true,
        baugruppenInstances: {
          include: {
            baugruppe: {
              include: {
                baugruppentyp: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return { success: true, data: orders };
  } catch (error) {
    console.error('Error fetching orders for export:', error);
    return { success: false, error: 'Failed to fetch orders' };
  }
}