# Simulation Speed Update

## Änderungen

Die Simulation-Speed-Range wurde erweitert, um schnellere Tests zu ermöglichen.

### Vorher

| Parameter | Alt | Neu |
|-----------|-----|-----|
| Minimum | 0.5x oder 1x | **0.5x** |
| Maximum | 2x oder 4x | **20x** |
| Schritt | 0.1 oder 1 | **0.5** |
| Standard | 1x | **5x** |

### Jetzt

- **Range**: 0.5x - 20x
- **Step**: 0.5
- **Default**: 5x (für schnellere Tests)

## Zeitberechnung bei verschiedenen Speeds

Nach dem Time-Consistency-Fix:

| Speed | 1 Minute Real | Simulation | Beispiel: 30min Auftrag |
|-------|--------------|------------|------------------------|
| 0.5x | 30 Sekunden | 0.5 Min | 60 Min Realzeit |
| 1x | 1 Minute | 1 Min | 30 Min Realzeit |
| 2x | 2 Minuten | 2 Min | 15 Min Realzeit |
| **5x** | **5 Minuten** | **5 Min** | **6 Min Realzeit** |
| 10x | 10 Minuten | 10 Min | 3 Min Realzeit |
| 20x | 20 Minuten | 20 Min | 1.5 Min Realzeit |

## Betroffene Dateien

1. **components/simulation/SimulationControlsBar.tsx**
   - Speed-Range: 0.5x - 20x
   - Default: 5x
   - Step: 0.5

2. **components/advanced-simulation/RealDataFactorySimulation.tsx**
   - Speed-Range: 0.5x - 20x
   - Removed 4x limit (latency compensation no longer needed)
   - Step: 0.5

3. **contexts/simulation-context.tsx**
   - Default speed: 5x
   - Reset speed: 5x

## Rationale

### Warum 5x als Default?

Mit der korrigierten Zeitberechnung (60 Sekunden = 1 Minute):
- **1x** ist zu langsam für Tests (30 Min Auftrag = 30 Min Realzeit)
- **5x** bietet gute Balance (30 Min Auftrag = 6 Min Realzeit)
- User kann bei Bedarf anpassen

### Warum bis 20x?

- **Schnelle Tests**: Aufträge mit 2 Stunden können in 6 Minuten getestet werden
- **Flexibilität**: User kann selbst entscheiden
- **Keine technische Limitierung**: Die 4x-Grenze war für alte Latenz-Kompensation

### Warum 0.5x Schritte?

- **Feinere Kontrolle**: Bei hohen Speeds wichtig (15x vs 15.5x)
- **Einfache Bedienung**: 0.1 Schritte wären zu fein bei 20x Range

## Empfohlene Speed-Settings

| Use Case | Empfohlener Speed |
|----------|------------------|
| Debugging | 1x - 2x |
| Standard-Tests | 5x - 10x |
| Schnell-Tests | 15x - 20x |
| Präsentation | 2x - 5x |

## Server-Latenz

Die ursprüngliche 4x-Grenze wurde entfernt:
- **Alte Annahme**: 250ms DB-Latenz erfordert Speed-Limit
- **Neue Realität**: DB-Verbindung ist schnell (60-200ms)
- **Updates**: 1 Sekunde Intervall ist ausreichend

Bei hohen Speeds (>10x) kann es zu visuellen Verzögerungen kommen wenn:
- Datenbank überlastet ist
- Viele gleichzeitige Updates
- Netzwerk langsam

→ In diesem Fall einfach Speed reduzieren

## Testing

Test mit verschiedenen Speeds:

```bash
# App starten
npm run dev

# Im Browser:
# 1. Speed auf 1x setzen → 1 Min Realzeit = 1 Min Sim
# 2. Speed auf 5x setzen → 1 Min Realzeit = 5 Min Sim
# 3. Speed auf 20x setzen → 1 Min Realzeit = 20 Min Sim
```

Überprüfen:
- ✅ Slider zeigt korrekte Range (0.5 - 20)
- ✅ Standard ist 5x beim Start
- ✅ Zeit läuft entsprechend schnell
- ✅ Progress-Balken synchron mit Zeit

## Datum

Update implementiert: 2025-10-17
