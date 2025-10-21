# Deprecated: Old Simulation System

This folder contains the **old simulation system** that has been replaced by the new queue-based RealDataFactorySimulation.

## Contents

- `simulation/` - Old simulation components including:
  - `terminierung/` - Old terminierung algorithms (terminierung-1.tsx through terminierung-8.tsx)
  - `beschaffung/` - Old beschaffung/procurement algorithms
  - `auftragsabwicklung/` - Old order processing algorithms
  - `simulation.tsx` - Old simulation main component
  - `BasicSimulation.tsx` - Old basic simulation component

- `simulation.actions.ts` - Old simulation server actions
- `simulation-modular.actions.ts` - Old modular simulation actions

## Why deprecated?

These files implemented an older simulation approach that:
- Wrote terminierung data directly to `Auftrag.terminierung` JSON field
- Did not use the queue-based scheduling system
- Did not integrate with Python scheduling scripts
- Did not support Algorithm Bundles

## Current System

The new simulation system is located in:
- `components/advanced-simulation/RealDataFactorySimulation.tsx`
- `app/actions/advanced-simulation.actions.ts`
- `app/actions/queue.actions.ts`
- `lib/scheduling/` - Python scheduling integration
- `python/terminierung/` - Python scheduling algorithms (PAP, PIP, PIPO)

The new system uses:
- Queue-based scheduling (PreAcceptanceQueue, PreInspectionQueue, PostInspectionQueue)
- Python script integration via AlgorithmBundles
- Liefertermin table for delivery dates
- Real-time simulation buffer system

**Do not use files from this deprecated folder in new development.**
