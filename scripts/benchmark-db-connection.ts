import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface BenchmarkResult {
  name: string
  iterations: number
  totalTime: number
  avgTime: number
  minTime: number
  maxTime: number
  stdDev: number
}

function log(color: string, message: string) {
  const colors: Record<string, string> = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  }
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function separator() {
  console.log('-'.repeat(80))
}

function calculateStats(times: number[]): { avg: number; min: number; max: number; stdDev: number } {
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length
  const stdDev = Math.sqrt(variance)

  return { avg, min, max, stdDev }
}

async function benchmarkConnection(iterations: number = 10): Promise<BenchmarkResult> {
  log('blue', `\n📊 Benchmarking Connection Time (${iterations} iterations)...`)
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const client = new PrismaClient()
    const start = performance.now()
    await client.$connect()
    const end = performance.now()
    await client.$disconnect()
    times.push(end - start)
    process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`)
  }
  console.log()

  const stats = calculateStats(times)
  const totalTime = times.reduce((a, b) => a + b, 0)

  return {
    name: 'Connection Time',
    iterations,
    totalTime,
    avgTime: stats.avg,
    minTime: stats.min,
    maxTime: stats.max,
    stdDev: stats.stdDev
  }
}

async function benchmarkSimpleQuery(iterations: number = 50): Promise<BenchmarkResult> {
  log('blue', `\n📊 Benchmarking Simple Query (${iterations} iterations)...`)
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await prisma.$queryRaw`SELECT 1`
    const end = performance.now()
    times.push(end - start)
    process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`)
  }
  console.log()

  const stats = calculateStats(times)
  const totalTime = times.reduce((a, b) => a + b, 0)

  return {
    name: 'Simple Query (SELECT 1)',
    iterations,
    totalTime,
    avgTime: stats.avg,
    minTime: stats.min,
    maxTime: stats.max,
    stdDev: stats.stdDev
  }
}

async function benchmarkTableRead(iterations: number = 30): Promise<BenchmarkResult> {
  log('blue', `\n📊 Benchmarking Table Read (${iterations} iterations)...`)
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await prisma.reassemblyFactory.findMany({ take: 10 })
    const end = performance.now()
    times.push(end - start)
    process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`)
  }
  console.log()

  const stats = calculateStats(times)
  const totalTime = times.reduce((a, b) => a + b, 0)

  return {
    name: 'Table Read (findMany)',
    iterations,
    totalTime,
    avgTime: stats.avg,
    minTime: stats.min,
    maxTime: stats.max,
    stdDev: stats.stdDev
  }
}

async function benchmarkComplexQuery(iterations: number = 20): Promise<BenchmarkResult> {
  log('blue', `\n📊 Benchmarking Complex Query with Joins (${iterations} iterations)...`)
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await prisma.reassemblyFactory.findMany({
      take: 5,
      include: {
        auftraege: {
          take: 5,
          include: {
            produktvariante: true
          }
        },
        baugruppen: {
          take: 5
        },
        produkte: {
          take: 5
        }
      }
    })
    const end = performance.now()
    times.push(end - start)
    process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`)
  }
  console.log()

  const stats = calculateStats(times)
  const totalTime = times.reduce((a, b) => a + b, 0)

  return {
    name: 'Complex Query (with relations)',
    iterations,
    totalTime,
    avgTime: stats.avg,
    minTime: stats.min,
    maxTime: stats.max,
    stdDev: stats.stdDev
  }
}

async function benchmarkTransaction(iterations: number = 20): Promise<BenchmarkResult> {
  log('blue', `\n📊 Benchmarking Transactions (${iterations} iterations)...`)
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await prisma.$transaction([
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw`SELECT 2`,
      prisma.$queryRaw`SELECT 3`
    ])
    const end = performance.now()
    times.push(end - start)
    process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`)
  }
  console.log()

  const stats = calculateStats(times)
  const totalTime = times.reduce((a, b) => a + b, 0)

  return {
    name: 'Transaction (3 queries)',
    iterations,
    totalTime,
    avgTime: stats.avg,
    minTime: stats.min,
    maxTime: stats.max,
    stdDev: stats.stdDev
  }
}

async function benchmarkLatency(samples: number = 100): Promise<BenchmarkResult> {
  log('blue', `\n📊 Measuring Network Latency (${samples} samples)...`)
  const times: number[] = []

  for (let i = 0; i < samples; i++) {
    const start = performance.now()
    await prisma.$queryRaw`SELECT NOW()`
    const end = performance.now()
    times.push(end - start)
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r  Progress: ${i + 1}/${samples}`)
    }
  }
  console.log()

  const stats = calculateStats(times)
  const totalTime = times.reduce((a, b) => a + b, 0)

  return {
    name: 'Network Latency',
    iterations: samples,
    totalTime,
    avgTime: stats.avg,
    minTime: stats.min,
    maxTime: stats.max,
    stdDev: stats.stdDev
  }
}

