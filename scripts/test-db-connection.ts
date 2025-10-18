#!/usr/bin/env ts-node
/**
 * Database Connection Diagnostic Script
 *
 * This script tests the Supabase PostgreSQL connection and provides detailed diagnostics.
 * Run with: npx ts-node scripts/test-db-connection.ts
 */

import { PrismaClient } from '@prisma/client'

// ANSI color codes for better readability
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function testConnection() {
  console.log('\n' + '='.repeat(80))
  log('cyan', '🔍 DATABASE CONNECTION DIAGNOSTICS')
  console.log('='.repeat(80) + '\n')

  // Step 1: Check environment variables
  log('blue', '📋 Step 1: Environment Variables')
  console.log('-'.repeat(80))

  const dbUrl = process.env.DATABASE_URL
  const directUrl = process.env.DIRECT_URL
  const nodeEnv = process.env.NODE_ENV || 'development'

  console.log(`  NODE_ENV:           ${nodeEnv}`)
  console.log(`  DATABASE_URL set:   ${!!dbUrl ? '✅ Yes' : '❌ No'}`)
  console.log(`  DIRECT_URL set:     ${!!directUrl ? '✅ Yes' : '❌ No'}`)

  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl)
      console.log(`\n  DATABASE_URL Details:`)
      console.log(`    Protocol:   ${parsed.protocol}`)
      console.log(`    Username:   ${parsed.username}`)
      console.log(`    Password:   ${parsed.password ? '***' + parsed.password.slice(-4) : 'NOT SET'}`)
      console.log(`    Hostname:   ${parsed.hostname}`)
      console.log(`    Port:       ${parsed.port || '5432 (default)'}`)
      console.log(`    Database:   ${parsed.pathname.slice(1)}`)

      // Validate Supabase session pooler format
      if (parsed.hostname.includes('pooler.supabase.com')) {
        log('green', '    ✅ Using Supabase connection pooler (recommended for serverless)')
      } else if (parsed.hostname.includes('supabase.co')) {
        log('yellow', '    ⚠️  Using Supabase direct connection (consider using pooler)')
      } else {
        log('yellow', '    ⚠️  Not using Supabase hostname')
      }
    } catch (error: any) {
      log('red', `  ❌ Invalid DATABASE_URL format: ${error.message}`)
      process.exit(1)
    }
  } else {
    log('red', '  ❌ DATABASE_URL is not set!')
    log('yellow', '\n  Set DATABASE_URL in your .env file:')
    console.log('     DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-X-region.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1"')
    process.exit(1)
  }

  console.log('\n' + '-'.repeat(80) + '\n')

  // Step 2: Initialize Prisma Client
  log('blue', '📋 Step 2: Initialize Prisma Client')
  console.log('-'.repeat(80))

  let prisma: PrismaClient
  try {
    console.log('  Creating Prisma Client instance...')
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    })
    log('green', '  ✅ Prisma Client created successfully')
  } catch (error: any) {
    log('red', `  ❌ Failed to create Prisma Client: ${error.message}`)
    process.exit(1)
  }

  console.log('\n' + '-'.repeat(80) + '\n')

  // Step 3: Test connection
  log('blue', '📋 Step 3: Test Database Connection')
  console.log('-'.repeat(80))

  try {
    console.log('  Attempting to connect...')
    const startTime = Date.now()
    await prisma.$connect()
    const duration = Date.now() - startTime
    log('green', `  ✅ Connected successfully in ${duration}ms`)
  } catch (error: any) {
    log('red', `  ❌ Connection failed: ${error.message}`)
    console.log(`\n  Error Details:`)
    console.log(`    Code:    ${error.code || 'N/A'}`)
    console.log(`    Message: ${error.message}`)

    if (error.meta) {
      console.log(`    Meta:    ${JSON.stringify(error.meta, null, 2)}`)
    }

    // Provide specific troubleshooting advice
    console.log('\n  Troubleshooting:')
    if (error.code === 'P1001') {
      log('yellow', '    → Cannot reach database server')
      console.log('      - Check if your internet connection is working')
      console.log('      - Verify the hostname in DATABASE_URL is correct')
      console.log('      - Check if Supabase project is active and not paused')
    } else if (error.code === 'P1002') {
      log('yellow', '    → Database server timeout')
      console.log('      - Your network may be blocking the connection')
      console.log('      - Try using session pooler instead of direct connection')
    } else if (error.code === 'P1003') {
      log('yellow', '    → Database does not exist')
      console.log('      - Verify the database name in DATABASE_URL')
    } else if (error.code?.startsWith('28')) {
      log('yellow', '    → Authentication failed')
      console.log('      - Check username and password in DATABASE_URL')
      console.log('      - Verify the password is URL-encoded if it contains special characters')
    }

    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n' + '-'.repeat(80) + '\n')

  // Step 4: Test query execution
  log('blue', '📋 Step 4: Test Query Execution')
  console.log('-'.repeat(80))

  try {
    console.log('  Running test query: SELECT version()...')
    const startTime = Date.now()
    const result = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`
    const duration = Date.now() - startTime

    log('green', `  ✅ Query executed successfully in ${duration}ms`)
    if (result && result[0]?.version) {
      console.log(`  PostgreSQL version: ${result[0].version.split(' ')[0]} ${result[0].version.split(' ')[1]}`)
    }
  } catch (error: any) {
    log('red', `  ❌ Query execution failed: ${error.message}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n' + '-'.repeat(80) + '\n')

  // Step 5: Check schema/tables
  log('blue', '📋 Step 5: Check Database Schema')
  console.log('-'.repeat(80))

  try {
    console.log('  Checking for ReassemblyFactory table...')
    const startTime = Date.now()
    const count = await prisma.reassemblyFactory.count()
    const duration = Date.now() - startTime

    log('green', `  ✅ Table exists and is accessible (${duration}ms)`)
    console.log(`  Found ${count} factory records`)

    if (count === 0) {
      log('yellow', '  ⚠️  Database is empty. You may need to run: npm run db:seed')
    }
  } catch (error: any) {
    log('red', `  ❌ Table check failed: ${error.message}`)
    console.log(`\n  Error Details:`)
    console.log(`    Code: ${error.code || 'N/A'}`)

    if (error.code === 'P2021' || error.code === '42P01') {
      log('yellow', '\n  → Schema not applied. Run migrations:')
      console.log('      npx prisma db push')
      console.log('      or')
      console.log('      npx prisma migrate deploy')
    }
  }

  console.log('\n' + '-'.repeat(80) + '\n')

  // Step 6: Final connection check
  log('blue', '📋 Step 6: Final Connection Check')
  console.log('-'.repeat(80))

  try {
    console.log('  Testing connection state...')
    // Simple query to verify connection is still alive
    await prisma.$queryRaw`SELECT 1 as test`
    log('green', '  ✅ Connection is healthy and responsive')
  } catch (error) {
    log('yellow', '  ⚠️  Connection may have been lost')
  }

  // Cleanup
  await prisma.$disconnect()

  console.log('\n' + '='.repeat(80))
  log('green', '✅ DATABASE CONNECTION TEST COMPLETE')
  console.log('='.repeat(80) + '\n')
}

// Run the test
testConnection().catch((error) => {
  log('red', `\n❌ Unexpected error: ${error.message}`)
  console.error(error)
  process.exit(1)
})
