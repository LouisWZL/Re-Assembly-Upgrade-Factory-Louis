// Re-export everything from the new db-init module
export { prisma, ensureDatabaseInitialized, connectWithRetry } from './db-init'

// Legacy getDatabaseConfig function for compatibility
export function getDatabaseConfig() {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    return {
      datasources: {
        db: {
          url: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:/tmp/production.db'
        }
      }
    }
  } else {
    return {
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./prisma/dev.db'
        }
      }
    }
  }
}