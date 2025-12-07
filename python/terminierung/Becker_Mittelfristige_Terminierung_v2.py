#!/usr/bin/env python3
"""
Becker_Mittelfristige_Terminierung_v2
-------------------------------------

Mittelfristige Auftragsterminierung nach Becker (2025) mit:

1. Monte-Carlo-Zielfunktion (E[Tardiness] + λ Var[Tardiness])
2. Genetischem Algorithmus (GA) für Sequenzoptimierung
3. Priorisierung über geplante Verspätung / Schlupfzeit
4. Rüstzeitfreundlicher Losbildung via Jaccard-Ähnlichkeit
5. Optionaler Petri-Netz-Kapazitätscheck (nach Peng et al., 2019)

Ausgabe & Debug entsprechen Version 1, damit der Simulation Queue Monitor
alle Schnittstellen (Prioritäten, Routen, Batches, Visualisierungen) anzeigen kann.
"""

from __future__ import annotations

import base64
import io
import json
import math
import random
import statistics
import sys
from dataclasses import dataclass
from itertools import combinations
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:  # optional – Diagramme für den Queue Monitor
    import matplotlib.pyplot as plt  # type: ignore

    HAS_MATPLOTLIB = True
except Exception:  # pragma: no cover
    HAS_MATPLOTLIB = False


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------


@dataclass
class SequenceVariant:
    """Eine Sequenz-Variante mit ihren Operationen und Gesamtdauer."""
    seq_id: str
    steps: List[str]
    combined_ops: List[Dict[str, Any]]
    duration_tfn: Tuple[float, float, float]


@dataclass
class OrderData:
    order_id: str
    due_date: Optional[float]
    ready_at: float
    duration_tfn: Tuple[float, float, float]
    combined_ops: List[Dict[str, Any]]
    raw: Dict[str, Any]
    # NEU: Alle verfügbaren Sequenz-Varianten für diesen Auftrag
    sequence_variants: List[SequenceVariant] = None  # type: ignore

    def __post_init__(self):
        if self.sequence_variants is None:
            self.sequence_variants = []


@dataclass
class GAOrder:
    order_id: str
    ready_at: float
    due_date: float
    tfn: Tuple[float, float, float]
    signature: List[str]


@dataclass
class Place:
    place_id: str
    tokens: int


@dataclass
class Transition:
    op_id: str
    station: str
    duration: float
    pre_place: str
    post_place: str


class PetriNet:
    def __init__(self, places: Dict[str, Place], transitions: List[Transition]) -> None:
        self.places = places
        self.transitions = transitions[:]
        self.time = 0.0
        self.active: List[Tuple[Transition, float]] = []

    def enabled(self, transition: Transition) -> bool:
        return self.places[transition.pre_place].tokens > 0

    def fire(self, transition: Transition) -> None:
        self.places[transition.pre_place].tokens -= 1
        self.active.append((transition, self.time + transition.duration))

    def advance(self, dt: float) -> None:
        self.time += dt
        finished: List[Tuple[Transition, float]] = [pair for pair in self.active if pair[1] <= self.time]
        for transition, _ in finished:
            self.places[transition.post_place].tokens += 1
            self.active.remove((transition, _))

    def run_until_complete(self, horizon: float = 10000.0) -> bool:
        waiting = self.transitions[:]
        while waiting and self.time < horizon:
            fired = False
            for transition in waiting[:]:
                if self.enabled(transition):
                    self.fire(transition)
                    waiting.remove(transition)
                    fired = True
            if not fired:
                if not self.active:
                    return False
                dt = min(finish for _, finish in self.active) - self.time
                self.advance(dt)
        while self.active:
            dt = min(finish for _, finish in self.active) - self.time
            self.advance(dt)
        return True


# ---------------------------------------------------------------------------
# Basic Helpers
# ---------------------------------------------------------------------------


def load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    if not text.strip():
        return {}
    return json.loads(text)


def normalize_minutes(value: Any, fallback: float) -> float:
    if value is None:
        return float(fallback)
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return float(fallback)
    if numeric > 1e10:  # vermutlich Millisekunden
        numeric /= 60000.0
    return float(numeric)


def guess_tfn(duration: float, variation: float = 0.25) -> Tuple[float, float, float]:
    base = max(duration, 1.0)
    spread = max(base * variation, 1.0)
    lower = max(0.5, base - spread)
    upper = base + spread
    return (lower, base, upper)


def defuzzify_tfn(tfn: Tuple[float, float, float]) -> float:
    return sum(tfn) / 3.0


def random_triangular(rng: random.Random, tfn: Tuple[float, float, float]) -> float:
    a, m, b = tfn
    return rng.triangular(a, b, m)


def clone_operations(ops: Optional[Iterable[Any]]) -> List[Dict[str, Any]]:
    cloned: List[Dict[str, Any]] = []
    if not ops:
        return cloned
    for op in ops:
        if isinstance(op, dict):
            cloned.append(dict(op))
    return cloned


def parse_sequence_steps(process_sequences: Any) -> List[str]:
    """
    Extracts a simple list of step labels from processSequences JSON.
    Priority: baugruppentypen.sequences[0].steps, fallback baugruppen.sequences[0].steps.
    """
    try:
        if isinstance(process_sequences, str):
            process_sequences = json.loads(process_sequences)
    except Exception:
        return []
    if not isinstance(process_sequences, dict):
        return []

    def extract(block_name: str) -> List[str]:
        block = process_sequences.get(block_name)
        if not isinstance(block, dict):
            return []
        seqs = block.get("sequences")
        if not isinstance(seqs, list) or len(seqs) == 0:
            return []
        steps = seqs[0].get("steps")
        if isinstance(steps, list):
            return [str(s) for s in steps]
        return []

    steps = extract("baugruppentypen")
    if steps:
        return steps
    return extract("baugruppen")


def parse_all_sequence_variants(process_sequences: Any) -> List[Tuple[str, List[str]]]:
    """
    Parst ALLE Sequenz-Varianten aus processSequences JSON.
    Gibt Liste von (seq_id, steps) Tupeln zurück.
    Priority: baugruppentypen.sequences, fallback baugruppen.sequences.
    """
    try:
        if isinstance(process_sequences, str):
            process_sequences = json.loads(process_sequences)
    except Exception:
        return []
    if not isinstance(process_sequences, dict):
        return []

    def extract_all(block_name: str) -> List[Tuple[str, List[str]]]:
        block = process_sequences.get(block_name)
        if not isinstance(block, dict):
            return []
        seqs = block.get("sequences")
        if not isinstance(seqs, list) or len(seqs) == 0:
            return []
        variants = []
        for i, seq in enumerate(seqs):
            if not isinstance(seq, dict):
                continue
            seq_id = seq.get("id", f"seq-{i+1}")
            steps = seq.get("steps")
            if isinstance(steps, list):
                variants.append((seq_id, [str(s) for s in steps]))
        return variants

    variants = extract_all("baugruppentypen")
    if variants:
        return variants
    return extract_all("baugruppen")


