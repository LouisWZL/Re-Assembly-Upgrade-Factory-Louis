import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, AlertTriangle, Target, Zap, Settings } from 'lucide-react';
import { useSimulation } from '@/contexts/simulation-context';

interface ScheduleItem {
  id: string;
  orderId: string;
  customerName: string;
  productVariant: string;
  scheduledStart: Date;
  estimatedEnd: Date;
  actualStart?: Date;
  actualEnd?: Date;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  assignedLine: 1 | 2;
}

const mockScheduleData: ScheduleItem[] = [
  {
    id: '1',
    orderId: 'ORD-001',
    customerName: 'Max Mustermann',
    productVariant: 'Porsche 911 Carrera',
    scheduledStart: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    estimatedEnd: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
    actualStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assignedLine: 1
  },
  {
    id: '2',
    orderId: 'ORD-002',
    customerName: 'Anna Schmidt',
    productVariant: 'Porsche 911 Turbo',
    scheduledStart: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour from now
    estimatedEnd: new Date(Date.now() + 7 * 60 * 60 * 1000), // 7 hours from now
    status: 'SCHEDULED',
    priority: 'MEDIUM',
    assignedLine: 2
  },
  {
    id: '3',
    orderId: 'ORD-003',
    customerName: 'Thomas Weber',
    productVariant: 'Porsche 911 GT3',
    scheduledStart: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    estimatedEnd: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    actualStart: new Date(Date.now() - 0.5 * 60 * 60 * 1000), // 30 min ago (delayed)
    status: 'DELAYED',
    priority: 'HIGH',
    assignedLine: 1
  },
  {
    id: '4',
    orderId: 'ORD-004',
    customerName: 'Julia Fischer',
    productVariant: 'Porsche 911 Carrera',
    scheduledStart: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
    estimatedEnd: new Date(Date.now() + 9 * 60 * 60 * 1000), // 9 hours from now
    status: 'SCHEDULED',
    priority: 'LOW',
    assignedLine: 1
  },
  {
    id: '5',
    orderId: 'ORD-005',
    customerName: 'Michael Meyer',
    productVariant: 'Porsche 911 Turbo',
    scheduledStart: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    estimatedEnd: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    actualStart: new Date(Date.now() - 4 * 60 * 60 * 1000),
    actualEnd: new Date(Date.now() - 1 * 60 * 60 * 1000),
    status: 'COMPLETED',
    priority: 'MEDIUM',
    assignedLine: 2
  }
];

// Scheduling algorithms
enum SchedulingAlgorithm {
  FIFO = 'FIFO',
  SJF = 'SJF',
  LJF = 'LJF',
  PRIORITY = 'PRIORITY',
  EDD = 'EDD',
  RANDOM = 'RANDOM'
}

const schedulingStrategies = {
  [SchedulingAlgorithm.FIFO]: {
    name: 'First In First Out',
    description: 'Ordnung nach Ankunftsreihenfolge'
  },
  [SchedulingAlgorithm.SJF]: {
    name: 'Shortest Job First',
    description: 'Kürzeste Bearbeitungszeit zuerst'
  },
  [SchedulingAlgorithm.LJF]: {
    name: 'Longest Job First',
    description: 'Längste Bearbeitungszeit zuerst'
  },
  [SchedulingAlgorithm.PRIORITY]: {
    name: 'Priority Scheduling',
    description: 'Priorität basierend auf Kundentyp'
  },
  [SchedulingAlgorithm.EDD]: {
    name: 'Earliest Due Date',
    description: 'Früheste Liefertermin zuerst'
  },
  [SchedulingAlgorithm.RANDOM]: {
    name: 'Random Selection',
    description: 'Zufällige Auswahl aus Warteschlange'
  }
};

