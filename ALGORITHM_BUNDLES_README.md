# Algorithm Bundle System - Architecture Documentation

## Overview

The Algorithm Bundle system provides a flexible, configurable approach to managing scheduling algorithms for factory simulation. Instead of hardcoding algorithm implementations, this system allows you to create, manage, and swap algorithm "bundles" that define scheduling behavior for all three stages of order processing.

## Architecture

### Three-Stage Scheduling Pipeline

The system implements a three-stage scheduling pipeline:

1. **PAP (Pre-Acceptance Processing)** - Grobterminierung
   - Initial scheduling when orders enter the system
   - Estimates delivery dates and resource requirements
   - Example algorithms: FIFO, customer priority-based, resource availability models

2. **PIP (Pre-Inspection Processing)** - Durchlaufterminierung
   - Mid-term scheduling after initial acceptance
   - Optimizes order sequences for inspection and processing
   - Example algorithms: adaptive FIFO, bottleneck-aware, deadline-driven

3. **PIPO (Post-Inspection Processing Optimization)** - Feinterminierung
   - Final scheduling optimization before production
   - Real-time adjustments based on current factory state
   - Example algorithms: shortest job first, dynamic priority, energy-efficient

### Database Schema

#### AlgorithmBundle Model

```prisma
model AlgorithmBundle {
  id               String
  name             String            // e.g., "FIFO Optimierung"
  description      String?           // Strategy explanation
  author           String?           // Creator/maintainer
  isActive         Boolean           // Only one active per factory
  factoryId        String?           // Optional factory assignment

  // PAP = Pre-Acceptance Processing
  papScriptPath    String?           // Path to Python script
  papDescription   String?           // Algorithm description

  // PIP = Pre-Inspection Processing
  pipScriptPath    String?
  pipDescription   String?

  // PIPO = Post-Inspection Processing Optimization
  pipoScriptPath   String?
  pipoDescription  String?

  factory          ReassemblyFactory?
  queueConfigs     QueueConfig[]
}
```

#### QueueConfig Model (Updated)

```prisma
model QueueConfig {
  id                    String
  factoryId             String
  algorithmBundleId     String?           // Reference to active bundle
  algorithmBundle       AlgorithmBundle?

  // Queue release timings
  preAcceptanceReleaseMinutes  Int
  preInspectionReleaseMinutes  Int
  postInspectionReleaseMinutes Int

  // Legacy script paths (deprecated - use AlgorithmBundle instead)
  preAcceptancePythonScript    String?
  preInspectionPythonScript    String?
  postInspectionPythonScript   String?
}
```

## Implementation Files

### Backend

1. **`prisma/schema.prisma`**
   - Added `AlgorithmBundle` model
   - Updated `QueueConfig` with bundle reference
   - Added relation to `ReassemblyFactory`

2. **`app/actions/algorithm-bundle.actions.ts`**
   - CRUD operations for bundles
   - `createAlgorithmBundle()`
   - `updateAlgorithmBundle()`
   - `deleteAlgorithmBundle()`
   - `getAllAlgorithmBundles()`
   - `getActiveAlgorithmBundle()`
   - `setActiveAlgorithmBundle()`
   - `cloneAlgorithmBundle()`

3. **`app/actions/queue.actions.ts`** (Updated)
   - Now fetches active AlgorithmBundle with QueueConfig
   - Includes bundle information in queue operations
   - Documented architecture in header comments

4. **`prisma/seed-algorithm-bundles.ts`**
   - Seed script with 6 demo bundles
   - Maps to existing terminierung files
   - Includes empty template for custom algorithms

### Frontend

1. **`app/simulation/algorithms/page.tsx`**
   - Complete UI for managing bundles
   - List view with active bundle highlighting
   - Create/Edit/Delete/Clone operations
   - Set active bundle per factory
   - Visual display of PAP/PIP/PIPO configurations

## Usage Guide

### 1. View Existing Bundles

Navigate to `/simulation/algorithms` to see all available algorithm bundles.

### 2. Create a New Bundle

```typescript
// Via UI: Click "Neues Bundle" button
// Via API:
const result = await createAlgorithmBundle({
  name: "Custom FIFO Bundle",
  description: "My custom scheduling strategy",
  author: "John Doe",
  papScriptPath: "/scripts/pap/custom-fifo.py",
  papDescription: "Custom FIFO with priority weights",
  pipScriptPath: "/scripts/pip/adaptive.py",
  pipDescription: "Adaptive scheduling based on load",
  pipoScriptPath: "/scripts/pipo/sjf.py",
  pipoDescription: "Shortest job first optimization"
})
```

### 3. Assign Bundle to Factory

Bundles can be:
- **Global**: `factoryId = null` - Available to all factories
- **Factory-specific**: `factoryId = "xyz"` - Only for specific factory

### 4. Activate a Bundle

Only one bundle can be active per factory at a time:

```typescript
await setActiveAlgorithmBundle(bundleId, factoryId)
```

