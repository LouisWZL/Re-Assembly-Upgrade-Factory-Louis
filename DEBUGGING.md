# Database Debugging Guide

This document describes the debugging features implemented for the Supabase PostgreSQL connection.

## Quick Diagnostics

Run the database connection test script:

```bash
npx ts-node scripts/test-db-connection.ts
```

This script performs comprehensive diagnostics:
- Validates environment variables
- Parses and checks DATABASE_URL format
- Tests database connectivity
- Executes test queries
- Verifies schema/tables exist
- Reports detailed error messages with troubleshooting tips

## Debug Logging

Enable detailed debug logging by setting:

```bash
DEBUG_DB=true npm run dev
```

Or add to your `.env` file:
```
DEBUG_DB=true
```

### What Gets Logged

With debug logging enabled (or in development mode), you'll see:

1. **Environment Check**: NODE_ENV, VERCEL status, DATABASE_URL presence
2. **URL Parsing**: Protocol, hostname, port, username validation
3. **Prisma Client Init**: Connection pooling info, log levels
4. **Connection Attempts**: Timing, retry logic, detailed error codes
5. **Query Execution**: Duration, result counts
6. **Database Initialization**: Seeding status, table counts

## Error Code Reference

The enhanced error logging provides specific guidance for common errors:

### Connection Errors

- **ECONNREFUSED**: Database server refused connection - check if Supabase is accessible
- **ETIMEDOUT**: Connection timed out - check network/firewall settings
- **ENOTFOUND**: Host not found - check DATABASE_URL hostname

### Prisma Errors

- **P1001**: Cannot reach database server
- **P1002**: Database server timeout
- **P1003**: Database does not exist
- **P2021/42P01**: Table does not exist - run migrations
- **28xxx**: Authentication failed - check username/password

## Database Configuration

Current setup in `.env`:

```
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
```

### Session Pooler (Recommended)

Format: `postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-X-region.pooler.supabase.com:6543/postgres`

Benefits:
- IPv4 compatible
- Connection pooling for better performance
- Recommended for serverless/edge deployments

## Debugging Files

### lib/db-init.ts

Contains enhanced logging functions and connection retry logic:
- `log()`: Structured logging with levels (info, error, warn, debug)
- `getDatabaseUrl()`: URL validation with detailed parsing
- `createPrismaClient()`: Prisma client with conditional logging
- `connectWithRetry()`: Connection retry logic with detailed error reporting
- `initializeDatabase()`: Full initialization with timing metrics

### scripts/test-db-connection.ts

Standalone diagnostic script that tests:
1. Environment variables
2. Prisma Client initialization
3. Database connection
4. Query execution
5. Schema validation
6. Connection health

## Common Issues & Solutions

### Connection Fails

1. Check if DATABASE_URL is set: `echo $DATABASE_URL`
2. Verify Supabase project is active (not paused)
3. Test network connectivity: `ping aws-1-eu-central-1.pooler.supabase.com`
4. Run diagnostic script: `npx ts-node scripts/test-db-connection.ts`

### Schema Missing

```bash
npx prisma db push
# or
npx prisma migrate deploy
```

### Empty Database

```bash
npm run db:seed
```

### Slow Queries

Enable query logging in development:
```typescript
// Already configured in lib/db-init.ts when DEBUG_DB=true
log: [
  { emit: 'event', level: 'query' },
  { emit: 'stdout', level: 'error' },
  { emit: 'stdout', level: 'info' },
  { emit: 'stdout', level: 'warn' },
]
```

## Performance Metrics

The debug logging includes timing information:
- Connection establishment time
- Query execution time
- Database initialization time
- Seeding duration

Example output:
```
[DB-INFO] 🔌 Connection attempt 1/3...
[DB-INFO] ✅ Database connected successfully in 261ms
[DB-INFO] ✅ Database query successful in 68ms (found 3 factories)
[DB-INFO] 🎉 Database initialization complete in 329ms
```

## Production Considerations

In production (`NODE_ENV=production`):
- Debug logs are disabled (unless `DEBUG_DB=true`)
- Only errors and warnings are logged
- Failed initialization returns `false` instead of throwing
- Connection pooling is enabled via Supabase session pooler