export function AdvancedScheduling() {
  const { currentSchedulingAlgorithm, setCurrentSchedulingAlgorithm, activeOrders, completedOrders } = useSimulation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Terminierung</h2>
      </div>

      {/* Three main scheduling areas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* 1. Langzeit-Terminierung */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-600" />
              Langzeit-Terminierung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Strategische Terminplanung basierend auf geschätzten Lieferterminen
              </p>
              
              <div className="space-y-3">
                <div className="p-3 border rounded-lg bg-blue-50">
                  <div className="font-medium text-blue-800">Erste Terminschätzung</div>
                  <div className="text-sm text-blue-600 mt-1">
                    Basierend auf Produktvariante und erwarteter Bearbeitungszeit
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Aktuelle Aufträge (Geschätzte Termine):</h4>
                  {activeOrders.slice(0, 5).map((order, index) => {
                    const estimatedCompletionTime = new Date(order.startTime.getTime() + 
                      order.processSequence.length * 45 * 60000); // ~45 min per station
                    
                    return (
                      <div key={order.id} className="p-2 bg-gray-50 rounded text-xs">
                        <div className="font-medium">{order.kundeName}</div>
                        <div className="text-gray-600">
                          {order.produktvariante}
                        </div>
                        <div className="text-blue-600 mt-1">
                          Geschätzte Fertigstellung: {estimatedCompletionTime.toLocaleString('de-DE')}
                        </div>
                      </div>
                    );
                  })}
                  {activeOrders.length === 0 && (
                    <div className="text-xs text-gray-500 italic">Keine aktiven Aufträge</div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Mittelfristige Terminierung */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-600" />
              Mittelfristige Terminierung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Scheduling-Algorithmus Konfiguration für die Warteschlangen-Verwaltung
              </p>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Aktueller Scheduling-Algorithmus:</Label>
                  <Select 
                    value={currentSchedulingAlgorithm} 
                    onValueChange={(value: string) => setCurrentSchedulingAlgorithm(value)}
                  >
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(SchedulingAlgorithm).map((algo) => (
                        <SelectItem key={algo} value={algo}>
                          <div>
                            <div className="font-medium">{schedulingStrategies[algo].name}</div>
                            <div className="text-xs text-gray-500">{schedulingStrategies[algo].description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 border rounded-lg bg-orange-50">
                  <div className="font-medium text-orange-800">
                    {schedulingStrategies[currentSchedulingAlgorithm as SchedulingAlgorithm]?.name}
                  </div>
                  <div className="text-sm text-orange-600 mt-1">
                    {schedulingStrategies[currentSchedulingAlgorithm as SchedulingAlgorithm]?.description}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Algorithmus-Statistiken:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-50 rounded text-xs">
                      <div className="font-medium">Verwendete Aufträge:</div>
                      <div className="text-orange-600">
                        {completedOrders.filter(o => o.schedulingAlgorithm === currentSchedulingAlgorithm).length}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-xs">
                      <div className="font-medium">Aktiv seit:</div>
                      <div className="text-orange-600">
                        Simulation
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Kurzzeit-Terminierung */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-600" />
              Kurzzeit-Terminierung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Echzeit-Scheduling für Warteschlangen und Stationszuweisungen
              </p>
              
              <div className="space-y-3">
                <div className="p-3 border rounded-lg bg-green-50">
                  <div className="font-medium text-green-800">Live Station Assignment</div>
                  <div className="text-sm text-green-600 mt-1">
                    Dynamische Zuordnung basierend auf aktueller Stationsauslastung
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Warteschlangen-Status:</h4>
                  {activeOrders.filter(order => order.isWaiting).slice(0, 4).map((order) => (
                    <div key={order.id} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                      <div className="font-medium text-yellow-800">{order.kundeName}</div>
                      <div className="text-yellow-600">
                        Wartet an: {order.currentStation}
                      </div>
                      <div className="text-yellow-700 mt-1">
                        Fortschritt: {order.progress.toFixed(1)} min
                      </div>
                    </div>
                  ))}
                  
                  {activeOrders.filter(order => !order.isWaiting && order.progress > 0).slice(0, 3).map((order) => (
                    <div key={order.id} className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                      <div className="font-medium text-green-800">{order.kundeName}</div>
                      <div className="text-green-600">
                        Aktiv an: {order.currentStation}
                      </div>
                      <div className="text-green-700 mt-1">
                        Fortschritt: {order.progress.toFixed(1)} min
                      </div>
                    </div>
                  ))}
                  
                  {activeOrders.length === 0 && (
                    <div className="text-xs text-gray-500 italic">Keine aktiven Aufträge</div>
                  )}
                </div>

                <div className="pt-2 border-t">
                  <div className="text-xs text-gray-600">
                    <div className="font-medium mb-1">Algorithmus-Performance:</div>
                    <div>Aktuelle Wartezeit: {activeOrders.filter(o => o.isWaiting).length} wartende Aufträge</div>
                    <div>Durchsatz: {completedOrders.length} abgeschlossen</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Terminierungs-Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{activeOrders.length}</div>
              <div className="text-sm text-blue-800">Aktive Aufträge</div>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{activeOrders.filter(o => o.isWaiting).length}</div>
              <div className="text-sm text-orange-800">In Warteschlange</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{completedOrders.length}</div>
              <div className="text-sm text-green-800">Abgeschlossen</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {completedOrders.length > 0 ? 
                  (completedOrders.reduce((sum, order) => {
                    const totalTime = Object.values(order.stationDurations)
                      .filter(d => d.completed)
                      .reduce((stationSum, d) => stationSum + (d.actual || d.expected), 0);
                    return sum + totalTime;
                  }, 0) / completedOrders.length).toFixed(0) : '0'
                }min
              </div>
              <div className="text-sm text-purple-800">Ø Gesamtzeit</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{currentSchedulingAlgorithm}</div>
              <div className="text-sm text-gray-800">Aktueller Algorithmus</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}