Or via UI: Click "Aktivieren" button on desired bundle

### 5. Clone an Existing Bundle

To create variations:
```typescript
await cloneAlgorithmBundle(originalId, "New Bundle Name")
```

## Demo Bundles

The system includes 6 pre-configured demo bundles:

1. **Demo Bundle 1 - Standard FIFO**
   - Classic first-in-first-out across all stages
   - Simple, predictable, fair

2. **Demo Bundle 2 - Kundenprioritäts-Optimierung**
   - Prioritizes premium customers
   - Considers customer history

3. **Demo Bundle 3 - Ressourcen-Optimierung**
   - Optimizes station utilization
   - Minimizes bottlenecks

4. **Demo Bundle 4 - Komplexitäts-basiert**
   - Sorts by product complexity
   - Balances workload

5. **Demo Bundle 5 - Energieeffizient**
   - Minimizes energy consumption
   - Batch optimization

6. **Leeres Template Bundle**
   - Empty template for custom algorithms
   - All script paths null

## Migration Path

### Current State (TypeScript)
Demo bundles currently reference TypeScript files in:
```
/components/simulation/terminierung/terminierung-1.tsx
/components/simulation/terminierung/terminierung-2.tsx
...
```

### Future State (Python)
Replace with Python scripts as you develop them:
```
/scripts/pap/fifo.py
/scripts/pip/adaptive.py
/scripts/pipo/sjf.py
```

### Migration Steps

1. **Develop Python script** with same algorithm logic
2. **Test script** independently
3. **Update bundle** with new script path
4. **Verify** scheduling behavior matches expectations
5. **Activate** updated bundle

## API Reference

### Server Actions

```typescript
// Get all bundles (optionally filtered by factory)
getAllAlgorithmBundles(factoryId?: string)

// Get single bundle
getAlgorithmBundleById(id: string)

// Get active bundle for factory
getActiveAlgorithmBundle(factoryId: string)

// Create new bundle
createAlgorithmBundle(data: {
  name: string
  description?: string
  author?: string
  papScriptPath?: string
  pipScriptPath?: string
  pipoScriptPath?: string
  // ... other fields
})

// Update existing bundle
updateAlgorithmBundle(id: string, data: Partial<BundleData>)

// Delete bundle
deleteAlgorithmBundle(id: string)

// Clone bundle
cloneAlgorithmBundle(id: string, newName: string)

// Set active bundle
setActiveAlgorithmBundle(bundleId: string, factoryId: string)
```

## Best Practices

### Bundle Naming
- Use descriptive names that indicate strategy
- Include version numbers for iterations
- Examples: "FIFO v1.0", "ML-based Optimizer Beta"

### Script Paths
- Use absolute paths from project root
- Organize by stage: `/scripts/pap/`, `/scripts/pip/`, `/scripts/pipo/`
- Use meaningful filenames: `fifo.py`, `priority-based.py`

### Testing
1. Create bundle with test script paths
2. Run simulation with small dataset
3. Verify KPIs and behavior
4. Compare with baseline bundles
5. Activate for production

### Version Control
- Keep algorithm scripts in git
- Document algorithm changes
- Tag bundle versions
- Use clone feature for experimentation

## Educational Benefits

This architecture is designed for educational purposes:

1. **Modularity**: Students can focus on one algorithm stage at a time
2. **Comparison**: Easy to compare different algorithmic approaches
3. **Experimentation**: Clone bundles to test variations
4. **Tracking**: Author field tracks student contributions
5. **Documentation**: Description fields encourage algorithm documentation

## Troubleshooting

### Bundle Not Appearing
- Check `factoryId` filter (global bundles have `factoryId = null`)
- Refresh page after creating bundle

### Changes Not Taking Effect
- Verify bundle is set as active
- Check that only one bundle is active per factory
- Restart simulation if needed

### Script Path Errors
- Verify paths are absolute from project root
- Check file permissions
- Ensure Python scripts have correct syntax

## Future Enhancements

Potential improvements to the system:

1. **Python Script Execution**
   - Implement Python subprocess execution
   - Pass order data as JSON
   - Parse optimized sequences

2. **Algorithm Metrics**
   - Track performance per bundle
   - KPI comparisons
   - A/B testing framework

3. **Visual Algorithm Editor**
   - No-code algorithm builder
   - Drag-and-drop rules
   - Visual debugging

4. **Bundle Marketplace**
   - Share bundles between users
   - Rate and review algorithms
   - Import/export functionality

5. **Real-time Monitoring**
   - Live bundle performance dashboard
   - Auto-switch based on KPIs
   - Alert on degraded performance

## Summary

The Algorithm Bundle system transforms scheduling from hardcoded logic to a flexible, configurable architecture. This enables:

- **Easy algorithm swapping** without code changes
- **Educational experimentation** with different strategies
- **Factory-specific optimization** with custom bundles
- **Clear separation** between algorithm logic and execution framework
- **Scalable architecture** ready for Python integration

For questions or contributions, see the main project documentation.
