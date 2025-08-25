import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db-init'

export async function POST() {
  try {
    console.log('🧹 Cleaning up duplicate data...')
    
    // Find duplicate factories
    const allFactories = await prisma.reassemblyFactory.findMany({
      include: {
        _count: {
          select: {
            baugruppentypen: true,
            baugruppen: true,
            produkte: true,
            auftraege: true
          }
        }
      }
    })
    
    console.log('Found factories:', allFactories.map(f => `${f.name} (ID: ${f.id})`))
    
    // Group by name to find duplicates
    const factoryGroups = allFactories.reduce((groups, factory) => {
      const name = factory.name
      if (!groups[name]) {
        groups[name] = []
      }
      groups[name].push(factory)
      return groups
    }, {} as Record<string, typeof allFactories>)
    
    let cleaned = {
      factories: 0,
      baugruppentypen: 0,
      baugruppen: 0,
      produkte: 0,
      auftraege: 0
    }
    
    // Clean up duplicates
    for (const [name, factories] of Object.entries(factoryGroups)) {
      if (factories.length > 1) {
        console.log(`🔍 Found ${factories.length} duplicates for factory: ${name}`)
        
        // Keep the factory with the most relationships, or the first one if equal
        const keepFactory = factories.reduce((best, current) => {
          const bestCount = best._count.baugruppentypen + best._count.baugruppen + 
                           best._count.produkte + best._count.auftraege
          const currentCount = current._count.baugruppentypen + current._count.baugruppen + 
                              current._count.produkte + current._count.auftraege
          return currentCount > bestCount ? current : best
        })
        
        const duplicatesToRemove = factories.filter(f => f.id !== keepFactory.id)
        console.log(`🎯 Keeping factory ID: ${keepFactory.id}, removing: ${duplicatesToRemove.map(f => f.id).join(', ')}`)
        
        // Move relationships from duplicates to the main factory
        for (const duplicate of duplicatesToRemove) {
          console.log(`📦 Moving relationships from duplicate ${duplicate.id}...`)
          
          // Move Baugruppentypen
          const baugruppentypen = await prisma.baugruppentyp.findMany({
            where: { factoryId: duplicate.id }
          })
          for (const bgt of baugruppentypen) {
            await prisma.baugruppentyp.update({
              where: { id: bgt.id },
              data: { factoryId: keepFactory.id }
            })
            cleaned.baugruppentypen++
          }
          
          // Move Baugruppen
          const baugruppen = await prisma.baugruppe.findMany({
            where: { factoryId: duplicate.id }
          })
          for (const bg of baugruppen) {
            await prisma.baugruppe.update({
              where: { id: bg.id },
              data: { factoryId: keepFactory.id }
            })
            cleaned.baugruppen++
          }
          
          // Move Produkte
          const produkte = await prisma.produkt.findMany({
            where: { factoryId: duplicate.id }
          })
          for (const p of produkte) {
            await prisma.produkt.update({
              where: { id: p.id },
              data: { factoryId: keepFactory.id }
            })
            cleaned.produkte++
          }
          
          // Move Aufträge
          const auftraege = await prisma.auftrag.findMany({
            where: { factoryId: duplicate.id }
          })
          for (const a of auftraege) {
            await prisma.auftrag.update({
              where: { id: a.id },
              data: { factoryId: keepFactory.id }
            })
            cleaned.auftraege++
          }
          
          // Now delete the duplicate factory
          await prisma.reassemblyFactory.delete({
            where: { id: duplicate.id }
          })
          cleaned.factories++
          
          console.log(`✅ Removed duplicate factory: ${duplicate.name} (ID: ${duplicate.id})`)
        }
      }
    }
    
    // Final verification
    const finalFactories = await prisma.reassemblyFactory.findMany()
    const finalCounts = {
      factories: await prisma.reassemblyFactory.count(),
      baugruppentypen: await prisma.baugruppentyp.count(),
      baugruppen: await prisma.baugruppe.count(),
      produkte: await prisma.produkt.count(),
      varianten: await prisma.produktvariante.count(),
      auftraege: await prisma.auftrag.count()
    }
    
    console.log('🎉 Cleanup completed successfully!')
    console.log('Remaining factories:', finalFactories.map(f => f.name))
    console.log('Final counts:', finalCounts)
    
    return NextResponse.json({
      success: true,
      message: 'Database cleanup completed',
      cleaned,
      finalCounts,
      remainingFactories: finalFactories.map(f => ({ id: f.id, name: f.name }))
    })
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Database cleanup failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}