#!/usr/bin/env node

// Simple script to set up database environment for local development
console.log('\x1b[32m✅ Using local SQLite database at prisma/dev.db\x1b[0m')
console.log('   Tip: delete prisma/dev.db to reset the simulation data.')

// Set environment variable for SQLite
process.env.DATABASE_URL = 'file:./prisma/dev.db'
