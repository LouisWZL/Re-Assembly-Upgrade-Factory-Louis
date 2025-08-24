#!/bin/bash
set -e

echo "🔧 Setting up environment for Vercel build..."

# Set DATABASE_URL if not already set (fallback for build-time)
export DATABASE_URL="${DATABASE_URL:-file:/tmp/build-db.sqlite}"

echo "📦 Generating Prisma client..."
npx prisma generate

# Only set up database if we're not using an external database URL
if [[ "$DATABASE_URL" == file:* ]]; then
    echo "🗄️ Setting up temporary build database..."
    npx prisma db push --accept-data-loss --force-reset
    
    echo "🌱 Seeding temporary build database..."
    npx prisma db seed
else
    echo "🔗 Using external database: $DATABASE_URL"
fi

echo "🚀 Building Next.js application..."
npx next build

echo "✅ Build completed successfully!"