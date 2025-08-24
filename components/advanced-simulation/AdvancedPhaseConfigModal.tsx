import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderPhase, PhaseConfig } from '@/types/advanced-factory';

interface AdvancedPhaseConfigModalProps {
  phase: OrderPhase | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (phase: OrderPhase, config: PhaseConfig) => void;
  currentConfig: PhaseConfig | null;
}

export function AdvancedPhaseConfigModal({
  phase,
  isOpen,
  onClose,
  onSave,
  currentConfig
}: AdvancedPhaseConfigModalProps) {
  const [config, setConfig] = useState<PhaseConfig>({
    name: '',
    baseProcessingTime: 0,
    stochasticVariation: 0,
    disruptionProbability: 0,
    disruptionDelayMin: 0,
    disruptionDelayMax: 0
  });

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  const handleSave = () => {
    if (phase) {
      onSave(phase, config);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Configure Phase: {config.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="baseTime" className="text-right">
              Base Time (min)
            </Label>
            <Input
              id="baseTime"
              type="number"
              value={config.baseProcessingTime}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                baseProcessingTime: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="variation" className="text-right">
              Variation (0-1)
            </Label>
            <Input
              id="variation"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={config.stochasticVariation}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                stochasticVariation: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="disruption" className="text-right">
              Disruption Prob (0-1)
            </Label>
            <Input
              id="disruption"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={config.disruptionProbability}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                disruptionProbability: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="delayMin" className="text-right">
              Min Delay (min)
            </Label>
            <Input
              id="delayMin"
              type="number"
              value={config.disruptionDelayMin}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                disruptionDelayMin: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="delayMax" className="text-right">
              Max Delay (min)
            </Label>
            <Input
              id="delayMax"
              type="number"
              value={config.disruptionDelayMax}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                disruptionDelayMax: Number(e.target.value) 
              }))}
              className="col-span-3"
            />
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