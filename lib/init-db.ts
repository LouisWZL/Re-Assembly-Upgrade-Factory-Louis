import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let isInitialized = false

export async function initializeDatabase() {
  if (isInitialized || process.env.NODE_ENV !== 'production') {
    return
  }

  try {
    // Push schema and seed database for production
    if (process.env.VERCEL) {
      await execAsync('npx prisma db push --accept-data-loss --force-reset')
      await execAsync('npx prisma db seed')
      console.log('✅ Database initialized and seeded on Vercel')
    }
    isInitialized = true
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    // Don't throw - let the app continue without seeded data
  }
}