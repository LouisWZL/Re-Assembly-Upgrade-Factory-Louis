# Queue System Documentation

## Overview

Das Queue-System ermöglicht es, Aufträge in verschiedenen Warteschlangen mit konfigurierbaren Wartezeiten zu verwalten, bevor sie zur nächsten Station freigegeben werden.

## Komponenten

### 1. Datenbank-Modelle (Prisma Schema)

Drei Queue-Tabellen:
- **PreAcceptanceQueue**: Warteschlange vor der Auftragsannahme
- **PreInspectionQueue**: Warteschlange vor der Inspektion
- **PostInspectionQueue**: Warteschlange nach der Inspektion

Jede Queue speichert:
- `orderId`: Referenz zum Auftrag
- `possibleSequence`: Kopie der Prozesssequenzen
- `processTimes`: Erwartete Bearbeitungszeiten
- `processingOrder`: Reihenfolge in der Queue
- `releaseAfterMinutes`: Wartezeit in Minuten
- `queuedAt`: Zeitpunkt des Eintritts in die Queue
- `releasedAt`: Zeitpunkt der Freigabe (null = noch nicht freigegeben)

**QueueConfig**: Konfiguration der Wartezeiten pro Factory
- `preAcceptanceReleaseMinutes`
- `preInspectionReleaseMinutes`
- `postInspectionReleaseMinutes`

### 2. Server Actions (`app/actions/queue.actions.ts`)

#### `enqueueOrder(queue, orderId, sequence?, processTimes?)`
Fügt einen Auftrag zur Queue hinzu mit automatischer Bestimmung der Wartezeit aus der Config.

#### `releaseNext(queue)`
Gibt den nächsten Auftrag aus der Queue frei, wenn die Wartezeit abgelaufen ist.
Rückgabe:
- `released: true` - Auftrag wurde freigegeben
- `released: false, waiting: true, waitMinutes: X` - Auftrag wartet noch
- `released: false, message: "Queue is empty"` - Queue ist leer

#### `getQueueStatus(queue)`
Liefert Status aller Aufträge in einer Queue mit Informationen über:
- Gesamtanzahl
- Anzahl bereiter Aufträge
- Wartezeiten pro Auftrag

#### `updateQueueConfig(factoryId, config)`
Aktualisiert die Wartezeiten für eine Factory.

#### `clearReleasedEntries(queue)`
Löscht freigegebene Einträge (Cleanup).

### 3. UI-Komponenten

#### `QueueViewer` (`components/advanced-simulation/QueueViewer.tsx`)
Live-Ansicht einer einzelnen Queue mit:
- Auto-Refresh alle 2 Sekunden
- Anzeige aller wartenden Aufträge
- Status (Ready/Waiting)
- Restliche Wartezeit
- Kundeninformationen
- Prozesszeiten

#### `QueueCircleNode` (`components/advanced-simulation/QueueCircleNode.tsx`)
Custom ReactFlow Node für die Kreis-Connectors:
- Klickbar
- Öffnet Queue-Viewer in neuem Tab
- Zeigt Database-Icon

#### `QueueConfigPanel` (`components/advanced-simulation/QueueConfigPanel.tsx`)
UI zum Konfigurieren der Wartezeiten pro Queue.

### 4. Queue-Seite (`app/simulation/queues/page.tsx`)

Zeigt alle drei Queues gleichzeitig:
- Live-Updates
- Highlight-Funktion über URL-Parameter (`?highlight=preAcceptance`)
- Queue-Konfiguration

## Usage

### 1. Queues ansehen

Navigiere zu `/simulation/queues` oder klicke auf einen der blauen Kreise im ReactFlow-Diagram.

### 2. Wartezeiten konfigurieren

Auf der Queue-Seite kannst du die Wartezeiten (in Minuten) für jede Queue einstellen:
- **Pre-Acceptance**: Wartezeit vor Auftragsannahme
- **Pre-Inspection**: Wartezeit vor Inspektion
- **Post-Inspection**: Wartezeit vor Demontage

### 3. Test-Daten einfügen

```bash
npx tsx scripts/test-queues.ts
```

Dieses Script:
1. Sucht die erste Factory
2. Erstellt/aktualisiert Queue-Config (5, 10, 15 Minuten)
3. Löscht bestehende Queue-Einträge
4. Fügt 6 Orders in die Queues ein (je 2 pro Queue)

### 4. Integration in Simulation (TODO)

Die Queue-Actions müssen noch in den Simulation-Tick integriert werden:

```typescript
// Beispiel für Integration
const tick = async () => {
  // Versuche, nächsten Auftrag aus preAcceptance-Queue freizugeben
  const result = await releaseNext('preAcceptance')

  if (result.released && result.data) {
    // Auftrag wurde freigegeben, starte Auftragsannahme
    const order = result.data.order
    startProcessingAtStation('order-acceptance', order)
  } else if (result.waiting) {
    // Auftrag wartet noch
    console.log(\`Next order ready in \${result.waitMinutes} minutes\`)
  }
}
```

## ReactFlow Integration

Die Kreise zwischen den Stationen sind jetzt klickbare Queue-Viewer:

- **Circle 1** (vor Auftragsannahme): PreAcceptanceQueue
- **Circle 2** (vor Inspektion): PreInspectionQueue
- **Circle 3** (nach Inspektion): PostInspectionQueue

Klicke auf einen Kreis, um die entsprechende Queue in einem neuen Tab zu öffnen.

## Nächste Schritte

1. ✅ Queue-Modelle und Actions erstellt
2. ✅ Queue-Viewer UI implementiert
3. ✅ Clickable Circles im ReactFlow
4. ✅ Queue-Config UI
5. ⏳ Integration der Queue-Logic in den Simulation-Tick
6. ⏳ Automatisches Enqueuen neuer Orders
7. ⏳ Automatisches Release bei Simulation-Run

## Architektur-Überlegungen

Das Queue-System ist als **additive Layer** über die bestehende Simulation gebaut:
- Die bestehende Memory-basierte Queue (`mainQueuesRef`) kann parallel laufen
- Die DB-Queues können schrittweise integriert werden
- Server Actions ermöglichen einfaches Testen ohne UI

Die vollständige Integration würde bedeuten:
1. Beim Simulation-Start: Neue Orders in `PreAcceptanceQueue` einfügen
2. Bei jedem Tick: `releaseNext()` für jede Queue aufrufen
3. Freigegebene Orders in die nächste Station übergeben
4. Nach Fertigstellung einer Station: In die nächste Queue einfügen
