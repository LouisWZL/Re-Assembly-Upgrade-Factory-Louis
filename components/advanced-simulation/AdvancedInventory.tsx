import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ComponentType } from '@/types/advanced-factory';

interface InventoryItem {
  id: string;
  componentType: ComponentType;
  name: string;
  quantity: number;
  condition: 'NEW' | 'REFURBISHED' | 'USED';
  location: string;
  lastUpdated: Date;
}

const mockInventoryData: InventoryItem[] = [
  {
    id: '1',
    componentType: 'CHASSIS',
    name: 'Porsche 911 Chassis Frame',
    quantity: 15,
    condition: 'NEW',
    location: 'Warehouse A-1',
    lastUpdated: new Date()
  },
  {
    id: '2',
    componentType: 'ANTRIEB',
    name: 'V6 Engine Unit',
    quantity: 8,
    condition: 'REFURBISHED',
    location: 'Workshop B-2',
    lastUpdated: new Date()
  },
  {
    id: '3',
    componentType: 'ELEKTRONIK',
    name: 'Electronic Control Module',
    quantity: 25,
    condition: 'NEW',
    location: 'Storage C-1',
    lastUpdated: new Date()
  },
  {
    id: '4',
    componentType: 'FAHRWERK',
    name: 'Suspension System',
    quantity: 12,
    condition: 'USED',
    location: 'Inspection Zone',
    lastUpdated: new Date()
  },
  {
    id: '5',
    componentType: 'INTERIEUR',
    name: 'Leather Seat Set',
    quantity: 6,
    condition: 'REFURBISHED',
    location: 'Workshop A-3',
    lastUpdated: new Date()
  }
];

export function AdvancedInventory() {
  const getConditionVariant = (condition: string) => {
    switch (condition) {
      case 'NEW':
        return 'default';
      case 'REFURBISHED':
        return 'secondary';
      case 'USED':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStockStatus = (quantity: number) => {
    if (quantity === 0) return { status: 'OUT_OF_STOCK', color: 'text-red-600' };
    if (quantity < 5) return { status: 'LOW_STOCK', color: 'text-orange-600' };
    return { status: 'IN_STOCK', color: 'text-green-600' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inventory Management</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{mockInventoryData.length}</div>
            <div className="text-sm text-muted-foreground">Total Items</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {mockInventoryData.reduce((sum, item) => sum + item.quantity, 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Quantity</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {mockInventoryData.filter(item => getStockStatus(item.quantity).status === 'LOW_STOCK').length}
            </div>
            <div className="text-sm text-muted-foreground">Low Stock Items</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {mockInventoryData.filter(item => item.condition === 'NEW').length}
            </div>
            <div className="text-sm text-muted-foreground">New Items</div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Component Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockInventoryData.map((item) => {
              const stockStatus = getStockStatus(item.quantity);
              return (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="font-medium">{item.name}</div>
                      <Badge variant="outline">{item.componentType}</Badge>
                      <Badge variant={getConditionVariant(item.condition) as any}>
                        {item.condition}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Location: {item.location} • Last updated: {item.lastUpdated.toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-lg font-bold ${stockStatus.color}`}>
                      {item.quantity}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stockStatus.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Component Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Component Type Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(
              mockInventoryData.reduce((acc, item) => {
                acc[item.componentType] = (acc[item.componentType] || 0) + item.quantity;
                return acc;
              }, {} as Record<ComponentType, number>)
            ).map(([componentType, quantity]) => (
              <div key={componentType} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{componentType}</span>
                  <span>{quantity} units</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ 
                      width: `${Math.min((quantity / Math.max(...Object.values(mockInventoryData.reduce((acc, item) => {
                        acc[item.componentType] = (acc[item.componentType] || 0) + item.quantity;
                        return acc;
                      }, {} as Record<ComponentType, number>)))) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}