def build_ops_from_sequence(
    steps: List[str],
    dem_ops: List[Dict[str, Any]],
    mon_ops: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Map sequence steps to operations with durations.

    Sequenz-Format: [I, BG1, BG2, ..., ×, BG3, BG4, ..., Q]
    - I = Inspektion (ignoriert)
    - Steps VOR × = Demontage-Reihenfolge
    - × = Trennzeichen zwischen Demontage und Remontage
    - Steps NACH × = Remontage-Reihenfolge
    - Q = Qualität (ignoriert)

    WICHTIG: Die Reihenfolge der BG-Steps bestimmt welche dem_ops/mon_ops verwendet werden!
    """
    result: List[Dict[str, Any]] = []

    # Finde den × Separator
    separator_idx = -1
    for i, step in enumerate(steps):
        if step.strip() == "×":
            separator_idx = i
            break

    if separator_idx == -1:
        # Fallback: Alte Logik wenn kein × gefunden
        print(f"WARN: build_ops_from_sequence - no × separator found, using legacy matching", file=sys.stderr)
        return _build_ops_legacy(steps, dem_ops, mon_ops)

    # Extrahiere Demontage-Steps (zwischen I und ×)
    dem_steps = []
    for i in range(separator_idx):
        step = steps[i].strip()
        # Ignoriere I (Inspektion) am Anfang
        if step.upper() == "I" or step.lower() == "inspektion":
            continue
        if step:
            dem_steps.append(step)

    # Extrahiere Remontage-Steps (nach × bis Q)
    mon_steps = []
    for i in range(separator_idx + 1, len(steps)):
        step = steps[i].strip()
        # Ignoriere Q (Qualität) am Ende
        if step.upper() == "Q" or step.lower() in ("qualität", "qualitaet", "quality"):
            continue
        if step:
            mon_steps.append(step)

    # Erstelle Mapping: Step-Name -> Op
    # Priority: meta.step (baugruppentyp), label, setupFamily, bg
    # Die Sequenz-Steps sind "BGT-PS-Fahrwerk" etc., die meta.step sollte auch "BGT-PS-Fahrwerk" sein
    dem_ops_by_name: Dict[str, Dict[str, Any]] = {}
    for op in dem_ops:
        meta = op.get("meta", {})
        # Primär: meta.step (enthält baugruppentyp wie "BGT-PS-Fahrwerk")
        primary_name = meta.get("step")
        # Fallbacks: label, setupFamily, bg
        fallback_name = op.get("label") or op.get("setupFamily") or op.get("bg") or op.get("id", "")

        if primary_name:
            dem_ops_by_name[primary_name] = op
        if fallback_name and fallback_name != primary_name:
            dem_ops_by_name[fallback_name] = op

    mon_ops_by_name: Dict[str, Dict[str, Any]] = {}
    for op in mon_ops:
        meta = op.get("meta", {})
        primary_name = meta.get("step")
        fallback_name = op.get("label") or op.get("setupFamily") or op.get("bg") or op.get("id", "")

        if primary_name:
            mon_ops_by_name[primary_name] = op
        if fallback_name and fallback_name != primary_name:
            mon_ops_by_name[fallback_name] = op

    # Debug: Log verfügbare Mappings
    print(f"DEBUG: build_ops_from_sequence called with {len(dem_ops)} dem_ops, {len(mon_ops)} mon_ops", file=sys.stderr)
    print(f"DEBUG: build_ops_from_sequence - raw dem_ops (first 2): {dem_ops[:2]}", file=sys.stderr)
    print(f"DEBUG: build_ops_from_sequence - raw mon_ops (first 2): {mon_ops[:2]}", file=sys.stderr)
    print(f"DEBUG: build_ops_from_sequence - dem_ops_by_name keys: {list(dem_ops_by_name.keys())}", file=sys.stderr)
    print(f"DEBUG: build_ops_from_sequence - mon_ops_by_name keys: {list(mon_ops_by_name.keys())}", file=sys.stderr)
    print(f"DEBUG: build_ops_from_sequence - dem_steps to match: {dem_steps}", file=sys.stderr)
    print(f"DEBUG: build_ops_from_sequence - mon_steps to match: {mon_steps}", file=sys.stderr)

    # Verarbeite Demontage-Steps in Sequenz-Reihenfolge
    matched_dem = 0
    for step_name in dem_steps:
        op = dem_ops_by_name.get(step_name)
        if not op:
            # Fallback: Versuche Prefix-Matching (BGT-PS-Fahrwerk -> BG-PS-Fahrwerk oder umgekehrt)
            for key, candidate_op in dem_ops_by_name.items():
                # Versuche verschiedene Matchings
                if step_name in key or key in step_name:
                    op = candidate_op
                    break
                # BGT-PS-X <-> BG-PS-X (entferne T)
                step_normalized = step_name.replace("BGT-", "BG-")
                key_normalized = key.replace("BGT-", "BG-")
                if step_normalized == key_normalized:
                    op = candidate_op
                    break

        if op:
            dur = float(op.get("expectedDuration", 0.0))
            if dur > 0:
                result.append({
                    "id": op.get("id"),
                    "stationId": op.get("stationId", "demontage"),
                    "expectedDuration": dur,
                    "meta": op.get("meta", {}),
                    "sequenceStep": step_name,
                })
                matched_dem += 1

    # Verarbeite Remontage-Steps in Sequenz-Reihenfolge
    matched_mon = 0
    for step_name in mon_steps:
        op = mon_ops_by_name.get(step_name)
        if not op:
            # Fallback: Versuche Prefix-Matching
            for key, candidate_op in mon_ops_by_name.items():
                if step_name in key or key in step_name:
                    op = candidate_op
                    break
                step_normalized = step_name.replace("BGT-", "BG-")
                key_normalized = key.replace("BGT-", "BG-")
                if step_normalized == key_normalized:
                    op = candidate_op
                    break

        if op:
            dur = float(op.get("expectedDuration", 0.0))
            if dur > 0:
                result.append({
                    "id": op.get("id"),
                    "stationId": op.get("stationId", "reassembly"),
                    "expectedDuration": dur,
                    "meta": op.get("meta", {}),
                    "sequenceStep": step_name,
                })
                matched_mon += 1

    if len(result) == 0 and (dem_steps or mon_steps):
        print(f"ERROR: build_ops_from_sequence produced 0 ops! dem_keys={list(dem_ops_by_name.keys())}, mon_keys={list(mon_ops_by_name.keys())}, dem_steps={dem_steps}, mon_steps={mon_steps}", file=sys.stderr)
    print(f"INFO: build_ops_from_sequence - matched {matched_dem}/{len(dem_steps)} dem + {matched_mon}/{len(mon_steps)} mon -> {len(result)} ops", file=sys.stderr)
    return result


def _build_ops_legacy(
    steps: List[str],
    dem_ops: List[Dict[str, Any]],
    mon_ops: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Legacy-Fallback: Alte Logik für Sequenzen ohne × Separator.
    """
    dem_idx = 0
    mon_idx = 0
    result: List[Dict[str, Any]] = []

    for raw in steps:
        label = str(raw).strip()
        lower = label.lower()
        is_dem = (
            lower.startswith("demontage") or lower.startswith("dem") or lower.startswith("d-") or
            "dem" in lower or "zerlegen" in lower or "abbau" in lower or
            "disassembly" in lower or "teardown" in lower or "removal" in lower
        )
        if is_dem:
            if dem_idx < len(dem_ops):
                op = dem_ops[dem_idx]
                dem_idx += 1
                dur = float(op.get("expectedDuration", 0.0))
                if dur > 0:
                    result.append({
                        "id": op.get("id"),
                        "stationId": op.get("stationId", "demontage"),
                        "expectedDuration": dur,
                        "meta": op.get("meta", {}),
                    })
        elif (
            lower.startswith("montage") or lower.startswith("mon") or lower.startswith("m-") or
            "mon" in lower or "zusammenbau" in lower or "aufbau" in lower or
            "assembly" in lower or "reassembly" in lower or "installation" in lower
        ):
            if mon_idx < len(mon_ops):
                op = mon_ops[mon_idx]
                mon_idx += 1
                dur = float(op.get("expectedDuration", 0.0))
                if dur > 0:
                    result.append({
                        "id": op.get("id"),
                        "stationId": op.get("stationId", "reassembly"),
                        "expectedDuration": dur,
                        "meta": op.get("meta", {}),
                    })

    return result


def simulate_with_capacity(
    sequence: Sequence[int],
    orders: Sequence[GAOrder],
    ops_by_order: Dict[str, List[Dict[str, Any]]],
    dem_machines: int,
    mon_machines: int,
    with_timeline: bool = False,
    dem_flex_share: float = 0.0,
    mon_flex_share: float = 0.0,
    setup_minutes: float = 0.0,
) -> Tuple[float, float, float, Optional[List[Dict[str, Any]]]]:
    """
    Parallelmaschinen-Simulation mit Ressourcenpools Demontage/Montage.
    - Ops werden AUFTRAGSSEQUENTIELL abgearbeitet: nächste Op erst nach Abschluss der vorherigen.
    - Fixed machines werden VORAB nach durchschnittlicher Bearbeitungszeit zugewiesen:
      Fixe Station 1 = längste Baugruppe, Fixe Station 2 = 2. längste, usw.
    - Flexible machines können alle Typen bearbeiten. Bei BG-Typ-Wechsel wird Setup-Zeit addiert.
    - Pro Op wird die beste verfügbare Maschine gewählt (Priorität: Reuse fixed > Flex > New fixed).
    - Gibt (mean tardiness, variance tardiness, total setup time, timeline?) zurück.
    """
    tardiness_vals: List[float] = []
    timeline: List[Dict[str, Any]] = []
    total_setup_time = 0.0  # Track total setup time for fitness penalty
    # Gemeinsame Maschinenverfügbarkeit über alle Aufträge
    if not orders:
        return 0.0, 0.0, 0.0, (timeline if with_timeline else None)
    base_time = min(o.ready_at for o in orders)
    dem_total = max(1, dem_machines)
    mon_total = max(1, mon_machines)
    dem_flex_count = max(0, min(dem_total, int(round(dem_total * dem_flex_share)))) if dem_flex_share > 0 else 0
    mon_flex_count = max(0, min(mon_total, int(round(mon_total * mon_flex_share)))) if mon_flex_share > 0 else 0
    dem_fixed = dem_total - dem_flex_count
    mon_fixed = mon_total - mon_flex_count
    dem_available = [base_time] * dem_total
    mon_available = [base_time] * mon_total

    # NEU: Vorab-Zuweisung der fixen Stationen nach längster durchschnittlicher Bearbeitungszeit
    # Sammle durchschnittliche Dauer pro Baugruppentyp (step) für Demontage und Montage
    dem_step_durations: Dict[str, List[float]] = {}
    mon_step_durations: Dict[str, List[float]] = {}

    for order in orders:
        ops = ops_by_order.get(order.order_id, [])
        for op in ops:
            station = (op.get("stationId") or "").lower()
            step = op.get("meta", {}).get("step") if isinstance(op.get("meta"), dict) else None
            dur = float(op.get("expectedDuration") or 0.0)
            if step and dur > 0:
                if "dem" in station:
                    if step not in dem_step_durations:
                        dem_step_durations[step] = []
                    dem_step_durations[step].append(dur)
                else:
                    if step not in mon_step_durations:
                        mon_step_durations[step] = []
                    mon_step_durations[step].append(dur)

    # Berechne durchschnittliche Dauer und sortiere absteigend
    dem_step_avg = [(step, sum(durs) / len(durs)) for step, durs in dem_step_durations.items()]
    mon_step_avg = [(step, sum(durs) / len(durs)) for step, durs in mon_step_durations.items()]
    dem_step_avg.sort(key=lambda x: -x[1])  # Absteigend nach Dauer
    mon_step_avg.sort(key=lambda x: -x[1])

    # Weise fixen Stationen vorab die Baugruppentypen zu
    # Station 0 = längste Baugruppe, Station 1 = 2. längste, usw.
    dem_last_step: List[Optional[str]] = [None] * dem_total
    mon_last_step: List[Optional[str]] = [None] * mon_total

    for i, (step, avg_dur) in enumerate(dem_step_avg):
        if i < dem_fixed:
            dem_last_step[i] = step

    for i, (step, avg_dur) in enumerate(mon_step_avg):
        if i < mon_fixed:
            mon_last_step[i] = step

    # Debug-Ausgabe für die Vorab-Zuweisung (nur bei Timeline-Output, da sonst zu viel Output)
    if with_timeline:
        print(f"[SIM] Fixed station pre-assignment based on avg duration:", file=sys.stderr)
        print(f"  DEM fixed assignments ({dem_fixed} stations): {dem_last_step[:dem_fixed]}", file=sys.stderr)
        print(f"  DEM step avg durations: {dem_step_avg}", file=sys.stderr)
        print(f"  MON fixed assignments ({mon_fixed} stations): {mon_last_step[:mon_fixed]}", file=sys.stderr)
        print(f"  MON step avg durations: {mon_step_avg}", file=sys.stderr)

    # Statistik für abgelehnte Ops
    rejection_stats = {"demDurationZero": 0, "monDurationZero": 0, "demNoMachine": 0, "monNoMachine": 0}

    # Machine allocation stats
    machine_usage_stats = {"dem_fixed": 0, "dem_flex": 0, "mon_fixed": 0, "mon_flex": 0}

    # Log machine allocation
    print(f"[SIM] Machine allocation: DEM total={dem_total} (fixed={dem_fixed}, flex={dem_flex_count}), MON total={mon_total} (fixed={mon_fixed}, flex={mon_flex_count})", file=sys.stderr)

    for idx in sequence:
        order = orders[idx]
        ops = ops_by_order.get(order.order_id, [])
        op_end_times: List[float] = []
        # WICHTIG: Auftragsuhr zwingt sequentielle Abarbeitung innerhalb des Auftrags
        order_clock = order.ready_at
        for op in ops:
            station = (op.get("stationId") or "").lower()
            step = op.get("meta", {}).get("step") if isinstance(op.get("meta"), dict) else None
            dur = float(op.get("expectedDuration") or 0.0)
            if dur <= 0:
                print(f"ERROR: Op for order {order.order_id} has duration <= 0: {dur} - SKIPPING OP (no fallback!)", file=sys.stderr)
                rejection_stats["demDurationZero" if "dem" in station else "monDurationZero"] += 1
                continue
            if "dem" in station:
                # Maschinenwahl-Strategie (Fixed machines sind VORAB nach Dauer zugewiesen!):
                # 1. Nutze die fixe Station, die diesem Baugruppentyp (step) zugewiesen ist
                # 2. Sonst nutze flexible machine (kann umgerüstet werden mit setupMinutes)
                # 3. ABLEHNUNG wenn keine passende Maschine verfügbar
                chosen_idx = None
                setup_applied = False
                machine_type = "unknown"

                # 1. Fixed: Nutze die fixe Station, die diesem step zugewiesen ist
                if dem_fixed > 0 and step:
                    for i in range(dem_fixed):
                        if dem_last_step[i] == step:
                            chosen_idx = i
                            machine_type = "fixed"
                            machine_usage_stats["dem_fixed"] += 1
                            break

                # 2. Flex: flexible machine (kann umgerüstet werden)
                if chosen_idx is None and dem_flex_count > 0:
                    flex_earliest_time = float('inf')
                    flex_earliest_idx = None
                    for i in range(dem_fixed, dem_total):
                        if dem_available[i] < flex_earliest_time:
                            flex_earliest_time = dem_available[i]
                            flex_earliest_idx = i
                    if flex_earliest_idx is not None:
                        chosen_idx = flex_earliest_idx
                        machine_type = "flex"
                        machine_usage_stats["dem_flex"] += 1
                        # Setup nur auf flex machines bei Typ-Wechsel
                        if setup_minutes > 0 and dem_last_step[chosen_idx] is not None and dem_last_step[chosen_idx] != step:
                            setup_applied = True

                # 3. Fallback: FEHLER - keine passende Maschine verfügbar
                if chosen_idx is None:
                    print(f"WARNING: Op {order.order_id} step {step} ABGELEHNT - keine fixe Station für diesen BGT zugewiesen und keine flex verfügbar!", file=sys.stderr)
                    rejection_stats["demNoMachine"] += 1
                    # Skip diese Op
                    continue

                # Startzeit: max(Auftrag bereit, Maschine verfügbar) + ggf. Setup
                start = max(order_clock, dem_available[chosen_idx])
                if setup_applied:
                    start += setup_minutes
                    total_setup_time += setup_minutes  # Count setup time for fitness
                end = start + dur
                dem_available[chosen_idx] = end
                dem_last_step[chosen_idx] = step
                machine = f"DEM-{chosen_idx+1}"
                order_clock = end  # Sequenziell weiter
            else:
                # Montage: gleiche Logik wie Demontage (Fixed machines sind VORAB nach Dauer zugewiesen!)
                chosen_idx = None
                setup_applied = False
                machine_type = "unknown"

                # 1. Fixed: Nutze die fixe Station, die diesem step zugewiesen ist
                if mon_fixed > 0 and step:
                    for i in range(mon_fixed):
                        if mon_last_step[i] == step:
                            chosen_idx = i
                            machine_type = "fixed"
                            machine_usage_stats["mon_fixed"] += 1
                            break

                # 2. Flex: flexible machine (kann umgerüstet werden)
                if chosen_idx is None and mon_flex_count > 0:
                    flex_earliest_time = float('inf')
                    flex_earliest_idx = None
                    for i in range(mon_fixed, mon_total):
                        if mon_available[i] < flex_earliest_time:
                            flex_earliest_time = mon_available[i]
                            flex_earliest_idx = i
                    if flex_earliest_idx is not None:
                        chosen_idx = flex_earliest_idx
                        machine_type = "flex"
                        machine_usage_stats["mon_flex"] += 1
                        # Setup nur auf flex machines bei Typ-Wechsel
                        if setup_minutes > 0 and mon_last_step[chosen_idx] is not None and mon_last_step[chosen_idx] != step:
                            setup_applied = True

                # 3. Fallback: FEHLER - keine passende Maschine verfügbar
                if chosen_idx is None:
                    print(f"WARNING: Op {order.order_id} step {step} ABGELEHNT - keine fixe Station für diesen BGT zugewiesen und keine flex verfügbar!", file=sys.stderr)
                    rejection_stats["monNoMachine"] += 1
                    # Skip diese Op
                    continue

                start = max(order_clock, mon_available[chosen_idx])
                if setup_applied:
                    start += setup_minutes
                    total_setup_time += setup_minutes  # Count setup time for fitness
                end = start + dur
                mon_available[chosen_idx] = end
                mon_last_step[chosen_idx] = step
                machine = f"MON-{chosen_idx+1}"
                order_clock = end
            op_end_times.append(end)
            if with_timeline:
                timeline.append({
                    "orderId": order.order_id,
                    "station": machine,
                    "stationType": "dem" if "dem" in station else "mon",
                    "machineType": machine_type,  # fixed, flex
                    "bgType": step if step else "unknown",  # Baugruppentyp
                    "step": step,
                    "start": start,
                    "end": end,
                    "duration": dur,
                    "setupApplied": setup_applied,
                })
        completion = max(op_end_times) if op_end_times else order.ready_at
        tardiness = max(0.0, completion - order.due_date)
        tardiness_vals.append(tardiness)

    # Log machine usage statistics
    total_ops = sum(machine_usage_stats.values())
    if total_ops > 0:
        print(f"[SIM] Machine usage: DEM(fixed={machine_usage_stats['dem_fixed']}, flex={machine_usage_stats['dem_flex']}), MON(fixed={machine_usage_stats['mon_fixed']}, flex={machine_usage_stats['mon_flex']}) | Total ops: {total_ops}", file=sys.stderr)

    if any(rejection_stats.values()):
        print(f"WARNING: simulate_with_capacity REJECTIONS: {rejection_stats}", file=sys.stderr)
    mean_val = statistics.fmean(tardiness_vals) if tardiness_vals else 0.0
    var_val = statistics.pvariance(tardiness_vals) if len(tardiness_vals) > 1 else 0.0
    return mean_val, var_val, total_setup_time, (timeline if with_timeline else None)


def simulate_multistation(
    sequence: Sequence[int],
    orders: Sequence[GAOrder],
    ops_by_order: Dict[str, List[Dict[str, Any]]],
    station_caps: Dict[str, int],
    setup_minutes: float,
) -> Tuple[float, float, float, List[Dict[str, Any]]]:
    """
    Generische Stations-Simulation:
    - Jede Station hat N Maschinen (alle flexibel).
    - Setup-Minuten werden addiert, wenn sich setupFamily ändert.
    - Fixed/Matrix wird nicht genutzt (gewünschtes vereinfachtes Modell).
    """
    station_state: Dict[str, List[Dict[str, Any]]] = {
        sid: [{"ready": 0.0, "family": None} for _ in range(cap)] for sid, cap in station_caps.items()
    }
    timeline: List[Dict[str, Any]] = []
    makespan = 0.0
    total_setup = 0.0
    total_tardiness = 0.0

    for idx in sequence:
        order = orders[idx]
        ops = ops_by_order.get(order.order_id, [])
        order_clock = order.ready_at
        for op in ops:
            station = str(op.get("stationId") or op.get("station") or "station")
            if station not in station_state:
                raise ValueError(f"Unknown station '{station}' in op for order {order.order_id}")
            machines = station_state[station]
            family = op.get("setupFamily") or (op.get("meta", {}) if isinstance(op.get("meta"), dict) else {}).get("step") or op.get("bg")
            try:
                dur = float(op.get("expectedDuration") or op.get("proc") or 0.0)
            except Exception:
                dur = 0.0
            if dur <= 0:
                raise ValueError(f"Invalid duration {dur} for op on station {station} (order {order.order_id})")

            best = None
            for m_idx, m in enumerate(machines):
                setup = setup_minutes if (m["family"] is not None and m["family"] != family) else 0.0
                start = max(order_clock, m["ready"]) + setup
                end = start + dur
                if best is None or end < best["end"]:
                    best = {"machine": m, "machineIdx": m_idx, "start": start, "end": end, "setup": setup}
            chosen = best
            if chosen is None:
                raise ValueError(f"No machine available for station {station}")
            m = chosen["machine"]
            m["ready"] = chosen["end"]
            m["family"] = family
            order_clock = chosen["end"]
            total_setup += chosen["setup"]
            makespan = max(makespan, chosen["end"])
            timeline.append({
                "orderId": order.order_id,
                "station": f"{station}-{chosen['machineIdx']+1}",
                "stationType": station,
                "machineType": "flex",
                "bgType": family or "unknown",
                "step": family or "unknown",
                "start": chosen["start"],
                "end": chosen["end"],
                "duration": dur,
                "setupApplied": chosen["setup"] > 0,
            })
        total_tardiness += max(0.0, order_clock - order.due_date)

    return makespan, total_tardiness, total_setup, timeline


# ---------------------------------------------------------------------------
# GA – Version Becker 2025
# ---------------------------------------------------------------------------


def simulate_sequence(
    sequence: Sequence[int],
    orders: Sequence[GAOrder],
    replications: int,
    seed: int,
) -> Tuple[float, float]:
    totals: List[float] = []
    for r in range(replications):
        rng = random.Random(seed + r * 7919)
        t = 0.0
        total_tardiness = 0.0
        for idx in sequence:
            order = orders[idx]
            t = max(t, order.ready_at)
            t += random_triangular(rng, order.tfn)
            total_tardiness += max(0.0, t - order.due_date)
        totals.append(total_tardiness)
    mean_val = statistics.fmean(totals)
    var_val = statistics.pvariance(totals) if len(totals) > 1 else 0.0
    return mean_val, var_val


# ---------------------------------------------------------------------------
# GA mit Sequenz-Varianten-Optimierung (NEU)
# ---------------------------------------------------------------------------

# Ein Individuum ist eine Liste von (order_idx, variant_idx) Tupeln
# Die Reihenfolge der Tupel bestimmt die Auftragsreihenfolge
# variant_idx bestimmt welche Sequenz-Variante für diesen Auftrag verwendet wird

IndividualWithVariants = List[Tuple[int, int]]  # [(order_idx, variant_idx), ...]


def crossover_with_variants(
    parent_a: IndividualWithVariants,
    parent_b: IndividualWithVariants,
    rng: random.Random
) -> IndividualWithVariants:
    """
    Order-Crossover für Individuen mit Sequenz-Varianten.
    Erhält die Auftragsreihenfolge via OX und übernimmt Varianten-Wahl von den Eltern.
    """
    n = len(parent_a)
    if n <= 2:
        return parent_a[:]

    i, j = sorted(rng.sample(range(n), 2))
    child: List[Optional[Tuple[int, int]]] = [None] * n

    # Kopiere Segment von parent_a
    child[i:j] = parent_a[i:j]

    # Order-Indizes die bereits im Kind sind
    used_order_idxs = {gene[0] for gene in child[i:j] if gene is not None}

    # Fülle Rest mit Genen von parent_b (in ihrer Reihenfolge), die noch nicht verwendet wurden
    fill = [gene for gene in parent_b if gene[0] not in used_order_idxs]
    pointer = 0
    for idx in range(n):
        if child[idx] is None:
            child[idx] = fill[pointer]
            pointer += 1

    return [(g[0], g[1]) for g in child if g is not None]


def mutate_with_variants(
    individual: IndividualWithVariants,
    variant_counts: List[int],
    rng: random.Random,
    swap_rate: float = 0.1,
    variant_rate: float = 0.15
) -> None:
    """
    Mutation für Individuen mit Sequenz-Varianten:
    1. Swap-Mutation: Tausche zwei Aufträge in der Reihenfolge
    2. Varianten-Mutation: Ändere die Sequenz-Variante eines Auftrags
    """
    n = len(individual)

    # Swap-Mutation (Auftragsreihenfolge)
    if rng.random() < swap_rate and n >= 2:
        i, j = rng.sample(range(n), 2)
        individual[i], individual[j] = individual[j], individual[i]

    # Varianten-Mutation (Sequenz-Wahl)
    for idx in range(n):
        if rng.random() < variant_rate:
            order_idx, _ = individual[idx]
            num_variants = variant_counts[order_idx]
            if num_variants > 1:
                # Wähle eine andere Variante
                new_variant = rng.randint(0, num_variants - 1)
                individual[idx] = (order_idx, new_variant)


def optimize_with_variants_ga(
    orders: Sequence[OrderData],
    ga_orders: Sequence[GAOrder],
    variant_counts: List[int],
    ops_by_order_variants: Dict[str, List[List[Dict[str, Any]]]],  # order_id -> [variant0_ops, variant1_ops, ...]
    lam: float,
    population: int,
    generations: int,
    swap_rate: float,
    variant_rate: float,
    elite: int,
    seed: int,
    eval_fn_with_variants: Any,
    setup_weight: float = 0.0,
) -> Tuple[IndividualWithVariants, List[float], Tuple[float, float, float], Optional[List[Dict[str, Any]]], Dict[str, int]]:
    """
    GA der sowohl Auftragsreihenfolge ALS AUCH Sequenz-Variante pro Auftrag optimiert.

    Returns:
        best_individual: [(order_idx, variant_idx), ...]
        history: Fitness-Verlauf
        best_components: (mu, var, setup)
        best_timeline: Optional Timeline
        chosen_variants: {order_id: variant_idx} - gewählte Varianten pro Auftrag
    """
    rng = random.Random(seed)
    n = len(orders)

    # Initiale Population
    pop: List[IndividualWithVariants] = []

    # Individuum 1: Auftragsreihenfolge [0,1,2,...], alle Variante 0
    pop.append([(i, 0) for i in range(n)])

    # Individuum 2: SPT-Sortierung, alle Variante 0
    spt_order = sorted(range(n), key=lambda i: defuzzify_tfn(ga_orders[i].tfn))
    pop.append([(i, 0) for i in spt_order])

    # Individuum 3: EDD-Sortierung, alle Variante 0
    edd_order = sorted(range(n), key=lambda i: ga_orders[i].due_date)
    pop.append([(i, 0) for i in edd_order])

    # Restliche Individuen: Zufällige Reihenfolge und zufällige Varianten
    while len(pop) < population:
        order_idxs = list(range(n))
        rng.shuffle(order_idxs)
        individual = [(i, rng.randint(0, max(0, variant_counts[i] - 1))) for i in order_idxs]
        pop.append(individual)

    best_individual = pop[0][:]
    best_val = float("inf")
    best_components = (0.0, 0.0, 0.0)
    best_timeline: Optional[List[Dict[str, Any]]] = None
    history: List[float] = []

    # Cache mit Tupel-Key (order_seq, variant_seq)
    cache: Dict[Tuple[Tuple[int, ...], Tuple[int, ...]], Tuple[float, float, float, Optional[List[Dict[str, Any]]]]] = {}

    total_variants = sum(variant_counts)
    avg_variants = total_variants / n if n > 0 else 0
    print(f"[GA-V] Starting with {n} orders, {total_variants} total variants (avg {avg_variants:.1f}/order), pop={population}, gen={generations}", file=sys.stderr)

    for g in range(generations):
        fitness_vals: List[float] = []
        mu_var_setup_tuples: List[Tuple[float, float, float]] = []

        for individual in pop:
            # Cache-Key: (Auftragsreihenfolge, Varianten-Wahl)
            order_seq = tuple(gene[0] for gene in individual)
            variant_seq = tuple(gene[1] for gene in individual)
            key = (order_seq, variant_seq)

            if key in cache:
                mu, var, setup, timeline = cache[key]
            else:
                eval_result = eval_fn_with_variants(individual)
                if len(eval_result) == 4:
                    mu, var, setup, timeline = eval_result
                else:
                    mu, var, setup = eval_result
                    timeline = None
                cache[key] = (mu, var, setup, timeline)

            obj = mu + lam * var + setup_weight * setup
            fitness_vals.append(obj)
            mu_var_setup_tuples.append((mu, var, setup))

        gen_best_idx = min(range(len(pop)), key=lambda i: fitness_vals[i])
        gen_best_val = fitness_vals[gen_best_idx]

        if gen_best_val < best_val:
            best_val = gen_best_val
            best_individual = [gene for gene in pop[gen_best_idx]]
            best_components = mu_var_setup_tuples[gen_best_idx]
            order_seq = tuple(gene[0] for gene in best_individual)
            variant_seq = tuple(gene[1] for gene in best_individual)
            best_timeline = cache.get((order_seq, variant_seq), (0, 0, 0, None))[3]

        history.append(best_val)

        # Logging
        if g == 0:
            variants_used = len(set(gene[1] for gene in pop[gen_best_idx] if variant_counts[gene[0]] > 1))
            print(f"[GA-V] Gen 0: best={gen_best_val:.2f} (mu={mu_var_setup_tuples[gen_best_idx][0]:.2f}, var={mu_var_setup_tuples[gen_best_idx][1]:.2f}, setup={mu_var_setup_tuples[gen_best_idx][2]:.2f})", file=sys.stderr)
        elif g % 20 == 0 or g == generations - 1:
            improvement = "↓" if gen_best_val < (history[g-1] if g > 0 else float('inf')) else "→"
            print(f"[GA-V] Gen {g}: best={gen_best_val:.2f} {improvement}", file=sys.stderr)

        # Selektion: Elite
        elite_idx = sorted(range(len(pop)), key=lambda i: fitness_vals[i])[:max(1, elite)]
        next_pop = [[gene for gene in pop[i]] for i in elite_idx]

        # Neue Individuen erzeugen
        while len(next_pop) < population:
            parent_a, parent_b = rng.sample(pop, 2)
            child = crossover_with_variants(parent_a, parent_b, rng)
            mutate_with_variants(child, variant_counts, rng, swap_rate, variant_rate)
            next_pop.append(child)

        pop = next_pop

    # Erstelle chosen_variants Dict
    chosen_variants: Dict[str, int] = {}
    for order_idx, variant_idx in best_individual:
        order_id = orders[order_idx].order_id
        chosen_variants[order_id] = variant_idx

    # Log finale Varianten-Wahl
    non_default = sum(1 for v in chosen_variants.values() if v > 0)
    print(f"[GA-V] Final: {non_default}/{len(chosen_variants)} orders use non-default variant", file=sys.stderr)

    return best_individual, history, best_components, best_timeline, chosen_variants


def order_crossover(parent_a: List[int], parent_b: List[int], rng: random.Random) -> List[int]:
    n = len(parent_a)
    if n <= 2:
        return parent_a[:]
    i, j = sorted(rng.sample(range(n), 2))
    child = [None] * n
    child[i:j] = parent_a[i:j]
    fill = [gene for gene in parent_b if gene not in child[i:j]]
    pointer = 0
    for idx in range(n):
        if child[idx] is None:
            child[idx] = fill[pointer]
            pointer += 1
    return [int(x) for x in child]


def mutate_swap(seq: List[int], rng: random.Random, rate: float) -> None:
    if rng.random() < rate and len(seq) >= 2:
        i, j = rng.sample(range(len(seq)), 2)
        seq[i], seq[j] = seq[j], seq[i]


def optimize_sequence_ga(
    orders: Sequence[GAOrder],
    lam: float,
    population: int,
    generations: int,
    mutation_rate: float,
    elite: int,
    replications: int,
    seed: int,
    eval_fn: Optional[Any] = None,
    setup_weight: float = 0.0,
) -> Tuple[List[int], List[float], Tuple[float, float, float], Optional[List[Dict[str, Any]]]]:
    rng = random.Random(seed)
    n = len(orders)
    idxs = list(range(n))
    pop: List[List[int]] = []
    pop.append(idxs[:])
    spt = sorted(idxs, key=lambda i: defuzzify_tfn(orders[i].tfn))
    pop.append(spt)
    while len(pop) < population:
        candidate = idxs[:]
        rng.shuffle(candidate)
        pop.append(candidate)

    best_seq = pop[0][:]
    best_val = float("inf")
    best_components = (0.0, 0.0, 0.0)
    best_timeline: Optional[List[Dict[str, Any]]] = None
    history: List[float] = []
    cache: Dict[Tuple[int, ...], Tuple[float, float, float, Optional[List[Dict[str, Any]]]]] = {}

    for g in range(generations):
        fitness_vals: List[float] = []
        mu_var_setup_tuples: List[Tuple[float, float, float]] = []
        for seq in pop:
            key = tuple(seq)
            if key in cache:
                mu, var, setup, timeline = cache[key]
            else:
                if eval_fn:
                    eval_result = eval_fn(seq)
                    if len(eval_result) == 4:
                        mu, var, setup, timeline = eval_result
                    else:
                        mu, var, setup = eval_result  # type: ignore
                        timeline = None
                else:
                    mu, var = simulate_sequence(seq, orders, replications, seed * 13 + g * 17)
                    setup = 0.0  # simulate_sequence doesn't return setup
                    timeline = None
                cache[key] = (mu, var, setup, timeline)
            # Fitness = mean tardiness + λ1 * variance + λ2 * setup_time
            obj = mu + lam * var + setup_weight * setup
            fitness_vals.append(obj)
            mu_var_setup_tuples.append((mu, var, setup))

        gen_best_idx = min(range(len(pop)), key=lambda i: fitness_vals[i])
        gen_best_val = fitness_vals[gen_best_idx]
        if gen_best_val < best_val:
            best_val = gen_best_val
            best_seq = pop[gen_best_idx][:]
            best_components = mu_var_setup_tuples[gen_best_idx]
            best_timeline = cache[tuple(best_seq)][3]
        history.append(best_val)

        # GA Progress Logging
        if g == 0:
            print(f"[GA] Starting with {len(orders)} orders, pop_size={len(pop)}, generations={generations}", file=sys.stderr)
            print(f"[GA] Gen 0: best={gen_best_val:.2f} (mu={mu_var_setup_tuples[gen_best_idx][0]:.2f}, var={mu_var_setup_tuples[gen_best_idx][1]:.2f}, setup={mu_var_setup_tuples[gen_best_idx][2]:.2f})", file=sys.stderr)
            print(f"[GA] Gen 0: sequence={pop[gen_best_idx]}", file=sys.stderr)
        elif g % 20 == 0 or g == generations - 1:
            improvement = "↓" if gen_best_val < history[g-1] else "→"
            print(f"[GA] Gen {g}: best={gen_best_val:.2f} {improvement} (mu={mu_var_setup_tuples[gen_best_idx][0]:.2f}, var={mu_var_setup_tuples[gen_best_idx][1]:.2f}, setup={mu_var_setup_tuples[gen_best_idx][2]:.2f})", file=sys.stderr)

        elite_idx = sorted(range(len(pop)), key=lambda i: fitness_vals[i])[: max(1, elite)]
        next_pop = [pop[i][:] for i in elite_idx]

        while len(next_pop) < population:
            parent_a, parent_b = rng.sample(pop, 2)
            child = order_crossover(parent_a, parent_b, rng)
            mutate_swap(child, rng, mutation_rate)
            next_pop.append(child)
        pop = next_pop

    return best_seq, history, best_components, best_timeline


# ---------------------------------------------------------------------------
# Planung & Reporting (analog V1)
# ---------------------------------------------------------------------------


def build_plan(sequence: Sequence[int], orders: Sequence[OrderData], now: float) -> List[Dict[str, float]]:
    plan: List[Dict[str, float]] = []
    current_time = now
    for idx in sequence:
        order = orders[idx]
        start = max(current_time, order.ready_at)
        duration = defuzzify_tfn(order.duration_tfn)
        end = start + duration
        due = order.due_date
        tardiness_val = max(0.0, end - due) if due is not None else 0.0
        plan.append(
            {
                "orderId": order.order_id,
                "plannedStart": float(start),
                "plannedEnd": float(end),
                "procTimePlan": float(duration),
                "dueDate": float(due) if due is not None else None,
                "plannedTardiness": float(tardiness_val),
            }
        )
        current_time = end
    return plan


def compute_plan_metrics(plan: Sequence[Dict[str, float]]) -> Dict[str, float]:
    if not plan:
        return {"meanProcTime": 0.0, "totalTardiness": 0.0, "maxTardiness": 0.0, "totalDeviation": 0.0, "avgDeviation": 0.0}
    total_tardiness = sum(row.get("plannedTardiness", 0.0) for row in plan)
    mean_proc = statistics.fmean(row.get("procTimePlan", 0.0) for row in plan)
    max_tard = max((row.get("plannedTardiness", 0.0) for row in plan), default=0.0)

    # Terminabweichung MIT Vorzeichen: positiv = verspätet, negativ = verfrüht
    deviations = []
    for row in plan:
        due = row.get("dueDate")
        end = row.get("plannedEnd", 0.0)
        if due is not None:
            deviations.append(end - due)  # positiv = verspätet, negativ = verfrüht

    total_deviation = sum(deviations) if deviations else 0.0
    avg_deviation = statistics.fmean(deviations) if deviations else 0.0

    return {
        "meanProcTime": float(mean_proc),
        "totalTardiness": float(total_tardiness),
        "maxTardiness": float(max_tard),
        "totalDeviation": float(total_deviation),  # Mit Vorzeichen
        "avgDeviation": float(avg_deviation),      # Durchschnittliche Abweichung mit Vorzeichen
    }


def compute_priorities(
    plan: Sequence[Dict[str, float]],
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    priorities: List[Dict[str, Any]] = []
    priority_map: Dict[str, float] = {}

    for row in plan:
        order_id = row["orderId"]
        tardiness_val = float(row.get("plannedTardiness", 0.0) or 0.0)
        due = row.get("dueDate")
        end = float(row.get("plannedEnd", 0.0) or 0.0)
        slack = None if due is None else float(due) - end

        if tardiness_val > 0:
            priority = 1.0 + tardiness_val
        else:
            slack_val = 0.0 if slack is None else max(0.0, slack)
            priority = 1.0 / (1.0 + slack_val)

        priority = float(max(priority, 0.0))
        priority_map[order_id] = priority
        priorities.append(
            {
                "orderId": order_id,
                "priority": priority,
                "dueDate": due,
                "expectedCompletion": end,
            }
        )

    priorities.sort(key=lambda item: item["priority"], reverse=True)
    return priorities, priority_map


def build_routes(
    orders: Sequence[OrderData],
    plan_lookup: Dict[str, Dict[str, float]],
) -> List[Dict[str, Any]]:
    routes: List[Dict[str, Any]] = []
    for order in orders:
        plan_entry = plan_lookup.get(order.order_id, {})
        expected_start = float(plan_entry.get("plannedStart", order.ready_at))
        expected_end = float(plan_entry.get("plannedEnd", expected_start + defuzzify_tfn(order.duration_tfn)))

        operations: List[Dict[str, Any]] = []
        route_id: Optional[str] = None

        candidates = order.raw.get("routeCandidates")
        if isinstance(candidates, list) and candidates:
            first_candidate = candidates[0]
            if isinstance(first_candidate, dict):
                route_id = str(first_candidate.get("id") or f"ga-route-{order.order_id}")
                operations = clone_operations(first_candidate.get("operations"))

        if not operations:
            operations = clone_operations(order.combined_ops)
            route_id = route_id or f"ga-route-{order.order_id}"

        routes.append(
            {
                "orderId": order.order_id,
                "routeId": route_id or f"ga-route-{order.order_id}",
                "operations": operations,
                "expectedStart": expected_start,
                "expectedEnd": expected_end,
            }
        )

    return routes


def build_batches(
    sequence: Sequence[int],
    orders: Sequence[OrderData],
    plan_lookup: Dict[str, Dict[str, float]],
    priorities_map: Dict[str, float],
    q_min: int,
    q_max: int,
) -> List[Dict[str, Any]]:
    q_min = max(1, q_min)
    q_max = max(q_min, q_max)

    op_signatures: Dict[str, set[str]] = {}
    for order in orders:
        sig = []
        for op in order.combined_ops:
            station = str(op.get("stationId") or op.get("station") or "unknownStation")
            tool = str(op.get("toolId") or op.get("tool") or "unknownTool")
            typ = str(op.get("type") or op.get("operationType") or "op")
            sig.append(f"{station}|{tool}|{typ}")
        op_signatures[order.order_id] = set(sig) if sig else {order.order_id}

    batches: List[Dict[str, Any]] = []
    current_batch: List[int] = []

    def finalize(ids: List[int]) -> None:
        if len(ids) < q_min:
            return
        order_ids = [orders[idx].order_id for idx in ids]
        first = order_ids[0]
        release_at = float(plan_lookup.get(first, {}).get("plannedStart", orders[ids[0]].ready_at))
        prior_vals = [priorities_map.get(oid, 0.0) for oid in order_ids]
        mean_priority = sum(prior_vals) / len(prior_vals) if prior_vals else 0.0

        sets = [op_signatures[oid] for oid in order_ids]
        matrix = [[1.0 if i == j else jaccard(sets[i], sets[j]) for j in range(len(sets))] for i in range(len(sets))]
        pairwise = [matrix[i][j] for i in range(len(sets)) for j in range(i + 1, len(sets))]
        mean_similarity = sum(pairwise) / len(pairwise) if pairwise else 1.0

        batches.append(
            {
                "id": f"pip-ga-batch-v2-{len(batches) + 1}",
                "orderIds": order_ids,
                "releaseAt": release_at,
                "meanPriority": float(mean_priority),
                "meanSimilarity": float(mean_similarity),
                "jaccardMatrix": matrix,
                "jaccardLabels": order_ids,
                "jaccardJustifications": [
                    {"orderId": oid, "sequence": sorted(list(op_signatures[oid]))} for oid in order_ids
                ],
            }
        )

    for idx in sequence:
        current_batch.append(idx)
        if len(current_batch) >= q_max:
            finalize(current_batch)
            current_batch = []

    if current_batch:
        finalize(current_batch)

    return batches


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def validate_plan_with_pn(orders: Sequence[OrderData]) -> bool:
    """Erzeugt einfaches Petri-Netz (Stationen als Plätze, 1 Token pro Station)."""
    places: Dict[str, Place] = {}
    transitions: List[Transition] = []
    for order in orders:
        duration = defuzzify_tfn(order.duration_tfn)
        for op in order.combined_ops:
            station = str(op.get("stationId") or op.get("station") or "station")
            if station not in places:
                places[station] = Place(place_id=station, tokens=1)
            transitions.append(
                Transition(
                    op_id=f"{order.order_id}_{station}",
                    station=station,
                    duration=duration,
                    pre_place=station,
                    post_place=station,
                )
            )
    if not places:
        return True
    net = PetriNet(places, transitions)
    return net.run_until_complete()


def build_orders_from_payload(
    raw_orders: Sequence[Dict[str, Any]],
    now: float,
    horizon_minutes: float,
    variation: float = 0.3,
) -> List[OrderData]:
    orders: List[OrderData] = []
    default_due = now + max(horizon_minutes, 60.0)

    for idx, raw in enumerate(raw_orders):
        order_id = str(raw.get("orderId") or f"order-{idx + 1}")
        # Immer dem_ops und mon_ops klonen (für Sequenz-Varianten-Parsing)
        dem_ops = clone_operations(raw.get("demOps"))
        mon_ops = clone_operations(raw.get("monOps"))

        # Prefer explicit ops payload (station, proc, setupFamily)
        if isinstance(raw.get("ops"), list) and raw.get("ops"):
            combined_ops = []
            for op_idx, op in enumerate(raw["ops"]):
                station = op.get("station")
                proc = op.get("proc")
                if station is None or proc is None:
                    print(f"ERROR: Order {order_id} op[{op_idx}] missing station/proc - skipping op", file=sys.stderr)
                    continue
                duration = float(proc)
                if duration <= 0:
                    print(f"ERROR: Order {order_id} op[{op_idx}] duration <= 0 - skipping op", file=sys.stderr)
                    continue
                combined_ops.append({
                    "id": op.get("id") or f"{order_id}-op-{op_idx+1}",
                    "stationId": str(station),
                    "expectedDuration": duration,
                    "setupFamily": op.get("setupFamily"),
                    "bg": op.get("bg"),
                    "meta": {
                        "step": op.get("setupFamily") or op.get("bg") or op.get("station"),
                    },
                })
        else:
            combined_ops = dem_ops + mon_ops
        if not combined_ops:
            print(f"ERROR: Order {order_id} has NO operations (demOps/monOps empty) - skipping order (no fallback)!", file=sys.stderr)
            continue

        duration = sum(float(op.get("expectedDuration") or 0.0) for op in combined_ops)
        if duration <= 0:
            print(f"ERROR: Order {order_id} has total duration <= 0: {duration} (ops: {len(combined_ops)}) - skipping order!", file=sys.stderr)
            continue

        duration_tfn = guess_tfn(duration, variation)
        ready_at = normalize_minutes(raw.get("readyAt"), now)
        # SEHR straffe Liefertermine: 0.85 * Sum(Ops) für Tardiness mit parallelen Maschinen
        tight_due = ready_at + (0.85 * duration)
        if raw.get("dueDate") is None:
            due_date = tight_due
            print(f"INFO: Order {order_id} using tight DueDate heuristic (no dueDate provided): {due_date:.1f}", file=sys.stderr)
        else:
            due_date_raw = normalize_minutes(raw.get("dueDate"), default_due)
            if due_date_raw > tight_due:
                print(f"INFO: Order {order_id} dueDate tightened from {due_date_raw:.1f} to {tight_due:.1f} (to avoid zero tardiness)", file=sys.stderr)
            due_date = min(due_date_raw, tight_due)
            if due_date < ready_at:
                due_date = tight_due
                print(f"INFO: Order {order_id} dueDate < readyAt, set to tight heuristic {due_date:.1f}", file=sys.stderr)

        # NEU: Alle Sequenz-Varianten für diesen Auftrag laden
        sequence_variants: List[SequenceVariant] = []
        process_sequences = raw.get("processSequences")
        if process_sequences:
            all_variants = parse_all_sequence_variants(process_sequences)
            for seq_id, steps in all_variants:
                # Für jede Variante: Ops basierend auf dieser Sequenz erstellen
                variant_ops = build_ops_from_sequence(steps, clone_operations(dem_ops), clone_operations(mon_ops))
                if variant_ops:
                    variant_duration = sum(float(op.get("expectedDuration") or 0.0) for op in variant_ops)
                    variant_tfn = guess_tfn(variant_duration, variation)
                    sequence_variants.append(SequenceVariant(
                        seq_id=seq_id,
                        steps=steps,
                        combined_ops=variant_ops,
                        duration_tfn=variant_tfn,
                    ))

        # Wenn keine Varianten gefunden wurden, erstelle eine Default-Variante aus combined_ops
        if not sequence_variants:
            sequence_variants.append(SequenceVariant(
                seq_id="default",
                steps=[],
                combined_ops=combined_ops,
                duration_tfn=duration_tfn,
            ))

        if len(sequence_variants) > 1:
            print(f"INFO: Order {order_id} has {len(sequence_variants)} sequence variants for GA optimization", file=sys.stderr)

        orders.append(
            OrderData(
                order_id=order_id,
                due_date=due_date,
                ready_at=ready_at,
                duration_tfn=duration_tfn,
                combined_ops=combined_ops,
                raw=dict(raw),
                sequence_variants=sequence_variants,
            )
        )

    return orders


# ---------------------------------------------------------------------------
# Debugging & Visualisierung
# ---------------------------------------------------------------------------


def _gantt_error_image(message: str) -> Optional[str]:
    """Erzeugt ein einfaches Bild mit Fehlermeldung, wenn kein Gantt geplottet werden kann."""
    if not HAS_MATPLOTLIB:
        return None
    fig, ax = plt.subplots(figsize=(10, 1.8))
    ax.axis("off")
    ax.text(0.5, 0.5, message, ha="center", va="center", wrap=True, fontsize=10)
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=110)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def create_gantt_chart(
    plan: Sequence[Dict[str, Any]],
    title: str = "Optimierte Sequenz (Gantt)",
    timeline: Optional[Sequence[Dict[str, Any]]] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Erstellt ein Gantt-Chart.

    - Wenn eine Ops-Timeline vorhanden ist, wird auf Maschinen-/Ops-Ebene geplottet.
    - Wenn die Timeline leer/ungültig ist, wird ein Fehlerbild erzeugt (kein Auftrags-Fallback).
    - Nur wenn GAR KEINE Timeline übergeben wurde (timeline is None), läuft der Auftrags-Fallback.
    """
    if not HAS_MATPLOTLIB:
        return None, "matplotlib_not_available"

    # 1) Ops-basierter Plot, wenn timeline übergeben wurde
    if timeline is not None:
        try:
            ops = []
            for op in timeline:
                try:
                    start = float(op.get("start", 0.0))
                    end = float(op.get("end", 0.0))
                except Exception:
                    continue
                if not math.isfinite(start) or not math.isfinite(end) or end <= start:
                    continue
                ops.append({
                    "orderId": op.get("orderId", "unknown"),
                    "machine": op.get("station") or op.get("stationType") or "machine",
                    "bgType": op.get("bgType") or op.get("step") or "unknown",
                    "start": start,
                    "end": end,
                })

            if not ops:
                msg = (
                    "Ops-Timeline ist leer oder ungültig – kein Maschinen-Gantt erzeugt. "
                    "Prüfe demOps/monOps und expectedDuration > 0. "
                    "Details siehe debug PIP_OPS_TIMELINE (ordersWithoutOps, zeroDurationExamples)."
                )
                # Zusatzinformationen (Preview) direkt ins Bild, damit das Frontend sie sieht
                try:
                    raw_len = len(timeline or [])
                    plan_len = len(plan or [])
                    timeline_preview = json.dumps(list(timeline or [])[:2], ensure_ascii=False)
                    plan_preview = json.dumps(list(plan or [])[:2], ensure_ascii=False)
                    msg += (
                        f"\nraw_timeline_len={raw_len}, plan_len={plan_len}"
                        f"\nraw_timeline_preview={timeline_preview}"
                        f"\nplan_preview={plan_preview}"
                    )
                except Exception:
                    pass
                img = _gantt_error_image(msg)
                if img:
                    return img, "timeline_empty"
                return None, "timeline_empty"

            machines = sorted({op["machine"] for op in ops})
            machine_index = {m: i for i, m in enumerate(machines)}
            fig, ax = plt.subplots(figsize=(12, max(4, len(machines) * 0.6)))

            # Farben pro Auftrag
            order_ids = sorted({op["orderId"] for op in ops})
            colors = plt.cm.tab20(range(len(order_ids)))
            order_colors = {order_id: colors[i % len(colors)] for i, order_id in enumerate(order_ids)}

            for op in ops:
                y = machine_index[op["machine"]]
                dur = op["end"] - op["start"]
                color = order_colors[op["orderId"]]
                ax.barh(y, dur, left=op["start"], height=0.6, color=color, edgecolor="black", alpha=0.8)
                if dur > 2:
                    ax.text(op["start"] + dur / 2, y, op["bgType"], ha="center", va="center", fontsize=7, color="black")

            ax.set_yticks(range(len(machines)))
            ax.set_yticklabels(machines)
            ax.set_xlabel("Zeit (Minuten)")
            ax.set_title(f"{title} (Ops-Ebene)")
            ax.grid(True, linestyle="--", alpha=0.5, axis="x")
            plt.tight_layout()

            buf = io.BytesIO()
            fig.savefig(buf, format="png", dpi=100)
            plt.close(fig)
            return base64.b64encode(buf.getvalue()).decode("ascii"), None
        except Exception as exc:
            msg = f"Fehler beim Erzeugen des Ops-Gantt: {exc}"
            img = _gantt_error_image(msg)
            if img:
                return img, f"timeline_exception: {exc}"
            return None, f"timeline_exception: {exc}"

    # 2) Nur wenn KEINE Timeline übergeben wurde (timeline is None), darf der Auftrags-Fallback laufen.
    if timeline is None and not plan:
        img = _gantt_error_image("Kein Plan für Auftrags-Gantt verfügbar.")
        if img:
            return img, "plan_empty"
        return None, "plan_empty"
    try:
        filtered_plan = []
        for p in plan:
            try:
                start = float(p.get("plannedStart", 0.0))
                dur = float(p.get("procTimePlan", 0.0))
            except Exception:
                continue
            if not math.isfinite(start) or not math.isfinite(dur) or dur <= 0:
                continue
            filtered_plan.append({**p, "plannedStart": start, "procTimePlan": dur})

        if not filtered_plan:
            img = _gantt_error_image("Plan enthält keine gültigen Vorgänge für das Auftrags-Gantt.")
            if img:
                return img, "no_valid_ops"
            return None, "no_valid_ops"

        sorted_plan = sorted(filtered_plan, key=lambda x: x.get("plannedStart", 0.0))

        ids = [p["orderId"] for p in sorted_plan]
        starts = [p.get("plannedStart", 0.0) for p in sorted_plan]
        durations = [p.get("procTimePlan", 0.0) for p in sorted_plan]

        colors = []
        for p in sorted_plan:
            if p.get("plannedTardiness", 0.0) > 0.001:
                colors.append('#d62728')
            else:
                colors.append('#2ca02c')

        fig, ax = plt.subplots(figsize=(10, max(4, len(plan) * 0.5)))
        y_pos = range(len(ids))
        ax.barh(y_pos, durations, left=starts, color=colors, edgecolor='black', alpha=0.8)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(ids)
        ax.invert_yaxis()
        ax.set_xlabel("Zeit (Minuten ab t0)")
        ax.set_title(f"{title} (Auftragsebene)")
        ax.grid(True, linestyle="--", alpha=0.5, axis="x")

        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='#2ca02c', edgecolor='black', label='Pünktlich'),
            Patch(facecolor='#d62728', edgecolor='black', label='Verspätet (> LT)')
        ]
        ax.legend(handles=legend_elements)
        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode("ascii"), None
    except Exception as exc:
        img = _gantt_error_image(f"Fehler beim Erzeugen des Auftrags-Gantt: {exc}")
        if img:
            return img, f"exception: {exc}"
        return None, f"exception: {exc}"


def create_plot_entries(
    history: Sequence[float],
    baseline_metrics: Dict[str, float],
    optimized_metrics: Dict[str, float],
    optimized_plan: Optional[Sequence[Dict[str, Any]]] = None,  # NEU: Parameter hinzugefügt
    ops_timeline: Optional[Sequence[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    if not HAS_MATPLOTLIB:
        entries.append({"stage": "PIP_PLOT_INFO", "message": "matplotlib_not_available"})
        return entries

    try:
        # 1. Konvergenz-Plot (Fitness über Generationen)
        if history:
            fig, ax = plt.subplots(figsize=(6, 3))
            ax.plot(range(1, len(history) + 1), history, marker=None, linewidth=2)
            # Formel aus Kapitel 5.2: F(pi) = E[T] + lambda * Var[T]
            ax.set_title(r"Zielfunktion: $E[T_{tot}] + \lambda \cdot Var[T_{tot}]$")
            ax.set_xlabel("Generation")
            ax.set_ylabel("Fitnesswert")
            ax.grid(True, linestyle="--", alpha=0.4)
            buf = io.BytesIO()
            fig.tight_layout()
            fig.savefig(buf, format="png", dpi=100)
            plt.close(fig)
            entries.append(
                {
                    "stage": "PIP_GA_PLOT_OBJECTIVE",
                    "media": {
                        "type": "image/png",
                        "encoding": "base64",
                        "data": base64.b64encode(buf.getvalue()).decode("ascii"),
                    },
                }
            )
        else:
            entries.append({
                "stage": "PIP_PLOT_INFO",
                "message": "fitness_history_empty_or_constant"
            })

        # Ops-Timeline Gantt
        if ops_timeline:
            try:
                fig, ax = plt.subplots(figsize=(12, max(4, len({op.get('station') for op in ops_timeline}) * 0.6)))
                stations = sorted({op.get("station") for op in ops_timeline if op.get("station")})
                station_idx = {s: i for i, s in enumerate(stations)}
                order_ids = sorted({op.get("orderId") for op in ops_timeline if op.get("orderId")})
                colors = plt.cm.tab20(range(len(order_ids)))
                color_map = {oid: colors[i % len(colors)] for i, oid in enumerate(order_ids)}
                for op in ops_timeline:
                    st = op.get("station")
                    if st not in station_idx:
                        continue
                    start = float(op.get("start", 0.0))
                    end = float(op.get("end", start))
                    dur = end - start
                    oid = op.get("orderId", "unknown")
                    color = color_map.get(oid, "#888888")
                    y = station_idx[st]
                    ax.barh(y, dur, left=start, height=0.6, color=color, edgecolor="black", alpha=0.8)
                    if dur > 2:
                        ax.text(start + dur / 2, y, str(op.get("bgType") or op.get("step") or oid),
                                ha="center", va="center", fontsize=7, color="black")
                ax.set_yticks(range(len(stations)))
                ax.set_yticklabels(stations)
                ax.set_xlabel("Zeit (Minuten)")
                ax.set_ylabel("Station")
                ax.set_title("Operationen-Zeitstrahl (Stations-/Baugruppenebene)")
                ax.grid(True, linestyle="--", alpha=0.5, axis="x")
                fig.tight_layout()
                buf = io.BytesIO()
                fig.savefig(buf, format="png", dpi=110)
                plt.close(fig)
                entries.append({
                    "stage": "PIP_GA_PLOT_TIMELINE",
                    "media": {
                        "type": "image/png",
                        "encoding": "base64",
                        "data": base64.b64encode(buf.getvalue()).decode("ascii"),
                    },
                })
            except Exception as exc:
                entries.append({"stage": "PIP_GA_PLOT_TIMELINE_SKIPPED", "message": str(exc)})

        # Terminabweichung als Text (statt Bar-Chart)
        # Formel: Ende letzter Bearbeitungsschritt - Liefertermin (due_date)
        # Positiv = verspätet (schlecht), Negativ = verfrüht (gut)
        baseline_dev = baseline_metrics.get("avgDeviation", 0.0)
        optimized_dev = optimized_metrics.get("avgDeviation", 0.0)
        improvement = baseline_dev - optimized_dev

        entries.append({
            "stage": "PIP_DEVIATION_COMPARISON",
            "baselineDeviation": round(baseline_dev, 1),
            "optimizedDeviation": round(optimized_dev, 1),
            "improvement": round(improvement, 1),
            "message": f"Ø Terminabweichung: Ausgangslage={baseline_dev:.1f} min, Optimiert={optimized_dev:.1f} min (Δ={improvement:+.1f} min)"
        })

        if optimized_plan:
            gantt_b64, gantt_reason = create_gantt_chart(
                optimized_plan,
                "Optimierte Sequenz (Gantt)",
                ops_timeline,
            )
            if gantt_b64:
                entries.append({
                    "stage": "PIP_GA_PLOT_GANTT",
                    "media": {
                        "type": "image/png",
                        "encoding": "base64",
                        "data": gantt_b64,
                    },
                })
            else:
                entries.append({
                    "stage": "PIP_GA_PLOT_GANTT_SKIPPED",
                    "message": gantt_reason or "unknown_reason",
                    "opCount": len(optimized_plan),
                })
    except Exception as exc:  # pragma: no cover
        entries.append({"stage": "PIP_GA_PLOT_ERROR", "error": str(exc)})

    return entries


def compute_avg_deviation_from_timeline(
    timeline: Optional[Sequence[Dict[str, Any]]],
    orders: Sequence[OrderData],
    debug_label: str = "",
    now: float = 0.0,
) -> float:
    """
    Berechnet die durchschnittliche Terminabweichung MIT Vorzeichen aus einer Timeline.
    Verwendet den ORIGINALEN Liefertermin aus dem langfristigen Planungshorizont (raw.dueDate),
    nicht den künstlich verkürzten GA-Liefertermin.

    Formel: Terminabweichung = Geplanter Liefertermin (langfristig) - Ende letzter Bearbeitungsschritt
    Positiv = verfrüht (gut), Negativ = verspätet (schlecht)

    ACHTUNG: Vorzeichen ist UMGEKEHRT zu Tardiness!
    - Terminabweichung > 0 = verfrüht = GUT
    - Terminabweichung < 0 = verspätet = SCHLECHT
    """
    if not timeline:
        print(f"[DEVIATION DEBUG {debug_label}] timeline is empty/None", file=sys.stderr)
        return 0.0

    # Finde die letzte Op (höchstes 'end') pro Auftrag
    order_completion: Dict[str, float] = {}
    for op in timeline:
        oid = op.get("orderId")
        end = op.get("end", 0.0)
        if oid:
            if oid not in order_completion or end > order_completion[oid]:
                order_completion[oid] = end

    # Baue Lookup für Liefertermin
    # WICHTIG: Verwende o.due_date, das bereits in der gleichen Zeitskala wie die Simulation ist
    # (wurde bei der Order-Erstellung mit normalize_minutes normalisiert)
    # Der "tight due" Heuristik-Wert ist für den GA gedacht, aber für das Bar-Chart
    # sollten wir idealerweise den ORIGINALEN Liefertermin verwenden.
    # Problem: Der originale raw.dueDate ist ein Unix-Timestamp, completion ist Sim-Zeit.
    # Lösung: Verwende den bereits normalisierten o.due_date (ist in Sim-Minuten).
    order_due: Dict[str, Optional[float]] = {}
    for o in orders:
        # Verwende den bereits normalisierten due_date (gleiche Zeitskala wie completion)
        order_due[o.order_id] = o.due_date

    deviations = []
    for oid, completion in order_completion.items():
        due = order_due.get(oid)
        if due is not None:
            # Terminabweichung = due - completion
            # Positiv = verfrüht (gut), Negativ = verspätet (schlecht)
            dev = due - completion
            deviations.append(dev)
            print(f"[DEVIATION DEBUG {debug_label}] {oid[-8:]}: completion={completion:.1f}, due={due:.1f}, dev={dev:.1f} ({'verfrüht' if dev >= 0 else 'VERSPÄTET'})", file=sys.stderr)

    result = statistics.fmean(deviations) if deviations else 0.0
    print(f"[DEVIATION DEBUG {debug_label}] avg_deviation = {result:.2f} (from {len(deviations)} orders)", file=sys.stderr)
    return result


def prepare_debug_entries(
    now: float,
    orders: Sequence[OrderData],
    config: Dict[str, Any],
    ga_config: Dict[str, Any],
    history: Sequence[float],
    baseline_seq: Sequence[int],
    best_seq: Sequence[int],
    baseline_obj: float,
    baseline_components: Tuple[float, float],
    best_obj: float,
    best_components: Tuple[float, float],
    baseline_plan: Sequence[Dict[str, float]],
    optimized_plan: Sequence[Dict[str, float]],
    ops_timeline: Optional[Sequence[Dict[str, Any]]],
    baseline_timeline: Optional[Sequence[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    history_preview = [round(val, 4) for val in history[:80]]
    improvement = baseline_obj - best_obj
    improvement_pct = (improvement / baseline_obj * 100.0) if baseline_obj else None

    baseline_plan_metrics = compute_plan_metrics(baseline_plan)
    optimized_plan_metrics = compute_plan_metrics(optimized_plan)

    fitness_constant = False
    if history:
        values = {round(val, 6) for val in history}
        if len(values) <= 1:
            fitness_constant = True

    debug: List[Dict[str, Any]] = [
        {
            "stage": "PIP_INPUT",
            "orderCount": len(orders),
            "nowSimMinute": now,
            "config": config,
            "gaConfig": ga_config,
        },
        {
            "stage": "PIP_GA_RESULT",
            "baselineObjective": baseline_obj,
            "baselineMeanTardiness": baseline_components[0],
            "baselineVarTardiness": baseline_components[1],
            "optimizedObjective": best_obj,
            "optimizedMeanTardiness": best_components[0],
            "optimizedVarTardiness": best_components[1],
            "improvement": improvement,
            "improvementPercent": improvement_pct,
            "historyPoints": len(history),
        },
        {
            "stage": "PIP_PLAN_SUMMARY",
            "baselineMetrics": baseline_plan_metrics,
            "optimizedMetrics": optimized_plan_metrics,
            "baselinePreview": list(baseline_plan[:5]),
            "optimizedPreview": list(optimized_plan[:5]),
            "baselineSequence": [orders[idx].order_id for idx in baseline_seq][:12],
            "optimizedSequence": [orders[idx].order_id for idx in best_seq][:12],
        },
        {
            "stage": "PIP_GA_CHART_DATA",
            "chart": {
                "type": "line",
                "series": [
                    {
                        "label": "Best Objective",
                        "values": history_preview,
                    }
                ],
            },
        },
    ]

    if fitness_constant:
        debug.append({
            "stage": "PIP_FITNESS_CONSTANT",
            "message": "Fitness did not change across generations",
        })

    # Berechne durchschnittliche Terminabweichung MIT Vorzeichen aus den Timelines
    # Positiv = verspätet, Negativ = verfrüht
    baseline_avg_deviation = compute_avg_deviation_from_timeline(baseline_timeline, orders, "BASELINE")
    optimized_avg_deviation = compute_avg_deviation_from_timeline(ops_timeline, orders, "OPTIMIZED")

    # Debug-Output
    print(f"[BAR-CHART DEBUG] baseline_timeline has {len(baseline_timeline) if baseline_timeline else 0} ops", file=sys.stderr)
    print(f"[BAR-CHART DEBUG] ops_timeline has {len(ops_timeline) if ops_timeline else 0} ops", file=sys.stderr)
    print(f"[BAR-CHART DEBUG] baseline_avg_deviation = {baseline_avg_deviation:.2f} min", file=sys.stderr)
    print(f"[BAR-CHART DEBUG] optimized_avg_deviation = {optimized_avg_deviation:.2f} min", file=sys.stderr)
    print(f"[BAR-CHART DEBUG] baseline_meanTardiness (GA) = {baseline_components[0]:.2f} min", file=sys.stderr)
    print(f"[BAR-CHART DEBUG] optimized_meanTardiness (GA) = {best_components[0]:.2f} min", file=sys.stderr)

    # Metriken für das Bar-Chart: Terminabweichung mit Vorzeichen
    ga_baseline_metrics = {
        "meanTardiness": baseline_components[0],
        "varTardiness": baseline_components[1],
        "avgDeviation": baseline_avg_deviation,  # MIT Vorzeichen
    }
    ga_optimized_metrics = {
        "meanTardiness": best_components[0],
        "varTardiness": best_components[1],
        "avgDeviation": optimized_avg_deviation,  # MIT Vorzeichen
    }
    debug.extend(create_plot_entries(history, ga_baseline_metrics, ga_optimized_metrics, optimized_plan, ops_timeline))
    return debug


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------


def simple_fifo_result(raw_orders: Sequence[Dict[str, Any]], now: float, config: Dict[str, Any]) -> Dict[str, Any]:
    release_list = [str(o.get("orderId") or f"order-{idx + 1}") for idx, o in enumerate(raw_orders)]
    priorities = [{"orderId": oid, "priority": 1.0} for oid in release_list]
    return {
        "priorities": priorities,
        "routes": [],
        "batches": [],
        "releaseList": release_list,
        "holdDecisions": [],  # No holds in FIFO fallback - release all
        "debug": [
            {
                "stage": "PIP_FALLBACK",
                "message": "FIFO-Planung verwendet (zu wenige Aufträge für GA).",
                "orderCount": len(raw_orders),
                "config": config,
            }
        ],
    }


# ---------------------------------------------------------------------------
# Main Scheduling Flow
# ---------------------------------------------------------------------------


def schedule_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    progress: List[Dict[str, Any]] = [{"stage": "PIP_V2_STAGE", "step": "payload_loaded"}]
    now = float(payload.get("now") or 0.0)
    raw_orders = payload.get("orders") or []
    config = payload.get("config") or {}
    stations_cfg = config.get("stations") if isinstance(config.get("stations"), dict) else None
    validate_with_pn = bool(config.get("validateWithPN") or config.get("petriNetValidation"))

    if not isinstance(raw_orders, list) or len(raw_orders) == 0:
        return simple_fifo_result([], now, config)

    horizon = float(config.get("horizonMinutes", 240.0) or 240.0)
    orders = build_orders_from_payload(raw_orders, now, horizon)
    progress.append({"stage": "PIP_V2_STAGE", "step": "orders_built", "orders": len(orders)})

    if len(orders) <= 1:
        return simple_fifo_result(raw_orders, now, config)

    ga_config = config.get("ga") or config.get("gaSettings") or {}
    pop_size = max(4, int(ga_config.get("population", 60) or 60))
    generations = max(1, int(ga_config.get("generations", 80) or 80))
    mutation_rate = max(0.0, min(1.0, float(ga_config.get("mutationRate", 0.40) or 0.40)))  # Erhöht von 0.25 auf 0.40 für mehr Exploration
    elite = max(1, int(ga_config.get("elite", 3) or 3))
    reps = max(5, int(ga_config.get("replications", 30) or 30))
    seed = int(ga_config.get("seed", 42) or 42)
    lam = float(config.get("varianceWeight", 0.1) or 0.1)
    setup_weight = float(config.get("setupWeight", 0.01) or 0.01)  # Small default to prefer fewer setups
    fc = config.get("factoryCapacity", {}) if isinstance(config.get("factoryCapacity", {}), dict) else {}
    dem_machines = fc.get("demontageStationen")
    mon_machines = fc.get("montageStationen")
    if stations_cfg:
        # Stationenspezifische Kapazitäten für neuen Simulationspfad
        station_caps = {str(sid): max(1, int(val.get("machines") or 1)) for sid, val in stations_cfg.items()}
    else:
        if not dem_machines or not mon_machines:
            raise ValueError("factoryCapacity must provide demontageStationen and montageStationen (no defaults allowed)")
        dem_machines = int(dem_machines)
        mon_machines = int(mon_machines)
        station_caps = {}
    dem_flex_share = float(config.get("demFlexSharePct") or 0.0) / 100.0
    mon_flex_share = float(config.get("monFlexSharePct") or 0.0) / 100.0
    setup_minutes = float(config.get("setupMinutes") or 0.0)

    # Initialize debug list with payload overview
    debug: List[Dict[str, Any]] = []

    # Build ops_by_order from validated combined_ops in OrderData objects
    ops_by_order: Dict[str, List[Dict[str, Any]]] = {}
    ops_by_order_stats = {"totalOrders": 0, "totalOpsBuilt": 0, "ordersWithZeroOps": 0, "skippedDueToZeroDuration": 0}

    for o in orders:
        ops_by_order_stats["totalOrders"] += 1
        ops: List[Dict[str, Any]] = []

        for op in o.combined_ops:
            op_copy = dict(op)

            # Dauer prüfen
            try:
                dur = float(op_copy.get("expectedDuration") or op_copy.get("proc") or 0.0)
            except Exception:
                dur = 0.0
            if dur <= 0:
                ops_by_order_stats["skippedDueToZeroDuration"] += 1
                continue

            # meta.step absichern (wird für fixed/flex + Familien genutzt)
            meta = op_copy.get("meta")
            if not isinstance(meta, dict):
                meta = {}
                op_copy["meta"] = meta
            if "step" not in meta:
                meta["step"] = (
                    op_copy.get("setupFamily")
                    or op_copy.get("bg")
                    or op_copy.get("stationId")
                    or op_copy.get("station")
                    or "step"
                )

            ops.append(op_copy)

        ops_by_order[o.order_id] = ops
        ops_by_order_stats["totalOpsBuilt"] += len(ops)
        if len(ops) == 0:
            ops_by_order_stats["ordersWithZeroOps"] += 1
            print(f"WARNING: order {o.order_id} ended up with ZERO ops in ops_by_order (from {len(o.combined_ops)} combined_ops)", file=sys.stderr)

    print(f"INFO: ops_by_order built from validated combined_ops - {ops_by_order_stats}", file=sys.stderr)

    # Sanity-Check: Log pro Auftrag Anzahl Ops und Gesamtdauer
    print("=" * 80, file=sys.stderr)
    print("SANITY CHECK: ops_by_order details per order:", file=sys.stderr)
    for oid, ops in ops_by_order.items():
        total_dur = sum(float(op.get("expectedDuration") or 0.0) for op in ops)
        print(f"  Order {oid}: {len(ops)} ops, total duration = {total_dur:.1f} min", file=sys.stderr)
    print("=" * 80, file=sys.stderr)

    # Debug-Ausgabe für ops_by_order
    debug.append({
        "stage": "PIP_OPS_BY_ORDER_BUILT",
        "stats": ops_by_order_stats,
        "ordersWithZeroOps": [oid for oid, ops in ops_by_order.items() if len(ops) == 0],
        "opsPerOrderSample": {oid: len(ops) for oid, ops in list(ops_by_order.items())[:5]},
    })

    # NEU: Baue ops_by_order_variants - eine Liste von Ops pro Sequenz-Variante
    ops_by_order_variants: Dict[str, List[List[Dict[str, Any]]]] = {}
    variant_counts: List[int] = []
    total_variants_available = 0

    for o in orders:
        variants_ops: List[List[Dict[str, Any]]] = []

        for variant in o.sequence_variants:
            variant_ops: List[Dict[str, Any]] = []
            for op in variant.combined_ops:
                op_copy = dict(op)
                try:
                    dur = float(op_copy.get("expectedDuration") or op_copy.get("proc") or 0.0)
                except Exception:
                    dur = 0.0
                if dur <= 0:
                    continue

                meta = op_copy.get("meta")
                if not isinstance(meta, dict):
                    meta = {}
                    op_copy["meta"] = meta
                if "step" not in meta:
                    meta["step"] = (
                        op_copy.get("setupFamily")
                        or op_copy.get("bg")
                        or op_copy.get("stationId")
                        or op_copy.get("station")
                        or "step"
                    )
                variant_ops.append(op_copy)

            if variant_ops:
                variants_ops.append(variant_ops)

        # Fallback: Wenn keine Varianten, nutze ops_by_order
        if not variants_ops:
            variants_ops.append(ops_by_order.get(o.order_id, []))

        ops_by_order_variants[o.order_id] = variants_ops
        variant_counts.append(len(variants_ops))
        total_variants_available += len(variants_ops)

    # Log Varianten-Info
    orders_with_multiple_variants = sum(1 for vc in variant_counts if vc > 1)
    print(f"INFO: Sequence variants loaded - {orders_with_multiple_variants}/{len(orders)} orders have multiple variants (total={total_variants_available})", file=sys.stderr)
    if orders_with_multiple_variants > 0:
        for i, o in enumerate(orders):
            if variant_counts[i] > 1:
                print(f"  Order {o.order_id[-4:]}: {variant_counts[i]} variants", file=sys.stderr)

    # Add PIP_PAYLOAD_OVERVIEW debug stage
    ops_per_order = {}
    validation_samples: List[Dict[str, Any]] = []
    invalid_ops: List[Dict[str, Any]] = []
    orders_with_ops_field = 0
    orders_with_process_sequences = 0
    for raw in raw_orders:
        oid = str(raw.get("orderId"))
        dem_ops = raw.get("demOps") or []
        mon_ops = raw.get("monOps") or []
        dem_durations = [float(op.get("expectedDuration") or 0.0) for op in dem_ops]
        mon_durations = [float(op.get("expectedDuration") or 0.0) for op in mon_ops]
        ops_per_order[oid] = {
            "demOps": len(dem_ops),
            "monOps": len(mon_ops),
            "demDurations": dem_durations,
            "monDurations": mon_durations,
        }
        # Collect basic validation stats
        if isinstance(raw.get("ops"), list):
            orders_with_ops_field += 1
        if raw.get("processSequences") is not None:
            orders_with_process_sequences += 1

        if len(validation_samples) < 3:
            validation_samples.append({
                "orderId": oid,
                "hasOpsField": isinstance(raw.get("ops"), list),
                "opsCount": len(raw.get("ops") or []),
                "demOpsCount": len(dem_ops),
                "monOpsCount": len(mon_ops),
                "hasProcessSequences": raw.get("processSequences") is not None,
                "keys": list(raw.keys())[:12],
            })
        # Warn if empty ops
        if len(dem_ops) == 0 or len(mon_ops) == 0:
            missing = []
            if len(dem_ops) == 0:
                missing.append("demOps")
            if len(mon_ops) == 0:
                missing.append("monOps")
            print(f"WARNING: order {oid} missing {' and '.join(missing)}", file=sys.stderr)
        # Validate ops field (if present) for missing station/proc
        if isinstance(raw.get("ops"), list):
            for op in raw["ops"]:
                station = op.get("station")
                proc = op.get("proc")
                try:
                    proc_val = float(proc)
                except Exception:
                    proc_val = 0.0
                if station is None or proc is None or proc_val <= 0:
                    invalid_ops.append({
                        "orderId": oid,
                        "station": station,
                        "proc": proc,
                        "reason": "missing_station_or_nonpositive_proc"
                    })
                if len(invalid_ops) >= 10:
                    break
        if len(invalid_ops) >= 10:
            break

    debug.append({
        "stage": "PIP_PAYLOAD_OVERVIEW",
        "demMachines": dem_machines,
        "monMachines": mon_machines,
        "demFlexSharePct": dem_flex_share * 100.0,
        "monFlexSharePct": mon_flex_share * 100.0,
        "setupMinutes": setup_minutes,
        "orders": len(raw_orders),
        "opsPerOrder": ops_per_order
    })
    debug.append({
        "stage": "PIP_PAYLOAD_VALIDATION",
        "ordersWithOpsField": orders_with_ops_field,
        "ordersWithProcessSequences": orders_with_process_sequences,
        "sampleOrders": validation_samples,
        "invalidOpsExamples": invalid_ops[:10],
        "note": "ops need station + proc > 0; demOps/monOps need expectedDuration > 0"
    })

    ga_orders: List[GAOrder] = []
    for order in orders:
        signature = []
        for op in ops_by_order.get(order.order_id, order.combined_ops):
            station = str(op.get("stationId") or op.get("station") or "station")
            tool = str(op.get("toolId") or op.get("tool") or "tool")
            typ = str(op.get("type") or op.get("operationType") or op.get("setupFamily") or "op")
            signature.append(f"{station}|{tool}|{typ}")
        if not signature:
            signature = [order.order_id]
        due = float(order.due_date if order.due_date is not None else order.ready_at + defuzzify_tfn(order.duration_tfn))
        ga_orders.append(
            GAOrder(
                order_id=order.order_id,
                ready_at=order.ready_at,
                due_date=due,
                tfn=order.duration_tfn,
                signature=signature,
            )
        )

    # FIFO-Reihenfolge = Input-Reihenfolge (wie die Aufträge im JSON ankamen)
    input_order = list(range(len(orders)))  # [0, 1, 2, ...] = FIFO

    baseline_seq = sorted(
        range(len(orders)),
        key=lambda idx: (
            orders[idx].due_date if orders[idx].due_date is not None else math.inf,
            orders[idx].ready_at,
            orders[idx].order_id,
        ),
    )

    # GA using capacity-aware evaluation
    def eval_sequence(seq: Sequence[int]) -> Tuple[float, float, float, Optional[List[Dict[str, Any]]]]:
        # Neuer Pfad: stations_cfg vorhanden -> generische Stationssimulation
        if stations_cfg:
            ms, tard, setup, timeline = simulate_multistation(
                seq,
                ga_orders,
                ops_by_order,
                station_caps,
                setup_minutes,
            )
            return tard, 0.0, setup, timeline  # Var nicht genutzt hier
        mu, var, setup, _ = simulate_with_capacity(
            seq,
            ga_orders,
            ops_by_order,
            dem_machines,
            mon_machines,
            with_timeline=False,
            dem_flex_share=dem_flex_share,
            mon_flex_share=mon_flex_share,
            setup_minutes=setup_minutes,
        )
        return mu, var, setup, None

    # NEU: Evaluierungsfunktion für GA mit Varianten
    def eval_sequence_with_variants(individual: List[Tuple[int, int]]) -> Tuple[float, float, float, Optional[List[Dict[str, Any]]]]:
        """
        Evaluiert ein Individuum mit (order_idx, variant_idx) Tupeln.
        Baut temporäres ops_by_order basierend auf gewählten Varianten.
        """
        # Baue ops_by_order basierend auf gewählten Varianten
        temp_ops_by_order: Dict[str, List[Dict[str, Any]]] = {}
        for order_idx, variant_idx in individual:
            order = orders[order_idx]
            variants = ops_by_order_variants.get(order.order_id, [])
            # Sichere Varianten-Wahl
            actual_variant_idx = min(variant_idx, len(variants) - 1) if variants else 0
            temp_ops_by_order[order.order_id] = variants[actual_variant_idx] if variants else []

        # Extrahiere nur die Auftragsreihenfolge für die Simulation
        seq = [gene[0] for gene in individual]

        if stations_cfg:
            ms, tard, setup, timeline = simulate_multistation(
                seq,
                ga_orders,
                temp_ops_by_order,
                station_caps,
                setup_minutes,
            )
            return tard, 0.0, setup, timeline
        mu, var, setup, timeline = simulate_with_capacity(
            seq,
            ga_orders,
            temp_ops_by_order,
            dem_machines,
            mon_machines,
            with_timeline=True,  # Timeline für beste Lösung
            dem_flex_share=dem_flex_share,
            mon_flex_share=mon_flex_share,
            setup_minutes=setup_minutes,
        )
        return mu, var, setup, timeline

    # Entscheide welchen GA nutzen
    use_variant_ga = orders_with_multiple_variants > 0
    chosen_variants: Dict[str, int] = {}

    if use_variant_ga:
        print(f"INFO: Using GA with sequence variant optimization ({orders_with_multiple_variants} orders have multiple variants)", file=sys.stderr)
        variant_rate = float(ga_config.get("variantMutationRate", 0.15) or 0.15)

        best_individual, history, best_components, best_timeline, chosen_variants = optimize_with_variants_ga(
            orders=orders,
            ga_orders=ga_orders,
            variant_counts=variant_counts,
            ops_by_order_variants=ops_by_order_variants,
            lam=lam,
            population=pop_size,
            generations=generations,
            swap_rate=mutation_rate,
            variant_rate=variant_rate,
            elite=elite,
            seed=seed,
            eval_fn_with_variants=eval_sequence_with_variants,
            setup_weight=setup_weight,
        )
        # Konvertiere best_individual zu best_seq (nur Auftragsreihenfolge)
        best_seq = [gene[0] for gene in best_individual]

        # Aktualisiere ops_by_order mit gewählten Varianten für weitere Verarbeitung
        for order_idx, variant_idx in best_individual:
            order = orders[order_idx]
            variants = ops_by_order_variants.get(order.order_id, [])
            actual_variant_idx = min(variant_idx, len(variants) - 1) if variants else 0
            ops_by_order[order.order_id] = variants[actual_variant_idx] if variants else []

        progress.append({
            "stage": "PIP_V2_STAGE",
            "step": "ga_with_variants_complete",
            "iterations": len(history),
            "variantsChosen": chosen_variants,
            "nonDefaultVariants": sum(1 for v in chosen_variants.values() if v > 0),
        })
    else:
        print(f"INFO: Using standard GA (no sequence variants available)", file=sys.stderr)
        best_seq, history, best_components, best_timeline = optimize_sequence_ga(
            orders=ga_orders,
            lam=lam,
            population=pop_size,
            generations=generations,
            mutation_rate=mutation_rate,
            elite=elite,
            replications=reps,
            seed=seed,
            eval_fn=eval_sequence,
            setup_weight=setup_weight,
        )
        progress.append({"stage": "PIP_V2_STAGE", "step": "ga_complete", "iterations": len(history)})

    if not best_seq:
        best_seq = baseline_seq

    eval_base = eval_sequence(baseline_seq)
    if len(eval_base) == 4:
        baseline_mu, baseline_var, baseline_setup, _ = eval_base  # type: ignore
    else:
        baseline_mu, baseline_var, baseline_setup = eval_base  # type: ignore

    # Timeline für best_seq (zur Visualisierung im Queue Monitor)
    # WICHTIG: Mit flex/fixed + setup für korrekte Timeline-Ausgabe
    if stations_cfg and best_timeline is not None:
        ops_timeline = best_timeline
    else:
        _, _, _, ops_timeline = simulate_with_capacity(
            best_seq,
            ga_orders,
            ops_by_order,
            dem_machines,
            mon_machines,
            with_timeline=True,
            dem_flex_share=dem_flex_share,
            mon_flex_share=mon_flex_share,
            setup_minutes=setup_minutes,
        )
    if not ops_timeline:
        # Detaillierte Diagnose wenn Timeline leer ist
        empty_diagnosis = {
            "totalOrders": len(orders),
            "opsPerOrder": {oid: len(ops) for oid, ops in ops_by_order.items()},
            "ordersWithZeroOps": sum(1 for ops in ops_by_order.values() if len(ops) == 0),
            "demMachines": dem_machines,
            "monMachines": mon_machines,
            "demFlexShare": dem_flex_share,
            "monFlexShare": mon_flex_share,
        }
        print(f"ERROR: ops_timeline EMPTY - Diagnosis: {json.dumps(empty_diagnosis)}", file=sys.stderr)
        print(f"WARNING: PIP_OPS_TIMELINE is empty (orders={len(orders)}, ops_by_order={len(ops_by_order)}) - check demOps/monOps durations > 0 and processSequences", file=sys.stderr)
    # Einheitliche Timeline für Debug/Export
    timeline_export = ops_timeline if ops_timeline else (best_timeline or [])
    best_mu, best_var, best_setup = best_components
    baseline_obj = baseline_mu + lam * baseline_var + setup_weight * baseline_setup
    best_obj = best_mu + lam * best_var + setup_weight * best_setup

    baseline_plan = build_plan(baseline_seq, orders, now)
    optimized_plan = build_plan(best_seq, orders, now)
    plan_lookup = {row["orderId"]: row for row in optimized_plan}

    # Baseline-Timeline für Terminabweichungs-Vergleich erzeugen
    _, _, _, baseline_timeline = simulate_with_capacity(
        baseline_seq,
        ga_orders,
        ops_by_order,
        dem_machines,
        mon_machines,
        with_timeline=True,
        dem_flex_share=dem_flex_share,
        mon_flex_share=mon_flex_share,
        setup_minutes=setup_minutes,
    )

    priorities, priority_map = compute_priorities(optimized_plan)
    routes = build_routes(orders, plan_lookup)

    q_min = int(config.get("qMin", 3) or 3)
    q_max = int(config.get("qMax", max(q_min, 6)) or max(q_min, 6))
    batches = build_batches(best_seq, orders, plan_lookup, priority_map, q_min, q_max)

    release_list = [orders[idx].order_id for idx in best_seq]
    pn_valid = validate_plan_with_pn(orders) if validate_with_pn else None

    debug = prepare_debug_entries(
        now=now,
        orders=orders,
        config=config,
        ga_config={
            "population": pop_size,
            "generations": generations,
            "mutationRate": mutation_rate,
            "elite": elite,
            "replications": reps,
            "seed": seed,
        },
        history=history,
        baseline_seq=baseline_seq,
        best_seq=best_seq,
        baseline_obj=baseline_obj,
        baseline_components=(baseline_mu, baseline_var),
        best_obj=best_obj,
        best_components=(best_mu, best_var),
        baseline_plan=baseline_plan,
        optimized_plan=optimized_plan,
        ops_timeline=ops_timeline,
        baseline_timeline=baseline_timeline,
    )
    debug = progress + debug

    if pn_valid is not None:
        debug.append({
            "stage": "PIP_PETRI_VALIDATION",
            "result": bool(pn_valid),
            "orders": len(orders),
        })

    # PIP_OPS_TIMELINE immer hinzufügen (auch wenn leer) für Frontend-Diagnose
    orders_with_ops = sum(1 for oid, ops in ops_by_order.items() if ops)
    orders_without_ops = [oid for oid, ops in ops_by_order.items() if not ops]

    zero_duration_examples: List[Dict[str, Any]] = []
    for oid, ops in ops_by_order.items():
        for op in ops:
            try:
                dur = float(op.get("expectedDuration") or op.get("proc") or 0.0)
            except Exception:
                dur = 0.0
            if dur <= 0:
                zero_duration_examples.append({
                    "orderId": oid,
                    "station": op.get("stationId") or op.get("station"),
                    "rawDuration": op.get("expectedDuration") or op.get("proc"),
                })
                if len(zero_duration_examples) >= 10:
                    break
        if len(zero_duration_examples) >= 10:
            break

    # Create etaList from optimized_plan for JavaScript integration
    eta_list = [
        {
            "orderId": row["orderId"],
            "eta": row["plannedEnd"]
        }
        for row in optimized_plan
    ]

    # Detaillierte Diagnose für leere Timeline
    ops_count_per_order = {oid: len(ops) for oid, ops in ops_by_order.items()}
    ops_with_zero_dur = []
    for oid, ops in ops_by_order.items():
        for op in ops:
            dur = float(op.get("expectedDuration") or op.get("proc") or 0.0)
            if dur <= 0:
                ops_with_zero_dur.append({"orderId": oid, "opId": op.get("id"), "station": op.get("stationId"), "dur": dur})
            if len(ops_with_zero_dur) >= 5:
                break

    debug.append({
        "stage": "PIP_OPS_TIMELINE",
        "timeline": timeline_export,
        "demMachines": dem_machines,
        "monMachines": mon_machines,
        "demFlexSharePct": dem_flex_share * 100.0,
        "monFlexSharePct": mon_flex_share * 100.0,
        "timelineLength": len(timeline_export),
        "ordersWithOps": orders_with_ops,
        "ordersWithoutOps": orders_without_ops,
        "totalOrders": len(ops_by_order),
        "opsCountPerOrder": ops_count_per_order,
        "opsWithZeroDuration": ops_with_zero_dur[:5],
        "zeroDurationExamples": zero_duration_examples,
        "note": (
            "timeline empty - no valid ops (check demOps/monOps, expectedDuration > 0 und processSequences)"
            if not timeline_export else "ok"
        ),
    })
    if timeline_export:
        debug.append({
            "stage": "PIP_TIMELINE_EXPORT",
            "timelineLength": len(timeline_export),
            "stations": sorted({op.get("station") for op in timeline_export if op.get("station")}),
            "orders": sorted({op.get("orderId") for op in timeline_export if op.get("orderId")}),
        })

    # === NEU: Detaillierter Vorher/Nachher Debug für Dashboard ===
    # Input-Reihenfolge (FIFO = wie im Batch angekommen)
    input_order_ids = [orders[idx].order_id for idx in input_order]
    # Baseline-Reihenfolge (EDD-Sortiert)
    baseline_order_ids = [orders[idx].order_id for idx in baseline_seq]
    # Optimierte Reihenfolge (GA-Output)
    optimized_order_ids = [orders[idx].order_id for idx in best_seq]

    # Berechne Positions-Änderungen
    order_changes = []
    for i, order_id in enumerate(input_order_ids):
        input_pos = i + 1  # 1-indexed
        optimized_pos = optimized_order_ids.index(order_id) + 1 if order_id in optimized_order_ids else None
        baseline_pos = baseline_order_ids.index(order_id) + 1 if order_id in baseline_order_ids else None
        delta = (optimized_pos - input_pos) if optimized_pos else None

        # Gewählte Sequenz-Variante für diesen Auftrag
        variant_info = chosen_variants.get(order_id, 0)
        order = next((o for o in orders if o.order_id == order_id), None)
        variant_count = len(order.sequence_variants) if order and order.sequence_variants else 0

        order_changes.append({
            "orderId": order_id,
            "inputPos": input_pos,
            "baselinePos": baseline_pos,
            "optimizedPos": optimized_pos,
            "delta": delta,
            "changed": delta != 0 if delta is not None else False,
            "variantChosen": variant_info,
            "variantCount": variant_count,
        })

    total_changed = sum(1 for c in order_changes if c["changed"])

    debug.append({
        "stage": "PIP_ORDER_COMPARISON",
        "inputOrder": input_order_ids,
        "baselineOrder": baseline_order_ids,
        "optimizedOrder": optimized_order_ids,
        "orderChanges": order_changes,
        "totalOrders": len(orders),
        "totalChanged": total_changed,
        "mutationRate": mutation_rate,
        "generations": generations,
        "population": pop_size,
        "note": f"GA mit mutationRate={mutation_rate:.2f} - {total_changed}/{len(orders)} Aufträge haben Position geändert"
    })

    # Input-Reihenfolge (FIFO = wie die Aufträge im Payload ankamen)
    input_order_list = [orders[idx].order_id for idx in input_order]

    # ========== HOLD DECISIONS ==========
    # Determine which orders to hold based on:
    # 1. Capacity overload (more orders than stations can handle)
    # 2. Due-date buffer (orders with enough slack can wait)
    # 3. Always release if capacity would be idle

    hold_decisions: List[Dict[str, Any]] = []
    batch_cycle_minutes = float(config.get("horizonMinutes", 240.0) or 240.0)
    hold_until = now + batch_cycle_minutes

    # Get total station capacity
    total_dem_stations = dem_machines if dem_machines else 0
    total_mon_stations = mon_machines if mon_machines else 0
    total_capacity = max(1, total_dem_stations + total_mon_stations)

    # Calculate expected processing load
    total_processing_time = sum(
        sum(float(op.get("expectedDuration") or 0.0) for op in ops_by_order.get(oid, []))
        for oid in release_list
    )
    avg_processing_per_order = total_processing_time / len(release_list) if release_list else 0

    # Capacity utilization estimate
    capacity_per_cycle = total_capacity * batch_cycle_minutes
    utilization = total_processing_time / capacity_per_cycle if capacity_per_cycle > 0 else 0

    # Only hold if there's capacity overload (utilization > threshold)
    UTILIZATION_THRESHOLD = 0.8  # Hold only if > 80% utilized
    MIN_DUE_DATE_BUFFER = batch_cycle_minutes * 2  # Need at least 2 cycles of buffer to hold

    if utilization > UTILIZATION_THRESHOLD and len(release_list) > total_capacity:
        # Find orders at the end of the release list with enough due-date buffer
        orders_by_id = {o.order_id: o for o in orders}

        # Only consider orders beyond capacity threshold for holding
        orders_beyond_capacity = release_list[total_capacity:]

        for oid in orders_beyond_capacity:
            order = orders_by_id.get(oid)
            if not order:
                continue

            # Calculate slack (time until due date minus expected completion)
            due_date = order.due_date
            # Estimate completion time (rough: position in queue * avg processing time)
            position = release_list.index(oid) + 1
            estimated_completion = now + (position * avg_processing_per_order / max(1, total_capacity))
            slack = due_date - estimated_completion

            if slack > MIN_DUE_DATE_BUFFER:
                hold_decisions.append({
                    "orderId": oid,
                    "holdUntilSimMinute": hold_until,
                    "holdReason": f"PIP capacity overload ({utilization:.0%} util) - due date buffer {slack:.0f}min"
                })

    if hold_decisions:
        print(f"\n🔒 [PIP Hold] {len(hold_decisions)} orders held until t={hold_until:.0f} (capacity util={utilization:.0%})", file=sys.stderr)
        for hd in hold_decisions[:5]:
            print(f"  - {hd['orderId'][:12]}: {hd['holdReason']}", file=sys.stderr)
    else:
        print(f"\n✅ [PIP Hold] No holds - capacity util={utilization:.0%}, threshold={UTILIZATION_THRESHOLD:.0%}", file=sys.stderr)

    debug.append({
        "stage": "PIP_HOLD_DECISIONS",
        "holdCount": len(hold_decisions),
        "utilizationEstimate": utilization,
        "utilizationThreshold": UTILIZATION_THRESHOLD,
        "totalCapacity": total_capacity,
        "ordersInBatch": len(release_list),
        "batchCycleMinutes": batch_cycle_minutes,
    })

    return {
        "priorities": priorities,
        "routes": routes,
        "batches": batches,
        "releaseList": release_list,
        "inputOrderList": input_order_list,  # NEU: Original FIFO-Reihenfolge für Dashboard-Vergleich
        "etaList": eta_list,
        "expectedTardiness": best_mu,
        "varianceTardiness": best_var,
        "pnValidation": pn_valid,
        "timelineOps": timeline_export,
        "chosenVariants": chosen_variants,  # NEU: Gewählte Sequenz-Variante pro Auftrag
        "holdDecisions": hold_decisions,
        "debug": debug,
    }


def main() -> None:
    try:
        payload = load_payload()
        result = schedule_payload(payload)
    except Exception as exc:  # pragma: no cover
        result = {
            "priorities": [],
            "routes": [],
            "batches": [],
            "releaseList": [],
            "etaList": [],
            "holdDecisions": [],
            "debug": [{"stage": "PIP_V2_ERROR", "message": str(exc)}],
        }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
