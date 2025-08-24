import { useState, useCallback } from 'react';
import { AdvancedOrder, ProductionStation, SimulationKPIs, OrderPhase } from '@/types/advanced-factory';
import { calculateAdvancedKPIs } from '@/lib/advanced-factory-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square } from 'lucide-react';

interface AdvancedFactorySimulationProps {
  orders: AdvancedOrder[];
  completedOrders: AdvancedOrder[];
  stations: ProductionStation[];
  isRunning: boolean;
  speed: number;
  startDate: Date;
  orderArrivalRate: number;
  currentSimulationTime: Date;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onDateChange: (date: Date) => void;
  onOrderArrivalRateChange: (rate: number) => void;
  onManualOrder: () => void;
  onClearData: () => void;
  onStationClick: (station: ProductionStation) => void;
  onPhaseClick: (phase: OrderPhase) => void;
  onOrderClick: (order: AdvancedOrder) => void;
  onStationSave: (station: ProductionStation) => void;
}

export function AdvancedFactorySimulation({
  orders,
  completedOrders,
  stations,
  isRunning,
  speed,
  startDate,
  orderArrivalRate,
  currentSimulationTime,
  onStart,
  onPause,
  onStop,
  onSpeedChange,
  onDateChange,
  onOrderArrivalRateChange,
  onManualOrder,
  onClearData,
  onStationClick,
  onPhaseClick,
  onOrderClick,
  onStationSave,
}: AdvancedFactorySimulationProps) {
  // Calculate KPIs
  const allOrders = [...orders, ...completedOrders];
  const kpis: SimulationKPIs = calculateAdvancedKPIs(allOrders, stations, new Date());

  return (
    <div className="space-y-6">
      {/* Advanced Simulation Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Factory Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              onClick={isRunning ? onPause : onStart}
              variant={isRunning ? "destructive" : "default"}
            >
              {isRunning ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isRunning ? 'Pause' : 'Start'}
            </Button>
            
            <Button onClick={onStop} variant="outline">
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
            
            <Button onClick={onManualOrder} variant="outline">
              Add Order
            </Button>
            
            <Button onClick={onClearData} variant="outline">
              Clear Data
            </Button>
            
            <div className="ml-auto">
              <div className="text-sm text-muted-foreground">
                Speed: {speed}x | Time: {currentSimulationTime.toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{kpis.totalOrders}</div>
            <div className="text-sm text-muted-foreground">Total Orders</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{kpis.completedOrders}</div>
            <div className="text-sm text-muted-foreground">Completed Orders</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{Math.round(kpis.avgThroughputTime)}</div>
            <div className="text-sm text-muted-foreground">Avg Throughput (min)</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{kpis.ordersPerHour.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">Orders/Hour</div>
          </CardContent>
        </Card>
      </div>

      {/* Process Flow Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Process Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="text-muted-foreground">
              Advanced process flow visualization will be implemented here.
              <br />
              This will include the detailed production line layout with stations.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Orders Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {orders.slice(0, 5).map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-muted/50"
                onClick={() => onOrderClick(order)}
              >
                <div>
                  <div className="font-medium">{order.displayId}</div>
                  <div className="text-sm text-muted-foreground">
                    {order.customer.firstName} {order.customer.lastName} - {order.productVariant.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{order.phase}</div>
                  <div className="text-xs text-muted-foreground">
                    {order.deliveryDate.toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No orders available. Click "Add Order" to create one.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}