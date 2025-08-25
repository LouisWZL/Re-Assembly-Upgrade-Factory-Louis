import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const factoryId = url.searchParams.get('factoryId')
  
  try {
    console.log('🔍 Tracing Factory Configuration data flow...')
    console.log('Factory ID requested:', factoryId)
    
    const trace: any = {
      timestamp: new Date().toISOString(),
      factoryId,
      steps: []
    }
    
    // Step 1: Test basic connection
    trace.steps.push({ step: 1, action: 'Testing database connection' })
    try {
      await prisma.$connect()
      trace.steps.push({ step: 1, result: 'SUCCESS', message: 'Connected to database' })
    } catch (error: any) {
      trace.steps.push({ step: 1, result: 'ERROR', error: error.message })
      return NextResponse.json({ trace, success: false })
    }
    
    // Step 2: Fetch all factories (same as FactorySwitcher)
    trace.steps.push({ step: 2, action: 'Fetching all factories from /api/factories logic' })
    try {
      const allFactories = await prisma.reassemblyFactory.findMany({
        include: {
          produkte: {
            include: {
              baugruppentypen: true,
              varianten: true
            }
          },
          auftraege: {
            include: {
              kunde: true,
              produktvariante: true
            }
          }
        }
      })
      
      trace.steps.push({ 
        step: 2, 
        result: 'SUCCESS', 
        factoryCount: allFactories.length,
        factories: allFactories.map(f => ({
          id: f.id,
          name: f.name,
          produktCount: f.produkte.length,
          auftragCount: f.auftraege.length
        }))
      })
      
      // Step 3: Find specific factory if factoryId provided
      if (factoryId) {
        trace.steps.push({ step: 3, action: `Looking for specific factory: ${factoryId}` })
        const targetFactory = allFactories.find(f => f.id === factoryId)
        
        if (!targetFactory) {
          trace.steps.push({ 
            step: 3, 
            result: 'ERROR', 
            message: 'Factory not found',
            availableIds: allFactories.map(f => f.id)
          })
        } else {
          trace.steps.push({ 
            step: 3, 
            result: 'SUCCESS', 
            factory: {
              id: targetFactory.id,
              name: targetFactory.name,
              produkteCount: targetFactory.produkte.length,
              auftraegeCount: targetFactory.auftraege.length
            }
          })
          
          // Step 4: Check factory's products detail
          trace.steps.push({ step: 4, action: 'Analyzing factory products' })
          const productDetails = targetFactory.produkte.map(p => ({
            id: p.id,
            bezeichnung: p.bezeichnung,
            variantenCount: p.varianten.length,
            baugruppentypenCount: p.baugruppentypen.length,
            varianten: p.varianten.map(v => ({
              id: v.id,
              bezeichnung: v.bezeichnung,
              typ: v.typ
            })),
            baugruppentypen: p.baugruppentypen.map(b => ({
              id: b.id,
              bezeichnung: b.bezeichnung
            }))
          }))
          
          trace.steps.push({ 
            step: 4, 
            result: 'SUCCESS', 
            productDetails 
          })
          
          // Step 5: Test Baugruppen API call
          trace.steps.push({ step: 5, action: 'Testing Baugruppen API logic' })
          try {
            const baugruppen = await prisma.baugruppe.findMany({
              where: { factoryId },
              include: {
                baugruppentyp: true,
                prozesse: true,
                factory: true
              },
              orderBy: {
                bezeichnung: 'asc'
              }
            })
            
            trace.steps.push({ 
              step: 5, 
              result: 'SUCCESS', 
              baugruppenCount: baugruppen.length,
              baugruppen: baugruppen.map(b => ({
                id: b.id,
                bezeichnung: b.bezeichnung,
                baugruppentyp: b.baugruppentyp?.bezeichnung || 'NO TYPE',
                prozesseCount: b.prozesse.length
              }))
            })
          } catch (error: any) {
            trace.steps.push({ step: 5, result: 'ERROR', error: error.message })
          }
        }
      }
      
      // Step 6: Check if factory has complete data for Factory Config
      if (factoryId && allFactories.length > 0) {
        const factory = allFactories.find(f => f.id === factoryId)
        if (factory) {
          trace.steps.push({ step: 6, action: 'Factory Configuration readiness check' })
          
          const readiness = {
            hasProducts: factory.produkte.length > 0,
            hasVariants: factory.produkte.some(p => p.varianten.length > 0),
            hasBaugruppentypen: factory.produkte.some(p => p.baugruppentypen.length > 0),
            productVariantCounts: factory.produkte.map(p => ({
              product: p.bezeichnung,
              variants: p.varianten.length,
              baugruppentypen: p.baugruppentypen.length
            }))
          }
          
          const isReady = readiness.hasProducts && readiness.hasVariants && readiness.hasBaugruppentypen
          
          trace.steps.push({ 
            step: 6, 
            result: isReady ? 'READY' : 'NOT_READY', 
            readiness,
            issues: [
              !readiness.hasProducts && 'No products found',
              !readiness.hasVariants && 'No product variants found', 
              !readiness.hasBaugruppentypen && 'Products not connected to Baugruppentypen'
            ].filter(Boolean)
          })
        }
      }
      
    } catch (error: any) {
      trace.steps.push({ step: 2, result: 'ERROR', error: error.message, stack: error.stack })
    }
    
    return NextResponse.json({ 
      trace, 
      success: true,
      summary: {
        databaseConnected: trace.steps.some((s: any) => s.step === 1 && s.result === 'SUCCESS'),
        factoriesFound: trace.steps.find((s: any) => s.step === 2)?.factoryCount || 0,
        targetFactoryFound: factoryId ? trace.steps.some((s: any) => s.step === 3 && s.result === 'SUCCESS') : 'N/A',
        configReadiness: trace.steps.find((s: any) => s.step === 6)?.result || 'UNKNOWN'
      }
    })
    
  } catch (error) {
    console.error('❌ Trace failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      trace: { steps: [], timestamp: new Date().toISOString() }
    }, { status: 500 })
  }
}