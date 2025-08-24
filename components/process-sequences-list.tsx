'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChevronRight } from 'lucide-react'

interface ProcessSequence {
  id: string
  steps: string[]
  totalSteps: number
  demontageSteps: number
  remontageSteps: number
}

interface ProcessSequencesListProps {
  sequences?: {
    sequences: ProcessSequence[]
  }
}

export function ProcessSequencesList({ sequences }: ProcessSequencesListProps) {
  if (!sequences || !sequences.sequences || sequences.sequences.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Keine Sequenzen verfügbar
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">Prozesssequenzen</span>
        <Badge variant="secondary">
          {sequences.sequences.length} {sequences.sequences.length === 1 ? 'Sequenz' : 'Sequenzen'}
        </Badge>
      </div>
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-3">
          {sequences.sequences.map((seq, index) => (
            <div key={seq.id} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  #{index + 1}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    {seq.steps.map((step, stepIndex) => (
                      <div key={stepIndex} className="flex items-center">
                        {step === '×' ? (
                          <span className="mx-2 text-muted-foreground font-bold">×</span>
                        ) : step === 'I' ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {step}
                          </Badge>
                        ) : step === 'Q' ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {step}
                          </Badge>
                        ) : stepIndex < seq.steps.indexOf('×') ? (
                          // Demontage steps
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                            {step}
                          </Badge>
                        ) : (
                          // Remontage steps
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            {step}
                          </Badge>
                        )}
                        {stepIndex < seq.steps.length - 1 && step !== '×' && seq.steps[stepIndex + 1] !== '×' && (
                          <ChevronRight className="h-3 w-3 mx-1 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Demontage: {seq.demontageSteps} Schritte</span>
                    <span>Remontage: {seq.remontageSteps} Schritte</span>
                    <span>Gesamt: {seq.totalSteps} Schritte</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}