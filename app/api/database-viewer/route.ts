import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const table = url.searchParams.get('table')
  const limit = parseInt(url.searchParams.get('limit') || '100')
  
  try {
    const data: any = {
      timestamp: new Date().toISOString(),
      database_url: process.env.DATABASE_URL || 'NOT SET',
      tables: {}
    }
    
    // If specific table requested
    if (table) {
      switch(table) {
        case 'factories':
          data.tables.factories = await prisma.reassemblyFactory.findMany({
            take: limit,
            include: {
              produkte: true,
              baugruppentypen: true,
              baugruppen: true
            }
          })
          break
        case 'products':
          data.tables.products = await prisma.produkt.findMany({
            take: limit,
            include: {
              varianten: true,
              baugruppentypen: true,
              factory: true
            }
          })
          break
        case 'variants':
          data.tables.variants = await prisma.produktvariante.findMany({
            take: limit,
            include: {
              produkt: true
            }
          })
          break
        case 'baugruppentypen':
          data.tables.baugruppentypen = await prisma.baugruppentyp.findMany({
            take: limit,
            include: {
              factory: true,
              produkte: true
            }
          })
          break
        case 'baugruppen':
          data.tables.baugruppen = await prisma.baugruppe.findMany({
            take: limit,
            include: {
              factory: true,
              baugruppentyp: true
            }
          })
          break
        case 'customers':
          data.tables.customers = await prisma.kunde.findMany({
            take: limit
          })
          break
        case 'orders':
          data.tables.orders = await prisma.auftrag.findMany({
            take: limit,
            include: {
              kunde: true,
              produktvariante: true,
              factory: true
            }
          })
          break
        default:
          return NextResponse.json({ error: 'Unknown table: ' + table }, { status: 400 })
      }
    } else {
      // Get everything (with limits)
      try {
        data.tables.factories = await prisma.reassemblyFactory.findMany({
          take: 10,
          include: {
            produkte: {
              include: {
                varianten: true,
                baugruppentypen: true
              }
            },
            baugruppentypen: true,
            baugruppen: {
              take: 5
            }
          }
        })
      } catch (e: any) {
        data.tables.factories = { error: e.message }
      }
      
      try {
        data.tables.products = await prisma.produkt.findMany({
          take: 10,
          include: {
            varianten: true,
            baugruppentypen: true,
            factory: true
          }
        })
      } catch (e: any) {
        data.tables.products = { error: e.message }
      }
      
      try {
        data.tables.baugruppentypen = await prisma.baugruppentyp.findMany({
          take: 20,
          include: {
            factory: true
          }
        })
      } catch (e: any) {
        data.tables.baugruppentypen = { error: e.message }
      }
      
      try {
        data.tables.baugruppen = await prisma.baugruppe.findMany({
          take: 20,
          include: {
            factory: true,
            baugruppentyp: true
          }
        })
      } catch (e: any) {
        data.tables.baugruppen = { error: e.message }
      }
      
      try {
        data.tables.customers = await prisma.kunde.findMany({ take: 10 })
      } catch (e: any) {
        data.tables.customers = { error: e.message }
      }
      
      try {
        data.tables.orders = await prisma.auftrag.findMany({
          take: 10,
          include: {
            kunde: true,
            produktvariante: true,
            factory: true
          }
        })
      } catch (e: any) {
        data.tables.orders = { error: e.message }
      }
      
      // Count all records
      try {
        data.counts = {
          factories: await prisma.reassemblyFactory.count(),
          products: await prisma.produkt.count(),
          variants: await prisma.produktvariante.count(),
          baugruppentypen: await prisma.baugruppentyp.count(),
          baugruppen: await prisma.baugruppe.count(),
          customers: await prisma.kunde.count(),
          orders: await prisma.auftrag.count()
        }
      } catch (e: any) {
        data.counts = { error: e.message }
      }
    }
    
    return NextResponse.json(data, {
      headers: {
        'Content-Type': 'application/json',
      }
    })
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to read database',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}