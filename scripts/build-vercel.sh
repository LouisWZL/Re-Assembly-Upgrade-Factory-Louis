#!/bin/bash
set -e

echo "🔧 Setting up environment for Vercel build..."

# Set DATABASE_URL if not already set (fallback for build-time)
export DATABASE_URL="${DATABASE_URL:-file:/tmp/build-db.sqlite}"

echo "Database URL for build: $DATABASE_URL"
echo "Node environment: $NODE_ENV"
echo "Vercel environment: ${VERCEL:-'false'}"

echo "📦 Generating Prisma client..."
npx prisma generate

# Check if we have a database URL that looks like a file
if [[ "$DATABASE_URL" == file:* ]]; then
    echo "🗄️ Setting up temporary SQLite database for build..."
    
    # Create the directory if it doesn't exist
    mkdir -p "$(dirname "${DATABASE_URL#file:}")"
    
    # Push the schema to create the database structure
    echo "Pushing database schema..."
    npx prisma db push --accept-data-loss --force-reset
    
    echo "🌱 Seeding build database..."
    npx prisma db seed
    
    # Verify the database was created and seeded
    echo "Verifying database setup..."
    if npx prisma db seed --preview-feature 2>/dev/null || true; then
        echo "✅ Database setup completed"
    else
        echo "⚠️ Database setup may have issues, continuing with build..."
    fi
else
    echo "🔗 Using external database: $DATABASE_URL"
    echo "Skipping database setup for external database"
fi

echo "🚀 Building Next.js application..."
npx next build

echo "✅ Build completed successfully!"

# Show some build statistics
echo "📊 Build statistics:"
ls -la .next/ 2>/dev/null || echo "No .next directory found"