function printResults(results: BenchmarkResult[]) {
  console.log('\n')
  log('cyan', '='.repeat(80))
  log('cyan', '📈 BENCHMARK RESULTS')
  log('cyan', '='.repeat(80))

  results.forEach(result => {
    console.log()
    log('white', `${result.name}:`)
    separator()
    console.log(`  Iterations:     ${result.iterations}`)
    console.log(`  Total Time:     ${result.totalTime.toFixed(2)}ms`)
    log('green', `  Average:        ${result.avgTime.toFixed(2)}ms`)
    console.log(`  Minimum:        ${result.minTime.toFixed(2)}ms`)
    console.log(`  Maximum:        ${result.maxTime.toFixed(2)}ms`)
    console.log(`  Std Deviation:  ${result.stdDev.toFixed(2)}ms`)

    // Performance rating
    let rating = ''
    if (result.name.includes('Latency') || result.name.includes('Simple Query')) {
      if (result.avgTime < 50) rating = '🟢 Excellent'
      else if (result.avgTime < 100) rating = '🟡 Good'
      else if (result.avgTime < 200) rating = '🟠 Fair'
      else rating = '🔴 Slow'
    } else if (result.name.includes('Connection')) {
      if (result.avgTime < 200) rating = '🟢 Excellent'
      else if (result.avgTime < 400) rating = '🟡 Good'
      else if (result.avgTime < 800) rating = '🟠 Fair'
      else rating = '🔴 Slow'
    } else {
      if (result.avgTime < 100) rating = '🟢 Excellent'
      else if (result.avgTime < 250) rating = '🟡 Good'
      else if (result.avgTime < 500) rating = '🟠 Fair'
      else rating = '🔴 Slow'
    }
    console.log(`  Rating:         ${rating}`)
  })

  console.log()
  log('cyan', '='.repeat(80))
}

async function runBenchmark() {
  console.log()
  log('cyan', '='.repeat(80))
  log('cyan', '🚀 DATABASE CONNECTION BENCHMARK')
  log('cyan', '='.repeat(80))

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    log('red', '\n❌ DATABASE_URL is not set!')
    process.exit(1)
  }

  // Parse and display connection info (masked)
  try {
    const url = new URL(dbUrl)
    log('white', '\nConnection Info:')
    separator()
    console.log(`  Host:     ${url.hostname}`)
    console.log(`  Port:     ${url.port}`)
    console.log(`  Database: ${url.pathname.substring(1)}`)
    console.log(`  SSL Mode: ${url.searchParams.get('sslmode') || 'default'}`)
    console.log(`  Pooler:   ${url.searchParams.get('pgbouncer') || 'false'}`)
    console.log()
  } catch (error) {
    log('yellow', '\n⚠️  Could not parse DATABASE_URL')
  }

  const results: BenchmarkResult[] = []

  try {
    // Connect to database
    log('blue', '\n🔌 Connecting to database...')
    await prisma.$connect()
    log('green', '✅ Connected successfully\n')

    // Run benchmarks
    results.push(await benchmarkLatency(100))
    results.push(await benchmarkConnection(10))
    results.push(await benchmarkSimpleQuery(50))
    results.push(await benchmarkTableRead(30))
    results.push(await benchmarkComplexQuery(20))
    results.push(await benchmarkTransaction(20))

    // Print results
    printResults(results)

    log('green', '\n✅ Benchmark completed successfully!')

  } catch (error) {
    log('red', `\n❌ Benchmark failed: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runBenchmark()
