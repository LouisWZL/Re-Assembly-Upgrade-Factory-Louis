import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { AdvancedOrder, ProductionStation } from '@/types/advanced-factory';

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


interface AdvancedKPIDashboardProps {
  orders: AdvancedOrder[];
  completedOrders: AdvancedOrder[];
  stations: ProductionStation[];
  onClearData: () => void;
}

export function AdvancedKPIDashboard({
  orders,
  completedOrders,
  stations,
  onClearData
}: AdvancedKPIDashboardProps) {
  
  // Calculate KPIs
  const totalProcessingTime = completedOrders.reduce((sum, order) => {
    return sum + Object.values((order as any).stationDurations || {})
      .filter((d: any) => d.actual && d.completed)
      .reduce((stationSum: number, d: any) => stationSum + (d.actual || 0), 0);
  }, 0);
  
  const totalWaitingTime = completedOrders.reduce((sum, order) => {
    return sum + Object.values((order as any).stationDurations || {})
      .filter((d: any) => d.completed)
      .reduce((stationSum: number, d: any) => stationSum + (d.waitingTime || 0), 0);
  }, 0);
  
  const avgProcessingTime = completedOrders.length > 0 ? totalProcessingTime / completedOrders.length : 0;
  const avgWaitingTime = completedOrders.length > 0 ? totalWaitingTime / completedOrders.length : 0;
  const avgTotalTime = avgProcessingTime + avgWaitingTime;
  
  const busyStations = stations.filter(s => s.currentOrderId !== null && s.currentOrderId !== undefined).length;
  const utilizationRate = stations.length > 0 ? (busyStations / stations.length) * 100 : 0;

  const totalWaitingOrders = stations.reduce((sum, station) => sum + ((station as any).waitingQueue?.length || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">KPI Dashboard</h2>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => {
              // Dummy export functionality
              console.log('Export data functionality - placeholder');
            }}
            variant="outline"
          >
            Export
          </Button>
          <Button onClick={onClearData} variant="outline">
            Daten löschen
          </Button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-3 md:grid-cols-9 gap-4">
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

      {/* Detailed Order View from Simulation */}
      <OrderDetailsCardSection orders={orders} stations={stations} />
      
      {/* Process Graph and Sequences from Simulation */}
      <OrderProcessGraphSection orders={orders} stations={stations} />

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
                      const completedDurations = Object.values((order as any).stationDurations || {}).filter((d: any) => d.completed);
                      const processingTime = completedDurations.reduce((sum: number, d: any) => sum + (d.actual || 0), 0);
                      const waitingTime = completedDurations.reduce((sum: number, d: any) => sum + (d.waitingTime || 0), 0);
                      const totalTime = processingTime + waitingTime;
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{(order as any).kundeName || order.customer?.firstName + ' ' + order.customer?.lastName}</TableCell>
                          <TableCell>{(order as any).produktvariante || order.productVariant?.name}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              {(order as any).schedulingAlgorithm || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>{((order as any).startTime || order.createdAt).toLocaleString('de-DE')}</TableCell>
                          <TableCell>{((order as any).completedAt || (order as any).completedAt)?.toLocaleString('de-DE') || 'N/A'}</TableCell>
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
                        {(order as any).kundeName || order.customer?.firstName + ' ' + order.customer?.lastName} - {(order as any).produktvariante || order.productVariant?.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries((order as any).stationDurations || {})
                          .filter(([_, duration]: any) => duration.completed)
                          .map(([stationId, duration]: any) => {
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

function OrderDetailsCardSection({ orders, stations }: { orders: AdvancedOrder[], stations: ProductionStation[] }) {
  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Aktive Aufträge - Prozesszeiten</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-500 py-8">Keine aktiven Aufträge</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktive Aufträge - Prozesszeiten</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Kunde</TableHead>
                <TableHead className="w-[200px]">Produktvariante</TableHead>
                <TableHead className="w-[150px]">Aktuelle Station</TableHead>
                <TableHead className="w-[120px]">Fortschritt</TableHead>
                <TableHead className="w-[100px]">Verzögerung</TableHead>
                <TableHead className="w-[100px]">Gesamtzeit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order: any) => {
                const currentStationData = stations.find(s => s.id === order.currentStation);
                const currentStationDuration = order.stationDurations?.[order.currentStation];
                const progressPercent = (order.progress / (currentStationDuration?.actual || currentStationData?.processingTime || 1)) * 100;
                
                // Calculate total delay across all completed stations
                const completedStations = Object.entries(order.stationDurations || {}).filter(([stationId, duration]: any) => {
                  return duration.actual && order.processSequence?.indexOf(order.currentStation) > order.processSequence?.indexOf(stationId);
                });
                const totalDelay = completedStations.reduce((acc, [, duration]: any) => {
                  return acc + (duration.actual! - duration.expected);
                }, 0);
                
                // Calculate total time spent so far
                const totalTimeSpent = completedStations.reduce((acc, [, duration]: any) => acc + duration.actual!, 0) + (order.progress || 0);
                
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.kundeName || `${order.customer?.firstName} ${order.customer?.lastName}`}</TableCell>
                    <TableCell>{order.produktvariante || order.productVariant?.name}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {currentStationData?.name || 'Unbekannt'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, progressPercent)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-medium">{progressPercent.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${
                        totalDelay > 0 ? 'text-red-600' : totalDelay < 0 ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {totalDelay > 0 ? '+' : ''}{totalDelay.toFixed(1)} min
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {totalTimeSpent.toFixed(1)} min
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderProcessGraphSection({ orders, stations }: { orders: AdvancedOrder[], stations: ProductionStation[] }) {
  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Prozesssequenzen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-500 py-8">
            Keine aktiven Aufträge mit Prozesssequenzen verfügbar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prozesssequenzen der aktiven Aufträge</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {orders.map((order: any) => (
            <div key={order.id} className="border rounded-lg p-4">
              <h4 className="font-medium mb-3">
                {order.kundeName || `${order.customer?.firstName} ${order.customer?.lastName}`} - {order.produktvariante || order.productVariant?.name}
              </h4>
              
              {/* Process Sequence Steps */}
              {order.processSequence && order.processSequence.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium mb-2">Prozessschritte:</h5>
                  <div className="flex flex-wrap gap-2">
                    {order.processSequence.map((stationId: string, index: number) => {
                      const station = stations.find(s => s.id === stationId);
                      const isCurrentStation = stationId === order.currentStation;
                      const isCompleted = order.stationDurations?.[stationId]?.completed;
                      
                      return (
                        <div
                          key={`${order.id}-${stationId}-${index}`}
                          className={`px-3 py-1 rounded-md text-xs font-medium ${
                            isCurrentStation
                              ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                              : isCompleted
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {index + 1}. {station?.name || stationId}
                          {isCurrentStation && ' (aktuell)'}
                          {isCompleted && ' ✓'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Selected Sequence Information */}
              {order.selectedSequence && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium mb-2">Ausgewählte Sequenz ID: {order.selectedSequence.id}</h5>
                  <div className="flex flex-wrap gap-1">
                    {order.selectedSequence.steps?.map((step: string, index: number) => (
                      <span
                        key={`${order.id}-step-${index}`}
                        className="px-2 py-1 bg-gray-50 border text-xs font-mono rounded"
                      >
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Required Components */}
              {order.requiredBaugruppentypen && order.requiredBaugruppentypen.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium mb-2">Erforderliche Baugruppentypen:</h5>
                  <div className="flex flex-wrap gap-2">
                    {order.requiredBaugruppentypen.map((bgt: string) => (
                      <span
                        key={`${order.id}-bgt-${bgt}`}
                        className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded"
                      >
                        {bgt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Required Upgrades */}
              {order.requiredUpgrades && Object.keys(order.requiredUpgrades).length > 0 && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Erforderliche Upgrades:</h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(order.requiredUpgrades).map(([bgt, type]: [string, any]) => (
                      <span
                        key={`${order.id}-upgrade-${bgt}`}
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          type === 'PFLICHT'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {bgt}: {type}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}