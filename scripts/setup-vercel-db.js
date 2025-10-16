#!/usr/bin/env node

/**
 * This script runs before build on Vercel to configure Prisma for PostgreSQL
 * On local development, it uses SQLite via .env.local
 */

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const isVercel = process.env.VERCEL === '1';

console.log('🔧 Setting up database configuration...');
console.log('- Environment:', isVercel ? 'Vercel (Production)' : 'Local (Development)');

// Read the current schema
let schema = fs.readFileSync(schemaPath, 'utf-8');

if (isVercel) {
  console.log('- Configuring for PostgreSQL (Supabase)...');

  // Replace datasource block for PostgreSQL
  schema = schema.replace(
    /datasource db \{[^}]+\}/s,
    `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`
  );

  console.log('✅ Schema configured for PostgreSQL');
} else {
  console.log('- Configuring for SQLite (Local)...');

  // Replace datasource block for SQLite
  schema = schema.replace(
    /datasource db \{[^}]+\}/s,
    `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`
  );

  console.log('✅ Schema configured for SQLite');
}

// Write the updated schema
fs.writeFileSync(schemaPath, schema, 'utf-8');

console.log('✅ Database configuration complete');
