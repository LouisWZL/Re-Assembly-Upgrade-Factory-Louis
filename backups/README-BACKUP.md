# Database Backup - Before Supabase Migration

## 📅 Created: $(date)

This backup was created before migrating from SQLite to Supabase PostgreSQL.

## 📁 Files in this backup:

- `dev.db.backup` - Original SQLite database file
- `schema-sqlite.prisma.backup` - Prisma schema for SQLite
- `database-backup-*.json` - Complete data export in JSON format

## 📊 Backup contains:
- **3 Factories** (Stuttgart Porsche, Ingolstadt Audi, Wolfsburg Volkswagen)
- **3 Products** with variants and relationships
- **18 Baugruppentypen** 
- **27 Baugruppen**
- **18 Processes**
- **211 Customers** 
- **13 Orders**

## 🔄 How to restore from backup:

### Option 1: Restore SQLite database
```bash
# Copy back the SQLite file
cp backups/dev.db.backup prisma/dev.db

# Copy back the schema
cp backups/schema-sqlite.prisma.backup prisma/schema.prisma

# Generate Prisma client
npx prisma generate

# Reset database
npx prisma db push --force-reset
```

### Option 2: Restore from JSON export
```bash
# Use the restore script
node scripts/restore-database.js backups/database-backup-*.json
```

## 🌐 Git Backup Branch
A complete git backup branch `backup-before-supabase` has been created and pushed to GitHub.

To restore the entire project state:
```bash
git checkout backup-before-supabase
```

## ⚠️ Important Notes
- Keep this backup safe until Supabase migration is confirmed working
- The JSON export includes all relationships and foreign keys
- Test the backup restore process before deleting anything