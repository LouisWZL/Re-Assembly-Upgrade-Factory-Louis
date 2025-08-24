import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderWithDetails } from '@/types/advanced-factory';

interface AdvancedOrderDetailsModalProps {
  orderData: OrderWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

export function AdvancedOrderDetailsModal({
  orderData,
  isOpen,
  onClose
}: AdvancedOrderDetailsModalProps) {
  const { order, processSteps, components, productionStepTimings, demontageStepTimings } = orderData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Order Details: {order.order_number}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          {/* Order Information */}
          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Customer</div>
                  <div className="text-sm text-muted-foreground">{order.customer_name}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
                    {order.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium">Current Phase</div>
                  <div className="text-sm text-muted-foreground">{order.current_phase}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Delivery Date</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(order.delivery_date).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Created</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Total Processing Time</div>
                  <div className="text-sm text-muted-foreground">{order.total_processing_time} min</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Process Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Process Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {processSteps.map((step, index) => (
                  <div key={step.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{step.phase}</div>
                        <div className="text-sm text-muted-foreground">
                          Started: {new Date(step.started_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {step.duration_minutes && (
                        <div className="text-sm font-medium">{step.duration_minutes} min</div>
                      )}
                      {step.was_rework && (
                        <Badge variant="outline" className="text-xs">Rework</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Components */}
          <Card>
            <CardHeader>
              <CardTitle>Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {components.map((component) => (
                  <div key={component.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{component.component_type}</div>
                      <div className="text-sm text-muted-foreground">
                        Condition: {component.condition_percentage}%
                      </div>
                    </div>
                    <div className="text-right">
                      {component.reassembly_type && (
                        <Badge variant={component.reassembly_type === 'PFLICHT' ? 'destructive' : 'default'}>
                          {component.reassembly_type}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Timing Details */}
          {(productionStepTimings.length > 0 || demontageStepTimings.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Detailed Timings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {productionStepTimings.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Production Steps</h4>
                      <div className="space-y-1">
                        {productionStepTimings.map((timing: any) => (
                          <div key={timing.id} className="text-sm flex justify-between">
                            <span>{timing.componentType} - {timing.stationId}</span>
                            <span>{timing.durationMinutes || 0} min</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {demontageStepTimings.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Demontage Steps</h4>
                      <div className="space-y-1">
                        {demontageStepTimings.map((timing: any) => (
                          <div key={timing.id} className="text-sm flex justify-between">
                            <span>{timing.componentType} - {timing.stationId}</span>
                            <span>{timing.durationMinutes || 0} min</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}