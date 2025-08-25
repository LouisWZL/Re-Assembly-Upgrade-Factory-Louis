#!/usr/bin/env node

// Setup script for Vercel database initialization
console.log('🔧 Setting up Vercel database...')

// Set DATABASE_URL if not already set
if (!process.env.DATABASE_URL) {
  console.log('📝 Setting DATABASE_URL to SQLite in /tmp')
  process.env.DATABASE_URL = 'file:/tmp/production.db'
}

console.log('Environment variables:')
console.log('- NODE_ENV:', process.env.NODE_ENV)
console.log('- VERCEL:', process.env.VERCEL)
console.log('- DATABASE_URL:', process.env.DATABASE_URL)

// This script can be called during the Vercel build process
// to ensure the database is properly configured
console.log('✅ Database setup complete')