import { PrismaClient } from '@prisma/client'
import { initializeDatabase } from './init-db'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Initialize database on first access in production
let initPromise: Promise<void> | null = null

export async function getPrisma() {
  if (process.env.VERCEL && !initPromise) {
    initPromise = initializeDatabase()
  }
  
  if (initPromise) {
    await initPromise
  }
  
  return prisma
}