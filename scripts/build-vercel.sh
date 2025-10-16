#!/bin/bash
set -e

echo "🔧 Setting up environment for Vercel build..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set!"
    echo "Please add DATABASE_URL in Vercel Dashboard → Settings → Environment Variables"
    echo "Value should be your Supabase PostgreSQL connection string"
    exit 1
fi

echo "Database URL configured: ${DATABASE_URL:0:30}..."
echo "Node environment: $NODE_ENV"
echo "Vercel environment: ${VERCEL:-'false'}"

echo "📦 Generating Prisma client..."
npx prisma generate

echo "🔗 Using Supabase PostgreSQL database"
echo "Skipping database migrations (using existing Supabase database)"

echo "🚀 Building Next.js application..."
npx next build

echo "✅ Build completed successfully!"

# Show some build statistics
echo "📊 Build statistics:"
ls -la .next/ 2>/dev/null || echo "No .next directory found"