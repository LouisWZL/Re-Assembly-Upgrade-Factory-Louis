import { PrismaClient } from '@prisma/client'
import { seedDatabase } from '../prisma/seed-functions'

// Enhanced debug logging
const DEBUG_DB = process.env.DEBUG_DB === 'true' || process.env.NODE_ENV === 'development'

function log(level: 'info' | 'error' | 'warn' | 'debug', message: string, ...args: any[]) {
  const prefix = `[DB-${level.toUpperCase()}]`
  if (level === 'debug' && !DEBUG_DB) return

  if (level === 'error') {
    console.error(prefix, message, ...args)
  } else if (level === 'warn') {
    console.warn(prefix, message, ...args)
  } else {
    console.log(prefix, message, ...args)
  }
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  const dbSource = process.env.DB_SOURCE || 'supabase'

  log('debug', 'Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    DB_SOURCE: dbSource,
    DATABASE_URL_exists: !!url,
    DATABASE_URL_length: url?.length || 0,
  })

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Please run `npm run dev` to select a database.'
    )
  }

  // Support both PostgreSQL and SQLite
  const isSQLite = url.startsWith('file:')
  const isPostgres = url.startsWith('postgresql://') || url.startsWith('postgres://')

  if (!isSQLite && !isPostgres) {
    throw new Error(
      `DATABASE_URL must start with "postgresql://", "postgres://", or "file:". Received: ${url.substring(0, 20)}…`
    )
  }

  // Validate URL format
  if (isSQLite) {
    log('debug', 'Using SQLite database:', {
      path: url.replace('file:', ''),
      provider: 'sqlite',
    })
  } else {
    try {
      const parsed = new URL(url)
      log('debug', 'Parsed DATABASE_URL:', {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        hasPassword: !!parsed.password,
        username: parsed.username,
        provider: 'postgresql',
      })
    } catch (error) {
      log('error', 'Failed to parse DATABASE_URL as valid URL:', error)
      throw new Error('DATABASE_URL is not a valid PostgreSQL URL format')
    }
  }

  return url
}

function maskDatabaseUrl(url: string): string {
  if (!url.startsWith('postgres')) {
    return url
  }

  try {
    const parsed = new URL(url)
    if (parsed.password) {
      parsed.password = '***'
    }
    return parsed.toString()
  } catch {
    return url.replace(/:\/\/.*@/, '://***@')
  }
}

function createPrismaClient(databaseUrl: string) {
  log('info', '🔧 Initializing Prisma Client...')
  log('info', '  NODE_ENV:', process.env.NODE_ENV || 'not set')
  log('info', '  VERCEL:', process.env.VERCEL ? 'yes' : 'no')
  log('info', '  DATABASE_URL:', maskDatabaseUrl(databaseUrl))
  log('debug', '  Full config:', {
    logLevel: DEBUG_DB ? 'debug' : 'info',
    connectionPooling: 'enabled (Supabase session pooler)',
  })

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: DEBUG_DB
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'info' },
          { emit: 'stdout', level: 'warn' },
        ]
      : [
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ],
  })
}

const prisma = createPrismaClient(getDatabaseUrl())

// Re-export Prisma client everywhere
export { prisma }

let isInitialized = false
let initializationPromise: Promise<boolean> | null = null

export async function connectWithRetry(retries = 3, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log('info', `🔌 Connection attempt ${attempt}/${retries}...`)
      const startTime = Date.now()
      await prisma.$connect()
      const duration = Date.now() - startTime
      log('info', `✅ Database connected successfully in ${duration}ms`)
      return true
    } catch (error: any) {
      const duration = Date.now()
      log('error', `❌ Connection attempt ${attempt}/${retries} failed after ${duration}ms`)
      log('error', `   Error code: ${error?.code || 'UNKNOWN'}`)
      log('error', `   Error message: ${error?.message || 'No message'}`)

      if (error?.meta) {
        log('error', '   Error meta:', error.meta)
      }

      // Log network-related errors
      if (error?.code === 'ECONNREFUSED') {
        log('error', '   → Database server refused connection. Check if Supabase is accessible.')
      } else if (error?.code === 'ETIMEDOUT') {
        log('error', '   → Connection timed out. Check network/firewall settings.')
      } else if (error?.code === 'ENOTFOUND') {
        log('error', '   → Host not found. Check DATABASE_URL hostname.')
      } else if (error?.code === 'P1001') {
        log('error', '   → Prisma cannot reach database server.')
      } else if (error?.code === 'P1002') {
        log('error', '   → Database server was reached but timed out.')
      } else if (error?.code === 'P1003') {
        log('error', '   → Database does not exist.')
      } else if (error?.code?.startsWith('28')) {
        log('error', '   → Authentication failed. Check username/password in DATABASE_URL.')
      }

      if (attempt === retries) {
        log('error', '🚫 All connection attempts exhausted. Database unavailable.')
        return false
      }

      log('warn', `   ⏳ Waiting ${delayMs}ms before retry...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return false
}

export async function ensureDatabaseInitialized(): Promise<boolean> {
  if (isInitialized) {
    return true
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = initializeDatabase()
  const result = await initializationPromise

  if (result) {
    isInitialized = true
  }

  return result
}

async function initializeDatabase(): Promise<boolean> {
  try {
    log('info', '🔧 Initializing database connection...')
    const startTime = Date.now()
    await prisma.$connect()
    const connectDuration = Date.now() - startTime
    log('info', `✅ Database connection established in ${connectDuration}ms`)

    // Test basic connectivity with a simple query
    log('debug', 'Testing database with basic query...')
    const queryStart = Date.now()
    let factoryCount: number
    try {
      factoryCount = await prisma.reassemblyFactory.count()
      const queryDuration = Date.now() - queryStart
      log('info', `✅ Database query successful in ${queryDuration}ms (found ${factoryCount} factories)`)
    } catch (error: any) {
      log('error', '❌ Failed to query database tables. Schema might be missing.')
      log('error', `   Error: ${error?.message || 'Unknown error'}`)
      log('error', `   Code: ${error?.code || 'N/A'}`)

      if (error?.code === 'P2021' || error?.code === '42P01') {
        log('error', '   → Table does not exist. Run migrations first:')
        log('error', '      npx prisma db push')
        log('error', '      or')
        log('error', '      npx prisma migrate deploy')
      }

      throw new Error(
        'Database schema missing. Run `npx prisma migrate deploy` (or `npx prisma db push`) against Supabase before starting the app.'
      )
    }

    // Seed if empty
    if (factoryCount === 0) {
      log('info', '🌱 Database appears empty – running seed script...')
      const seedStart = Date.now()
      try {
        await seedDatabase()
        const seedDuration = Date.now() - seedStart
        const newFactoryCount = await prisma.reassemblyFactory.count()
        log('info', `✅ Seed completed in ${seedDuration}ms. Factories: ${newFactoryCount}`)
      } catch (seedError: any) {
        log('error', '❌ Seeding failed:', seedError?.message)
        throw seedError
      }
    } else {
      log('debug', `Database already seeded (${factoryCount} factories found)`)
    }

    const totalDuration = Date.now() - startTime
    log('info', `🎉 Database initialization complete in ${totalDuration}ms`)
    return true
  } catch (error: any) {
    log('error', '❌ Database initialization failed')
    log('error', `   Error: ${error?.message || 'Unknown error'}`)
    log('error', `   Stack: ${error?.stack || 'No stack trace'}`)

    if (process.env.NODE_ENV === 'production') {
      log('warn', '   Production mode: returning false instead of throwing')
      return false
    }
    throw error
  }
}
