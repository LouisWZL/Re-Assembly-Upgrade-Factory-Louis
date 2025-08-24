import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductionStation } from '@/types/advanced-factory';

interface AdvancedStationConfigModalProps {
  station: ProductionStation | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (station: ProductionStation) => void;
}

export function AdvancedStationConfigModal({
  station,
  isOpen,
  onClose,
  onSave
}: AdvancedStationConfigModalProps) {
  const [config, setConfig] = useState<Partial<ProductionStation>>({});

  useEffect(() => {
    if (station) {
      setConfig({ ...station });
    }
  }, [station]);

  const handleSave = () => {
    if (station && config) {
      onSave({ ...station, ...config } as ProductionStation);
    }
  };

  if (!station) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Configure Station: {station.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={config.name || ''}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                name: e.target.value 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="processingTime" className="text-right">
              Processing Time (min)
            </Label>
            <Input
              id="processingTime"
              type="number"
              value={config.processingTime || 0}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                processingTime: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="efficiency" className="text-right">
              Efficiency (%)
            </Label>
            <Input
              id="efficiency"
              type="number"
              min="0"
              max="100"
              value={config.efficiency || 0}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                efficiency: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="text-sm text-muted-foreground space-y-1">
            <div><strong>Station Type:</strong> {station.stationType}</div>
            <div><strong>Component Type:</strong> {station.componentType}</div>
            <div><strong>Line Number:</strong> {station.lineNumber}</div>
            <div><strong>Status:</strong> {station.isOccupied ? 'Occupied' : 'Available'}</div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}