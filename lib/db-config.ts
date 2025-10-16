export { prisma, ensureDatabaseInitialized, connectWithRetry } from './db-init'

export function getDatabaseConfig() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set. Please configure your database connection.')
  }

  return {
    datasources: {
      db: {
        url,
      },
    },
  }
}
