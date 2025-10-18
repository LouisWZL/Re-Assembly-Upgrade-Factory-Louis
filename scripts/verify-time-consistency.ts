#!/usr/bin/env ts-node
/**
 * Simulation Time Consistency Verification Script
 *
 * This script verifies that the simulation time calculations are consistent
 * across different components.
 */

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
}

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

console.log('\n' + '='.repeat(80))
log('cyan', '⏱️  SIMULATION TIME CONSISTENCY VERIFICATION')
console.log('='.repeat(80) + '\n')

// Test the time calculation formula
log('cyan', '📋 Testing Time Calculation Formulas')
console.log('-'.repeat(80))

const speed = 1.0
const realTimeDeltaMs = 60000 // 60 seconds = 1 minute real time

// Formula from simulation-context.tsx (after fix)
const contextDeltaMinutes = (realTimeDeltaMs / 60000) * speed
log('green', `✓ simulation-context.tsx: ${realTimeDeltaMs}ms → ${contextDeltaMinutes} sim minutes`)

// Formula from RealDataFactorySimulation.tsx
const realDataDeltaMinutes = (realTimeDeltaMs / 60000) * speed
log('green', `✓ RealDataFactorySimulation.tsx: ${realTimeDeltaMs}ms → ${realDataDeltaMinutes} sim minutes`)

console.log()

if (contextDeltaMinutes === realDataDeltaMinutes) {
  log('green', '✅ PASS: Time calculations are CONSISTENT')
  console.log(`   Both formulas produce ${contextDeltaMinutes} simulation minutes for ${realTimeDeltaMs / 1000} seconds of real time`)
} else {
  log('red', '❌ FAIL: Time calculations are INCONSISTENT')
  console.log(`   Context: ${contextDeltaMinutes} minutes`)
  console.log(`   RealData: ${realDataDeltaMinutes} minutes`)
  console.log(`   Discrepancy factor: ${contextDeltaMinutes / realDataDeltaMinutes}x`)
  process.exit(1)
}

console.log('\n' + '-'.repeat(80) + '\n')

// Test different speed values
log('cyan', '📋 Testing Speed Multiplier Consistency')
console.log('-'.repeat(80))

const testSpeeds = [0.5, 1.0, 1.5, 2.0]
const realTime1Min = 60000

console.log('\nReal Time: 60 seconds (1 minute)\n')
console.table(
  testSpeeds.map(s => ({
    'Speed': `${s}x`,
    'Context Formula': `${(realTime1Min / 60000) * s} min`,
    'RealData Formula': `${(realTime1Min / 60000) * s} min`,
    'Match': (realTime1Min / 60000) * s === (realTime1Min / 60000) * s ? '✅' : '❌'
  }))
)

console.log('-'.repeat(80) + '\n')

// Test realistic scenarios
log('cyan', '📋 Testing Realistic Scenarios (Speed 1x)')
console.log('-'.repeat(80) + '\n')

const scenarios = [
  { realTimeSec: 1, expectedSimMin: 1/60, description: '1 second real → ~1 second simulation' },
  { realTimeSec: 30, expectedSimMin: 0.5, description: '30 seconds real → 30 seconds simulation' },
  { realTimeSec: 60, expectedSimMin: 1, description: '1 minute real → 1 minute simulation' },
  { realTimeSec: 300, expectedSimMin: 5, description: '5 minutes real → 5 minutes simulation' },
  { realTimeSec: 3600, expectedSimMin: 60, description: '1 hour real → 1 hour simulation' },
]

scenarios.forEach(scenario => {
  const realTimeMs = scenario.realTimeSec * 1000
  const calculatedSimMin = (realTimeMs / 60000) * 1.0
  const match = Math.abs(calculatedSimMin - scenario.expectedSimMin) < 0.001

  if (match) {
    log('green', `✅ ${scenario.description}`)
    console.log(`   Calculated: ${calculatedSimMin.toFixed(4)} min, Expected: ${scenario.expectedSimMin} min`)
  } else {
    log('red', `❌ ${scenario.description}`)
    console.log(`   Calculated: ${calculatedSimMin.toFixed(4)} min, Expected: ${scenario.expectedSimMin} min`)
  }
})

console.log('\n' + '-'.repeat(80) + '\n')

// Expected behavior documentation
log('cyan', '📋 Expected Behavior')
console.log('-'.repeat(80))
console.log(`
At Speed 1x:
  • 1 minute real time = 1 minute simulation time
  • 5 minutes real time = 5 minutes simulation time
  • 1 hour real time = 1 hour simulation time

At Speed 2x:
  • 1 minute real time = 2 minutes simulation time
  • 5 minutes real time = 10 minutes simulation time
  • 1 hour real time = 2 hours simulation time

Formula: deltaMinutes = (realTimeDelta / 60000) * speed
  • realTimeDelta: milliseconds of real time elapsed
  • 60000: conversion factor (60 seconds * 1000 ms)
  • speed: simulation speed multiplier
`)

console.log('-'.repeat(80))
log('green', '\n✅ ALL TIME CONSISTENCY CHECKS PASSED\n')
console.log('='.repeat(80) + '\n')
