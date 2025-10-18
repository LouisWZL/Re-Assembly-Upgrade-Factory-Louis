#!/bin/bash
set -e

echo "🔧 Setting up environment for Vercel build..."

# Diagnostic output to understand how DATABASE_URL is exposed during the build
if [ -z "${DATABASE_URL+x}" ]; then
    echo "🔍 DATABASE_URL variable is completely unset in this environment."
elif [ -z "$DATABASE_URL" ]; then
    echo "🔍 DATABASE_URL is set but empty (length 0)."
    echo "🔍 Other DATABASE* variables exported:"
    env | grep -i '^DATABASE' || echo "   (none found)"
else
    db_len=${#DATABASE_URL}
    masked_prefix="${DATABASE_URL%%@*}"
    if [[ "$DATABASE_URL" == *@* ]]; then
        masked_prefix="${masked_prefix}@***"
    else
        masked_prefix="${DATABASE_URL:0:8}***"
    fi
    echo "🔍 DATABASE_URL detected (masked): ${masked_prefix} (length ${db_len})"
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️ WARNING: DATABASE_URL is not set."
    echo "Build continues, but runtime will require a valid Supabase connection string."
else
    echo "Database URL configured (masked): ${DATABASE_URL:0:20}..."
fi
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
