# ⚠️ CRITICAL COMPONENTS - DO NOT MODIFY OR DELETE ⚠️

## NEVER TOUCH THESE COMPONENTS AND THEIR FUNCTIONALITY:

### 🏭 **Product Structure Management (Produktstruktur)**
**CRITICAL - DO NOT MODIFY OR DELETE**

- **File**: `components/jointjs-product-view.tsx`
- **File**: `components/produkt-management.tsx`
- **File**: `lib/process-graph-generator.ts`
- **File**: `components/order-process-graph-viewer.tsx`
- **File**: `components/produktvariante-tab.tsx`

**Functionality that MUST remain intact:**
- ✅ Product structure editing with JointJS
- ✅ Drag & drop component linking
- ✅ Baugruppen connection management
- ✅ Visual product structure graphs
- ✅ Process step linking interface

### 🔄 **Process Structure Management (Prozessstruktur)**
**CRITICAL - DO NOT MODIFY OR DELETE**

- **File**: `components/jointjs-product-view.tsx` (process view mode)
- **File**: `lib/process-graph-generator.ts`
- **Database**: All `processGraphData*` fields in Prisma schema
- **Database**: All `processSequences` fields in Prisma schema

**Functionality that MUST remain intact:**
- ✅ Process flow visualization
- ✅ Process sequence definition
- ✅ Remanufacturing graph editing
- ✅ Assembly/disassembly process mapping
- ✅ Process time configuration

### 🏢 **Factory Configurator Core**
**CRITICAL - DO NOT MODIFY OR DELETE**

- **File**: `app/factory-configurator/[id]/page.tsx`
- **File**: `app/factory-configurator/[id]/client-page.tsx`
- **File**: `components/configurator-content.tsx`
- **File**: `components/configurator-sidebar-left.tsx`
- **File**: `components/configurator-sidebar-right.tsx`

### 🗄️ **Database Schema (Product/Process Related)**
**CRITICAL - DO NOT MODIFY OR DELETE**

```prisma
model Produkt {
  graphData       Json?               // JointJS Graph JSON data (Produktstruktur)
  processGraphData Json?              // JointJS Process Graph JSON data (Prozessstruktur)
}

model Auftrag {
  graphData             Json?                // Order-specific assembly graph
  processGraphDataBg    Json?                // Order-specific process graph (Baugruppen-Ebene)
  processGraphDataBgt   Json?                // Order-specific process graph (Baugruppentyp-Ebene)
  processSequences      Json?                // All possible process sequences (both levels)
}
```

## 🚫 MODIFICATION RULES:

### ❌ NEVER DO:
- Delete any of the files listed above
- Remove JointJS functionality
- Modify core product/process graph logic
- Change database schema for product/process graphs
- Remove process sequence functionality

### ✅ ALLOWED:
- Add NEW components that DON'T interfere with existing ones
- Add new simulation features in SEPARATE components
- Extend database schema with NEW tables/fields (don't modify existing ones)
- Create new views that use existing data (read-only)

## 🛡️ SAFEGUARD PROTOCOL:

Before making ANY changes:
1. **Read this file first**
2. **Check if changes affect listed components**
3. **If YES → STOP and ask user for explicit permission**
4. **If NO → Proceed but test existing functionality**

## 📋 TESTING CHECKLIST:

After ANY changes, verify these still work:
- [ ] Factory configurator loads without errors
- [ ] Product management table displays
- [ ] JointJS product view renders
- [ ] Process graph editing functions
- [ ] Baugruppen linking works
- [ ] Process sequences save correctly
- [ ] All APIs return data (not 500 errors)

---
**Last Updated**: 2025-08-23
**Reason**: User explicitly requested protection of Produktstruktur and Prozessstruktur functionality after database migration caused temporary API issues.