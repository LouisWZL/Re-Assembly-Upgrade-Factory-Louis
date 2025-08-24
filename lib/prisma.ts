// Re-export everything from the enhanced db-config
export { prisma, ensureDatabaseInitialized, connectWithRetry } from './db-config'

// Import prisma for legacy function
import { prisma } from './db-config'

// Legacy support
export async function getPrisma() {
  return prisma
}