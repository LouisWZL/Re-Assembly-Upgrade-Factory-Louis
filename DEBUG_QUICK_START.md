# Database Debugging - Quick Start

## Test Database Connection

Run the diagnostic script to test your Supabase connection:

```bash
npm run db:test
```

This will:
- ✅ Validate environment variables
- ✅ Check DATABASE_URL format
- ✅ Test connection (with timing)
- ✅ Execute test queries
- ✅ Verify schema exists
- ✅ Provide specific error troubleshooting

## Run with Debug Logging

Start the dev server with detailed database logs:

```bash
npm run dev:debug
```

You'll see detailed logs like:
```
[DB-DEBUG] Environment check: { NODE_ENV: 'development', ... }
[DB-DEBUG] Parsed DATABASE_URL: { hostname: 'aws-1-eu-central-1.pooler.supabase.com', ... }
[DB-INFO] 🔧 Initializing Prisma Client...
[DB-INFO] 🔌 Connection attempt 1/3...
[DB-INFO] ✅ Database connected successfully in 261ms
[DB-INFO] ✅ Database query successful in 68ms (found 3 factories)
[DB-INFO] 🎉 Database initialization complete in 329ms
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run db:test` | Test database connection with diagnostics |
| `npm run dev:debug` | Start dev server with debug logs |
| `npm run dev` | Start dev server (normal mode) |
| `npm run db:seed` | Seed the database |
| `npx prisma db push` | Apply schema to database |
| `npx prisma studio` | Open Prisma Studio GUI |

## Quick Troubleshooting

### Connection Failed?

1. **Test the connection:**
   ```bash
   npm run db:test
   ```

2. **Check environment variables:**
   ```bash
   cat .env | grep DATABASE_URL
   ```

3. **Verify Supabase project:**
   - Login to Supabase Dashboard
   - Check if project is active (not paused)
   - Verify connection string matches

### Schema Missing?

```bash
npx prisma db push
```

### Database Empty?

```bash
npm run db:seed
```

### Still Having Issues?

Enable debug mode and check logs:
```bash
npm run dev:debug
```

Look for error codes in the output:
- **P1001**: Cannot reach database
- **P1003**: Database doesn't exist
- **28xxx**: Authentication failed

See `DEBUGGING.md` for full error reference.

## Database Configuration

Your `.env` should contain:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

✅ Using **Session Pooler** (recommended for performance and IPv4 compatibility)

## Files Modified

Enhanced debugging in:
- `lib/db-init.ts` - Enhanced logging and error handling
- `scripts/test-db-connection.ts` - Diagnostic script
- `.env` - Updated connection URLs

## Next Steps

1. Run `npm run db:test` to verify connection
2. If successful, run `npm run dev` to start the app
3. If issues persist, run `npm run dev:debug` for detailed logs
4. Check `DEBUGGING.md` for comprehensive troubleshooting guide
