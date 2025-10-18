# Simulation - Quick Start Guide

## ✅ Zeit-Konsistenz Fix

Die Simulationszeit läuft jetzt **synchron** mit dem Auftrags-Fortschritt!

### Was wurde behoben?

**Problem**: Die angezeigte Simulationszeit lief 60x schneller als der tatsächliche Auftrags-Progress.

**Fix**: Zeitberechnung im simulation-context.tsx wurde korrigiert.

**Ergebnis**:
- ✅ 1 Minute Realzeit = 1 Minute Simulationszeit (bei Speed 1x)
- ✅ Fortschrittsbalken bewegen sich synchron zur Uhrzeit
- ✅ Speed-Funktion arbeitet korrekt

## Zeitverhalten Verstehen

### Bei Speed 1x

| Realzeit | Simulationszeit | Auftrags-Progress |
|----------|----------------|------------------|
| 1 Minute | 1 Minute | 1 Minute |
| 5 Minuten | 5 Minuten | 5 Minuten |
| 1 Stunde | 1 Stunde | 1 Stunde |

### Bei Speed 5x (Standard)

| Realzeit | Simulationszeit | Auftrags-Progress |
|----------|----------------|------------------|
| 1 Minute | 5 Minuten | 5 Minuten |
| 5 Minuten | 25 Minuten | 25 Minuten |
| 12 Minuten | 1 Stunde | 1 Stunde |

### Bei Speed 20x (Maximum)

| Realzeit | Simulationszeit | Auftrags-Progress |
|----------|----------------|------------------|
| 1 Minute | 20 Minuten | 20 Minuten |
| 3 Minuten | 1 Stunde | 1 Stunde |
| 30 Minuten | 10 Stunden | 10 Stunden |

## Simulation Starten

1. **App starten**
   ```bash
   npm run dev
   ```

2. **Browser öffnen**
   - Navigiere zu http://localhost:3000
   - Wähle eine Factory aus

3. **Simulation konfigurieren**
   - Wähle Algorithmen (Auftragsabwicklung, Terminierung, Beschaffung)
   - Setze Speed (0.5x - 20x, Standard: 5x)
   - Optional: Auto-Aufträge aktivieren

4. **Simulation beobachten**
   - ✅ Uhrzeit-Anzeige oben rechts
   - ✅ Fortschrittsbalken der Aufträge
   - ✅ Status-Indikator (grün = läuft)

## Verifizierung

### Test 1: Zeit-Konsistenz prüfen

```bash
npm run sim:test-time
```

Dieser Test überprüft, ob die Zeitberechnungen konsistent sind.

**Erwartetes Ergebnis**: Alle Tests ✅ PASS

### Test 2: Manuelle Überprüfung

1. Starte die Simulation mit **Speed 1x**
2. Notiere die aktuelle Simulationszeit (z.B. 10:00 Uhr)
3. Warte **1 Minute** Realzeit
4. Prüfe die Simulationszeit → sollte **10:01 Uhr** sein
5. Prüfe Auftrags-Progress → sollte um **1 Minute** fortgeschritten sein

### Test 3: Speed-Funktion testen

1. Setze Speed auf **2.0x**
2. Warte **30 Sekunden** Realzeit
3. Die Simulationszeit sollte um **1 Minute** voranschreiten
4. Der Auftrags-Progress sollte ebenfalls **1 Minute** Fortschritt zeigen

## Troubleshooting

### "Zeit läuft, aber Aufträge bewegen sich nicht"

**Mögliche Ursachen:**
- Aufträge warten in einer Queue
- Keine verfügbaren Ressourcen/Slots
- Algorithmus hat Aufträge noch nicht zugeteilt

**Lösung:**
1. Öffne Browser Console (F12)
2. Suche nach Dispatcher-Logs
3. Prüfe Queue-Status in der UI

### "Fortschritt ist langsamer als erwartet"

Das ist jetzt **korrekt**! Nach dem Fix:
- Bei Speed 1x dauert ein 30-Minuten-Auftrag **30 Minuten Realzeit**
- Nutze Speed 2x für **doppelte Geschwindigkeit** (15 Minuten Realzeit)

### "Ich möchte es schneller"

Erhöhe den Speed-Slider:
- **5x** (Standard) = 5x schneller als Echtzeit
- **10x** = 10x schneller
- **20x** (Maximum) = 20x schneller als Echtzeit

Beispiel: Ein 60-Minuten-Auftrag dauert bei 20x nur 3 Minuten Realzeit!

## Technische Details

### Zeitformel (nach Fix)

```typescript
const deltaMinutes = (realTimeDelta / 60000) * speed
```

- `realTimeDelta`: Millisekunden Realzeit seit letztem Update
- `60000`: Umrechnungsfaktor (60 Sekunden × 1000 ms)
- `speed`: Geschwindigkeits-Multiplikator

### Update-Intervalle

- **simulation-context.tsx**: 100ms (10x pro Sekunde)
- **RealDataFactorySimulation.tsx**: 1000ms (1x pro Sekunde)

Beide verwenden jetzt die **gleiche Zeitformel**.

## Weitere Ressourcen

- `SIMULATION_TIME_FIX.md` - Detaillierte Dokumentation des Fixes
- `scripts/verify-time-consistency.ts` - Test-Script für Zeitkonsistenz
- Browser Console - Zeigt deltaMinutes und Progress-Updates

## NPM Scripts

| Command | Beschreibung |
|---------|-------------|
| `npm run dev` | Starte App normal |
| `npm run dev:debug` | Starte mit DB-Debug-Logs |
| `npm run sim:test-time` | Teste Zeit-Konsistenz |

## Bekannte Einschränkungen

1. **Server-Latenz**: Bei langsamer Datenbankverbindung können Auftrags-Updates verzögert werden
2. **Browser-Throttling**: Wenn Tab im Hintergrund, kann Browser Updates verlangsamen
3. **Modulare Simulation**: `components/simulation/simulation.tsx` verwendet eine andere Zeitlogik (stündliche Updates)

## Änderungsverlauf

- **2025-10-17**: Zeit-Konsistenz-Fix implementiert
- Formula geändert von `/1000` zu `/60000`
- Synchronisation zwischen UI-Zeit und Auftrags-Progress hergestellt
