import { OrderPhase, PhaseConfig } from '@/types/advanced-factory';

// Default phase configurations for advanced simulation
export const advancedPhaseConfigs: Record<OrderPhase, PhaseConfig> = {
  ORDER_ACCEPTANCE: {
    name: 'Auftragseingang',
    baseProcessingTime: 5,
    stochasticVariation: 0.2,
    disruptionProbability: 0.05,
    disruptionDelayMin: 2,
    disruptionDelayMax: 10
  },
  INSPECTION: {
    name: 'Inspektion',
    baseProcessingTime: 15,
    stochasticVariation: 0.3,
    disruptionProbability: 0.1,
    disruptionDelayMin: 5,
    disruptionDelayMax: 20
  },
  DEMONTAGE: {
    name: 'Demontage',
    baseProcessingTime: 20,
    stochasticVariation: 0.25,
    disruptionProbability: 0.08,
    disruptionDelayMin: 5,
    disruptionDelayMax: 15
  },
  PRODUCTION: {
    name: 'Produktion',
    baseProcessingTime: 120,
    stochasticVariation: 0.25,
    disruptionProbability: 0.15,
    disruptionDelayMin: 10,
    disruptionDelayMax: 60
  },
  QUALITY_CHECK: {
    name: 'Qualitätsprüfung',
    baseProcessingTime: 20,
    stochasticVariation: 0.4,
    disruptionProbability: 0.12,
    disruptionDelayMin: 5,
    disruptionDelayMax: 30
  },
  SHIPPING: {
    name: 'Versand',
    baseProcessingTime: 10,
    stochasticVariation: 0.2,
    disruptionProbability: 0.08,
    disruptionDelayMin: 5,
    disruptionDelayMax: 25
  },
  COMPLETED: {
    name: 'Abgeschlossen',
    baseProcessingTime: 0,
    stochasticVariation: 0,
    disruptionProbability: 0,
    disruptionDelayMin: 0,
    disruptionDelayMax: 0
  }
};

// Calculate phase processing time with basic configuration
export function calculateAdvancedPhaseProcessingTime(phase: OrderPhase): number {
  const config = advancedPhaseConfigs[phase];
  return calculateAdvancedPhaseProcessingTimeWithConfig(phase, config);
}

// Calculate phase processing time with custom configuration
export function calculateAdvancedPhaseProcessingTimeWithConfig(phase: OrderPhase, config: PhaseConfig): number {
  const baseTime = config.baseProcessingTime;
  
  // Apply stochastic variation
  const variation = 1 + (Math.random() - 0.5) * 2 * config.stochasticVariation;
  let processingTime = baseTime * variation;
  
  // Check for disruption
  if (Math.random() < config.disruptionProbability) {
    const delay = config.disruptionDelayMin + 
      Math.random() * (config.disruptionDelayMax - config.disruptionDelayMin);
    processingTime += delay;
  }
  
  return Math.max(1, Math.round(processingTime)); // Minimum 1 minute
}

// Determine if quality rework is required
export function shouldRequireAdvancedQualityRework(): boolean {
  return Math.random() < 0.15; // 15% chance of requiring rework
}