# Simulation Time Consistency Fix

## Problem

Es gab eine **60-fache Zeitdiskrepanz** zwischen der angezeigten Simulationszeit und dem tatsächlichen Fortschritt der Aufträge.

### Symptom
- Die Simulationszeit (Uhrzeit-Anzeige) lief 60x schneller als der Auftragsprogress
- Aufträge schienen "eingefroren" zu sein, obwohl die Zeit weiterlief
- Fortschrittsbalken bewegten sich kaum, während Minuten/Stunden vergingen

## Root Cause

Zwei unterschiedliche Zeitberechnungen in verschiedenen Komponenten:

### Vor dem Fix

**contexts/simulation-context.tsx (Zeile 113):**
```typescript
const deltaMinutes = (realTimeDelta / 1000) * speed;
// ❌ 1 Sekunde Realzeit = 1 Minute Simulation
```

**components/advanced-simulation/RealDataFactorySimulation.tsx (Zeile 1315):**
```typescript
const deltaMinutes = (realTimeDelta / 60000) * speed;
// ✅ 60 Sekunden Realzeit = 1 Minute Simulation
```

### Diskrepanz-Faktor

| Komponente | Formel | 1 Minute Simulation = |
|-----------|--------|---------------------|
| Context (alt) | `realTimeDelta / 1000` | 1 Sekunde Realzeit |
| RealData | `realTimeDelta / 60000` | 60 Sekunden Realzeit |
| **Faktor** | | **60x Unterschied** |

## Fix

Anpassung der Zeitberechnung im `simulation-context.tsx`:

```typescript
// FIXED: Match RealDataFactorySimulation time calculation
// 60000ms (60 seconds) real time = 1 simulation minute at speed 1x
// This ensures simulationTime and order progress stay in sync
const deltaMinutes = (realTimeDelta / 60000) * speed;
```

## Auswirkungen

### Zeitverlauf bei Speed 1x

| Realzeit | Simulationszeit (alt) | Simulationszeit (neu) |
|----------|---------------------|---------------------|
| 1 Sekunde | 1 Minute | 1 Sekunde |
| 1 Minute | 60 Minuten (1 Stunde) | 1 Minute |
| 1 Stunde | 60 Stunden (2.5 Tage) | 1 Stunde |

### Nach dem Fix bei Speed 1x

| Realzeit | Simulationszeit | Auftrags-Progress |
|----------|----------------|------------------|
| 1 Minute | 1 Minute | 1 Minute |
| 5 Minuten | 5 Minuten | 5 Minuten |
| 1 Stunde | 1 Stunde | 1 Stunde |

✅ **Jetzt synchron!**

## Speed-Multiplikator

Der `speed` Parameter funktioniert jetzt korrekt:

| Speed | Realzeit → Simulation |
|-------|---------------------|
| 0.5x | 1 Minute → 30 Sekunden |
| 1.0x | 1 Minute → 1 Minute |
| 1.5x | 1 Minute → 1.5 Minuten |
| 2.0x | 1 Minute → 2 Minuten |

## Geänderte Dateien

- `contexts/simulation-context.tsx` (Zeile 113-116)

## Testing

Nach dem Fix sollten Sie beobachten:

1. **Synchrone Zeitanzeige**: Die Uhrzeit in der UI sollte mit dem Auftragsfortschritt übereinstimmen
2. **Realistischer Fortschritt**: Ein Auftrag mit 30 Minuten Bearbeitungszeit sollte bei Speed 1x in ~30 Minuten Realzeit abgeschlossen werden
3. **Speed-Funktion**: Bei Speed 2x sollte alles doppelt so schnell laufen (15 Minuten Realzeit für 30 Minuten Simulation)

## Verifikation

Starten Sie die Simulation und überprüfen Sie:

```bash
# Starten Sie die App
npm run dev

# Öffnen Sie die Browser-Console und beobachten Sie:
# - Simulationszeit (UI-Anzeige oben rechts)
# - Auftragsprogress (Fortschrittsbalken)
# - Console-Logs für deltaMinutes

# Bei Speed 1x sollte gelten:
# - 1 Minute Realzeit ≈ 1 Minute Simulationszeit
# - Progress-Änderung ≈ Zeit-Änderung
```

## Weitere Komponenten

Die `components/simulation/simulation.tsx` verwendet eine **andere Zeitlogik** für stündliche Updates. Diese wurde nicht geändert, da sie:
- Separat läuft (modulare Simulation)
- Eine eigene Zeitberechnung hat (1 Stunde = 500ms / speed)
- Nicht mit der RealDataFactorySimulation interagiert

## Historische Notizen

Vermutlich wurde die ursprüngliche Formel (`/ 1000`) gewählt, um eine sehr schnelle Simulation zu ermöglichen. Dies führte jedoch zu:
- Verwirrung bei Benutzern
- Unrealistischen Zeitabläufen
- Schwierigkeiten beim Debugging
- Inkonsistenz zwischen UI und Logik

Die neue Formel (`/ 60000`) bietet eine realistischere und vorhersehbarere Simulation.

## Datum

Fix implementiert: 2025-10-17
