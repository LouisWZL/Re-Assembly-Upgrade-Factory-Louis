import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface SimulationOrder {
  id: string;
  kundeId: string;
  kundeName: string;
  produktvariante: string;
  currentStation: string;
  progress: number;
  startTime: Date;
  stationStartTime?: Date;
  processSequence: string[];
  requiredBaugruppentypen: string[];
  requiredUpgrades: { [baugruppentypId: string]: 'PFLICHT' | 'WUNSCH' };
  stationDurations: { [stationId: string]: { expected: number; actual?: number; startTime?: Date; completed?: boolean; waitingTime?: number } };
  isWaiting: boolean;
  completedAt?: Date;
}

interface SimulationStation {
  id: string;
  name: string;
  type: 'MAIN' | 'SUB';
  phase?: string;
  processingTime: number;
  stochasticVariation: number;
  currentOrder: SimulationOrder | null;
  waitingQueue: SimulationOrder[];
  baugruppentypId?: string;
  parent?: string;
  capacity: number;
}

interface AdvancedKPIDashboardProps {
  orders: SimulationOrder[];
  completedOrders: SimulationOrder[];
  stations: SimulationStation[];
  simulationStartTime: Date;
  onClearData: () => void;
}

export function AdvancedKPIDashboard({
  orders,
  completedOrders,
  stations,
  simulationStartTime,
  onClearData
}: AdvancedKPIDashboardProps) {
  const allOrders = [...orders, ...completedOrders];
  
  // Calculate KPIs
  const totalProcessingTime = completedOrders.reduce((sum, order) => {
    return sum + Object.values(order.stationDurations)
      .filter(d => d.actual && d.completed)
      .reduce((stationSum, d) => stationSum + (d.actual || 0), 0);
  }, 0);
  
  const totalWaitingTime = completedOrders.reduce((sum, order) => {
    return sum + Object.values(order.stationDurations)
      .filter(d => d.completed)
      .reduce((stationSum, d) => stationSum + (d.waitingTime || 0), 0);
  }, 0);
  
  const avgProcessingTime = completedOrders.length > 0 ? totalProcessingTime / completedOrders.length : 0;
  const avgWaitingTime = completedOrders.length > 0 ? totalWaitingTime / completedOrders.length : 0;
  const avgTotalTime = avgProcessingTime + avgWaitingTime;
  
  // Prepare data for stacked bar chart
  const prepareChartData = () => {
    return completedOrders.map((order, index) => {
      const processingTime = Object.values(order.stationDurations)
        .filter(d => d.completed)
        .reduce((sum, d) => sum + (d.actual || 0), 0);
      const waitingTime = Object.values(order.stationDurations)
        .filter(d => d.completed)
        .reduce((sum, d) => sum + (d.waitingTime || 0), 0);

      return {
        name: `${order.kundeName}`,
        orderNumber: index + 1,
        Bearbeitungszeit: parseFloat(processingTime.toFixed(1)),
        Wartezeit: parseFloat(waitingTime.toFixed(1))
      };
    });
  };
  
  const totalDelays = completedOrders.reduce((sum, order) => {
    return sum + Object.values(order.stationDurations)
      .filter(d => d.actual && d.completed)
      .reduce((stationSum, d) => stationSum + Math.max(0, (d.actual || 0) - d.expected), 0);
  }, 0);
  
  const avgDelay = completedOrders.length > 0 ? totalDelays / completedOrders.length : 0;
  
  const busyStations = stations.filter(s => s.currentOrder !== null).length;
  const utilizationRate = stations.length > 0 ? (busyStations / stations.length) * 100 : 0;

  const totalWaitingOrders = stations.reduce((sum, station) => sum + station.waitingQueue.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">KPI Dashboard</h2>
        <Button onClick={onClearData} variant="outline">
          Daten löschen
        </Button>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{completedOrders.length}</div>
            <p className="text-xs text-muted-foreground">Abgeschlossene Aufträge</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{avgTotalTime.toFixed(1)} min</div>
            <p className="text-xs text-muted-foreground">Ø Gesamtzeit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{avgProcessingTime.toFixed(1)} min</div>
            <p className="text-xs text-muted-foreground">Ø Bearbeitungszeit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{avgWaitingTime.toFixed(1)} min</div>
            <p className="text-xs text-muted-foreground">Ø Wartezeit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{utilizationRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Stationsauslastung</p>
          </CardContent>
        </Card>
      </div>

      {/* Stacked Bar Chart */}
      {completedOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Zeitverteilung pro Auftrag (gestapeltes Balkendiagramm)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={prepareChartData()} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval={0}
                />
                <YAxis label={{ value: 'Zeit (min)', angle: -90, position: 'insideLeft' }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [`${value} min`, name]}
                  labelFormatter={(label) => `Kunde: ${label}`}
                />
                <Legend />
                <Bar dataKey="Bearbeitungszeit" stackId="a" fill="#82ca9d" name="Bearbeitungszeit" />
                <Bar dataKey="Wartezeit" stackId="a" fill="#ffc658" name="Wartezeit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Additional Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalWaitingOrders}</div>
            <p className="text-xs text-muted-foreground">Aufträge in Warteschlangen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{busyStations}</div>
            <p className="text-xs text-muted-foreground">Belegte Stationen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground">Aktive Aufträge</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stations.length}</div>
            <p className="text-xs text-muted-foreground">Gesamte Stationen</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Completed Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Abgeschlossene Aufträge mit Prozesszeiten</CardTitle>
        </CardHeader>
        <CardContent>
          {completedOrders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Noch keine abgeschlossenen Aufträge</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Produktvariante</TableHead>
                      <TableHead>Scheduling</TableHead>
                      <TableHead>Startzeit</TableHead>
                      <TableHead>Abschlusszeit</TableHead>
                      <TableHead>Bearbeitungszeit</TableHead>
                      <TableHead>Wartezeit</TableHead>
                      <TableHead>Gesamtzeit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedOrders.map((order) => {
                      const completedDurations = Object.values(order.stationDurations).filter(d => d.completed);
                      const processingTime = completedDurations.reduce((sum, d) => sum + (d.actual || 0), 0);
                      const waitingTime = completedDurations.reduce((sum, d) => sum + (d.waitingTime || 0), 0);
                      const totalTime = processingTime + waitingTime;
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.kundeName}</TableCell>
                          <TableCell>{order.produktvariante}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              {order.schedulingAlgorithm || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>{order.startTime.toLocaleString('de-DE')}</TableCell>
                          <TableCell>{order.completedAt?.toLocaleString('de-DE') || 'N/A'}</TableCell>
                          <TableCell className="text-green-600 font-medium">{processingTime.toFixed(1)} min</TableCell>
                          <TableCell className="text-orange-600 font-medium">{waitingTime.toFixed(1)} min</TableCell>
                          <TableCell className="font-bold">{totalTime.toFixed(1)} min</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Detailed Station Times for Each Order */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Detaillierte Stationszeiten</h3>
                {completedOrders.map((order) => (
                  <Card key={`details-${order.id}`}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {order.kundeName} - {order.produktvariante}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(order.stationDurations)
                          .filter(([_, duration]) => duration.completed)
                          .map(([stationId, duration]) => {
                            const station = stations.find(s => s.id === stationId);
                            const processingTime = duration.actual || 0;
                            const waitingTime = duration.waitingTime || 0;
                            const totalStationTime = processingTime + waitingTime;
                            
                            return (
                              <div 
                                key={`${order.id}-${stationId}`} 
                                className="p-3 border rounded-lg bg-gray-50"
                              >
                                <div className="text-sm font-medium text-gray-800">
                                  {station?.name || stationId}
                                </div>
                                <div className="text-xs space-y-1 mt-1">
                                  <div className="text-green-600">Bearbeitung: {processingTime.toFixed(1)} min</div>
                                  {waitingTime > 0 && (
                                    <div className="text-orange-600">Wartezeit: {waitingTime.toFixed(1)} min</div>
                                  )}
                                  <div className="font-medium border-t pt-1">
                                    Gesamt: {totalStationTime.toFixed(1)} min
                                  </div>
                                  {duration.startTime && (
                                    <div className="text-gray-500">
                                      {duration.startTime.toLocaleTimeString('de-DE')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}