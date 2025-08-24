#!/bin/bash
set -e

echo "🔧 Setting up environment for Vercel build..."

# Set DATABASE_URL if not already set
export DATABASE_URL="${DATABASE_URL:-file:/tmp/db.sqlite}"

echo "📦 Generating Prisma client..."
npx prisma generate

echo "🗄️ Setting up database..."
npx prisma db push --accept-data-loss --force-reset

echo "🌱 Seeding database..."
npx prisma db seed

echo "🚀 Building Next.js application..."
npx next build

echo "✅ Build completed successfully!"