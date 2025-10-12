// Shared enum-like constants for SQLite schema (string fields)

export const AuftragsPhase = {
  AUFTRAGSANNAHME: 'AUFTRAGSANNAHME',
  INSPEKTION: 'INSPEKTION',
  REASSEMBLY_START: 'REASSEMBLY_START',
  REASSEMBLY_ENDE: 'REASSEMBLY_ENDE',
  QUALITAETSPRUEFUNG: 'QUALITAETSPRUEFUNG',
  AUFTRAGSABSCHLUSS: 'AUFTRAGSABSCHLUSS',
} as const

export type AuftragsPhase = typeof AuftragsPhase[keyof typeof AuftragsPhase]

export const Schichtmodell = {
  EINSCHICHT: 'EINSCHICHT',
  ZWEISCHICHT: 'ZWEISCHICHT',
  DREISCHICHT: 'DREISCHICHT',
} as const

export type Schichtmodell = typeof Schichtmodell[keyof typeof Schichtmodell]

