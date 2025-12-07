#!/usr/bin/env python3
"""
Ansatz_Becker_Feinterminierung_v2
---------------------------------

Feinterminierung nach MOAHS (Liu et al. 2020) mit vollständiger Queue-Monitor-Kompatibilität.
ERWEITERT: Optimierung über alle Sequenzvarianten pro Auftrag + Kapazitätssimulation mit fixen/flexiblen Stationen.
"""

from __future__ import annotations

import base64
import io
import json
import math
import random
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


@dataclass
class Operation:
    id: str
    station_id: str
    duration: float
    resources: List[str]
    family: Optional[str]


@dataclass
class OrderData:
    order_id: str
    due_date: float
    operations: List[Operation]
    # NEU: Für Sequenzvarianten-Optimierung
    dem_ops: List[Dict[str, Any]] = field(default_factory=list)
    mon_ops: List[Dict[str, Any]] = field(default_factory=list)
    sequence_variants: List[Tuple[str, List[str]]] = field(default_factory=list)  # [(seq_id, steps), ...]


@dataclass
class Plan:
    plan_id: str
    sequence: List[int]  # Auftragsreihenfolge
    operations: List[Dict[str, Any]]
    metrics: Dict[str, float]
    rank: int = 0
    crowding: float = 0.0
    # NEU: Sequenzvarianten-Wahl pro Auftrag (Index in sequence_variants Liste)
    variant_choices: List[int] = field(default_factory=list)  # variant_choices[i] = Variante für orders[i] (ORDER-Index, nicht Sequenz-Position)


def _load_payload() -> Dict[str, Any]:
    """
    Read JSON payload from stdin. Returns {} for empty input and never raises
    on malformed JSON – instead it falls back to an empty payload so the
    caller still gets a structured error response.
    """
    text = sys.stdin.read()
    if not text.strip():
        return {}
    try:
        return json.loads(text)
    except Exception:
        return {}


def _ensure_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(float(value))
    except Exception:
        return default


def _safe_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return default


# ============================================================================
# NEU: Sequenzvarianten-Funktionen (aus Mittelfristiger Terminierung übernommen)
# ============================================================================

def clone_operations(ops: Optional[Iterable[Any]]) -> List[Dict[str, Any]]:
    """Klont eine Liste von Operations als dicts."""
    cloned: List[Dict[str, Any]] = []
    if not ops:
        return cloned
    for op in ops:
        if isinstance(op, dict):
            cloned.append(dict(op))
    return cloned


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
    dem_ops_by_name: Dict[str, Dict[str, Any]] = {}
    for op in dem_ops:
        meta = op.get("meta", {})
        primary_name = meta.get("step") if isinstance(meta, dict) else None
        fallback_name = op.get("label") or op.get("setupFamily") or op.get("bg") or op.get("id", "")

        if primary_name:
            dem_ops_by_name[primary_name] = op
        if fallback_name and fallback_name != primary_name:
            dem_ops_by_name[fallback_name] = op

    mon_ops_by_name: Dict[str, Dict[str, Any]] = {}
    for op in mon_ops:
        meta = op.get("meta", {})
        primary_name = meta.get("step") if isinstance(meta, dict) else None
        fallback_name = op.get("label") or op.get("setupFamily") or op.get("bg") or op.get("id", "")

        if primary_name:
            mon_ops_by_name[primary_name] = op
        if fallback_name and fallback_name != primary_name:
            mon_ops_by_name[fallback_name] = op

    # Verarbeite Demontage-Steps in Sequenz-Reihenfolge
    matched_dem = 0
    for step_name in dem_steps:
        op = dem_ops_by_name.get(step_name)
        if not op:
            # Fallback: Versuche Prefix-Matching
            for key, candidate_op in dem_ops_by_name.items():
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

    return result


def _build_ops_legacy(
    steps: List[str],
    dem_ops: List[Dict[str, Any]],
    mon_ops: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Legacy-Fallback: Alte Logik für Sequenzen ohne × Separator."""
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


# ============================================================================
# NEU: Kapazitätssimulation mit fixen/flexiblen Stationen
# ============================================================================

def simulate_with_capacity(
    order_sequence: Sequence[int],
    variant_choices: Sequence[int],
    orders: Sequence[OrderData],
    start_time: float,
    dem_machines: int,
    mon_machines: int,
    dem_flex_share: float = 0.0,
    mon_flex_share: float = 0.0,
    setup_minutes: float = 0.0,
    with_timeline: bool = False,
) -> Tuple[Dict[str, Any], Optional[List[Dict[str, Any]]]]:
    """
    Parallelmaschinen-Simulation mit Ressourcenpools Demontage/Montage.
    - Ops werden AUFTRAGSSEQUENTIELL abgearbeitet: nächste Op erst nach Abschluss der vorherigen.
    - Fixed machines werden VORAB nach durchschnittlicher Bearbeitungszeit zugewiesen.
    - Flexible machines können alle Typen bearbeiten. Bei BG-Typ-Wechsel wird Setup-Zeit addiert.
    - Gibt (metrics, timeline?) zurück.
    """
    timeline: List[Dict[str, Any]] = []
    tardiness_vals: List[float] = []
    total_setup_time = 0.0

    if not orders:
        return {"makespan": 0.0, "tardiness": 0.0, "idleTime": 0.0, "setupTime": 0.0}, (timeline if with_timeline else None)

    # Baue Ops pro Auftrag basierend auf Sequenzvarianten-Wahl
    # WICHTIG: variant_choices ist nach ORDER-Index indiziert (nicht nach Sequenz-Position),
    # da _generate_variant_choices für orders[i] die Variante generiert
    ops_by_order: Dict[str, List[Dict[str, Any]]] = {}
    for i, order_idx in enumerate(order_sequence):
        order = orders[order_idx]
        variant_idx = variant_choices[order_idx] if order_idx < len(variant_choices) else 0

        if not order.sequence_variants:
            raise ValueError(f"[PIPO] Order {order.order_id} has no sequence_variants; aborting instead of falling back")
        if variant_idx >= len(order.sequence_variants):
            raise IndexError(f"[PIPO] Variant index {variant_idx} out of range for order {order.order_id} (variants={len(order.sequence_variants)})")

        _, steps = order.sequence_variants[variant_idx]
        ops = build_ops_from_sequence(steps, clone_operations(order.dem_ops), clone_operations(order.mon_ops))

        ops_by_order[order.order_id] = ops

    # Maschinen-Setup
    dem_total = max(1, dem_machines)
    mon_total = max(1, mon_machines)
    dem_flex_count = max(0, min(dem_total, int(round(dem_total * dem_flex_share)))) if dem_flex_share > 0 else 0
    mon_flex_count = max(0, min(mon_total, int(round(mon_total * mon_flex_share)))) if mon_flex_share > 0 else 0
    dem_fixed = dem_total - dem_flex_count
    mon_fixed = mon_total - mon_flex_count
    dem_available = [start_time] * dem_total
    mon_available = [start_time] * mon_total

    # Vorab-Zuweisung fixer Stationen nach durchschnittlicher Bearbeitungszeit
    dem_step_durations: Dict[str, List[float]] = {}
    mon_step_durations: Dict[str, List[float]] = {}

    for order in orders:
        ops = ops_by_order.get(order.order_id, [])
        for op in ops:
            station = (op.get("stationId") or "").lower()
            step = op.get("meta", {}).get("step") if isinstance(op.get("meta"), dict) else op.get("sequenceStep")
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

    dem_step_avg = [(step, sum(durs) / len(durs)) for step, durs in dem_step_durations.items()]
    mon_step_avg = [(step, sum(durs) / len(durs)) for step, durs in mon_step_durations.items()]
    dem_step_avg.sort(key=lambda x: -x[1])
    mon_step_avg.sort(key=lambda x: -x[1])

    dem_last_step: List[Optional[str]] = [None] * dem_total
    mon_last_step: List[Optional[str]] = [None] * mon_total

    for i, (step, _) in enumerate(dem_step_avg):
        if i < dem_fixed:
            dem_last_step[i] = step

    for i, (step, _) in enumerate(mon_step_avg):
        if i < mon_fixed:
            mon_last_step[i] = step

    global_completion = start_time

    # Simuliere Aufträge in der gegebenen Reihenfolge
    for order_idx in order_sequence:
        order = orders[order_idx]
        ops = ops_by_order.get(order.order_id, [])
        order_clock = start_time
        order_completion = start_time

        for op in ops:
            station = (op.get("stationId") or "").lower()
            step = op.get("meta", {}).get("step") if isinstance(op.get("meta"), dict) else op.get("sequenceStep")
            dur = float(op.get("expectedDuration") or 0.0)
            if dur <= 0:
                continue

            if "dem" in station:
                chosen_idx = None
                setup_applied = False
                machine_type = "fixed"

                # 1. Fixed: Nutze die fixe Station, die diesem step zugewiesen ist
                if dem_fixed > 0 and step:
                    for i in range(dem_fixed):
                        if dem_last_step[i] == step:
                            chosen_idx = i
                            break

                # 2. Flex: flexible machine (kann umgerüstet werden)
                # WICHTIG: Priorisiere Maschinen die bereits denselben Step haben (kein Setup nötig)
                if chosen_idx is None and dem_flex_count > 0:
                    # 2a. Erst: Suche Flex-Maschine die bereits denselben Step hat (Setup vermeiden)
                    same_step_earliest_time = float('inf')
                    same_step_idx = None
                    for i in range(dem_fixed, dem_total):
                        if dem_last_step[i] == step and dem_available[i] < same_step_earliest_time:
                            same_step_earliest_time = dem_available[i]
                            same_step_idx = i

                    if same_step_idx is not None:
                        chosen_idx = same_step_idx
                        machine_type = "flex"
                        setup_applied = False  # Kein Setup, da gleicher Step
                    else:
                        # 2b. Sonst: Nutze früheste verfügbare Flex-Maschine
                        flex_earliest_time = float('inf')
                        flex_earliest_idx = None
                        for i in range(dem_fixed, dem_total):
                            if dem_available[i] < flex_earliest_time:
                                flex_earliest_time = dem_available[i]
                                flex_earliest_idx = i
                        if flex_earliest_idx is not None:
                            chosen_idx = flex_earliest_idx
                            machine_type = "flex"
                            if setup_minutes > 0 and dem_last_step[chosen_idx] is not None and dem_last_step[chosen_idx] != step:
                                setup_applied = True

                # 3. Fallback: Nutze eine beliebige freie Maschine
                if chosen_idx is None:
                    earliest_time = float('inf')
                    for i in range(dem_total):
                        if dem_available[i] < earliest_time:
                            earliest_time = dem_available[i]
                            chosen_idx = i
                    if chosen_idx is not None and chosen_idx < dem_fixed:
                        machine_type = "fixed-fallback"

                if chosen_idx is None:
                    continue

                op_start = max(order_clock, dem_available[chosen_idx])
                if setup_applied:
                    op_start += setup_minutes
                    total_setup_time += setup_minutes
                op_end = op_start + dur
                dem_available[chosen_idx] = op_end
                dem_last_step[chosen_idx] = step
                machine = f"DEM-{chosen_idx+1}"
                order_clock = op_end
                order_completion = max(order_completion, op_end)
            else:
                # Montage
                chosen_idx = None
                setup_applied = False
                machine_type = "fixed"

                if mon_fixed > 0 and step:
                    for i in range(mon_fixed):
                        if mon_last_step[i] == step:
                            chosen_idx = i
                            break

                # WICHTIG: Priorisiere Maschinen die bereits denselben Step haben (kein Setup nötig)
                if chosen_idx is None and mon_flex_count > 0:
                    # 2a. Erst: Suche Flex-Maschine die bereits denselben Step hat (Setup vermeiden)
                    same_step_earliest_time = float('inf')
                    same_step_idx = None
                    for i in range(mon_fixed, mon_total):
                        if mon_last_step[i] == step and mon_available[i] < same_step_earliest_time:
                            same_step_earliest_time = mon_available[i]
                            same_step_idx = i

                    if same_step_idx is not None:
                        chosen_idx = same_step_idx
                        machine_type = "flex"
                        setup_applied = False  # Kein Setup, da gleicher Step
                    else:
                        # 2b. Sonst: Nutze früheste verfügbare Flex-Maschine
                        flex_earliest_time = float('inf')
                        flex_earliest_idx = None
                        for i in range(mon_fixed, mon_total):
                            if mon_available[i] < flex_earliest_time:
                                flex_earliest_time = mon_available[i]
                                flex_earliest_idx = i
                        if flex_earliest_idx is not None:
                            chosen_idx = flex_earliest_idx
                            machine_type = "flex"
                            if setup_minutes > 0 and mon_last_step[chosen_idx] is not None and mon_last_step[chosen_idx] != step:
                                setup_applied = True

                if chosen_idx is None:
                    earliest_time = float('inf')
                    for i in range(mon_total):
                        if mon_available[i] < earliest_time:
                            earliest_time = mon_available[i]
                            chosen_idx = i
                    if chosen_idx is not None and chosen_idx < mon_fixed:
                        machine_type = "fixed-fallback"

                if chosen_idx is None:
                    continue

                op_start = max(order_clock, mon_available[chosen_idx])
                if setup_applied:
                    op_start += setup_minutes
                    total_setup_time += setup_minutes
                op_end = op_start + dur
                mon_available[chosen_idx] = op_end
                mon_last_step[chosen_idx] = step
                machine = f"MON-{chosen_idx+1}"
                order_clock = op_end
                order_completion = max(order_completion, op_end)

            # Timeline wird IMMER intern erstellt (für Metriken-Berechnung)
            timeline.append({
                "orderId": order.order_id,
                "stationId": station,
                "machine": machine,
                "machineType": machine_type,
                "step": step,
                "bgType": step,  # Baugruppentyp für Gantt-Chart (= step name)
                "startTime": op_start,
                "endTime": op_end,
                "expectedDuration": dur,
            })

            global_completion = max(global_completion, op_end)

        # Tardiness für diesen Auftrag
        tardiness = max(0.0, order_completion - order.due_date)
        tardiness_vals.append(tardiness)

    # ============================================================================
    # Auslastungsberechnung pro Slot (Y/X Verhältnis)
    # Y = belegte Zeit pro Slot (sum_durations)
    # X = Slot-spezifische Zeitspanne (max_end - min_start für diesen Slot)
    # util = Y / X (NICHT globaler Horizont!)
    # ============================================================================
    time_span = global_completion - start_time  # Globale Makespan

    # Sammle pro Maschine: min_start, max_end, sum_durations
    machine_stats: Dict[str, Dict[str, float]] = {}
    if timeline:
        for entry in timeline:
            machine = entry.get("machine", "")
            op_start = entry.get("startTime", 0.0)
            op_end = entry.get("endTime", 0.0)
            dur = op_end - op_start
            if machine and dur > 0:
                if machine not in machine_stats:
                    machine_stats[machine] = {"min_start": op_start, "max_end": op_end, "sum_durations": 0.0}
                else:
                    machine_stats[machine]["min_start"] = min(machine_stats[machine]["min_start"], op_start)
                    machine_stats[machine]["max_end"] = max(machine_stats[machine]["max_end"], op_end)
                machine_stats[machine]["sum_durations"] += dur

    # Auslastung pro Slot berechnen mit Slot-spezifischem Span
    slot_utilizations: Dict[str, float] = {}
    total_busy_time = 0.0
    active_slots = 0  # Nur Slots zählen die auch belegt wurden

    all_machines = [f"DEM-{i+1}" for i in range(dem_total)] + [f"MON-{i+1}" for i in range(mon_total)]

    for machine in all_machines:
        if machine in machine_stats:
            stats = machine_stats[machine]
            slot_span = stats["max_end"] - stats["min_start"]
            sum_dur = stats["sum_durations"]
            total_busy_time += sum_dur

            # Auslastung = belegte Zeit / Slot-Span (nicht global!)
            if slot_span > 0:
                util = (sum_dur / slot_span) * 100.0
                slot_utilizations[machine] = util
                active_slots += 1
            else:
                # Wenn span == 0, bedeutet nur ein Job mit Dauer -> 100% Auslastung
                slot_utilizations[machine] = 100.0 if sum_dur > 0 else 0.0
                active_slots += 1
        else:
            # Maschine wurde nicht genutzt
            slot_utilizations[machine] = 0.0

    # Gesamtauslastung = Summe aller Bearbeitungszeiten / (Makespan × Anzahl Maschinen)
    # Formel: total_busy_time / (time_span * len(all_machines)) * 100
    total_available = time_span * len(all_machines) if time_span > 0 else 0.0
    avg_utilization = (total_busy_time / total_available * 100.0) if total_available > 0 else 0.0

    # Idle-Time berechnen (globaler Horizont)
    idle_time = max(0.0, total_available - total_busy_time) if time_span > 0 else 0.0

    # ============================================================================
    # Lateness (mit Vorzeichen) aus Timeline berechnen
    # Lateness = completion - dueDate (positiv = verspätet, negativ = verfrüht)
    # Tardiness = max(0, lateness) (nur Verspätungen)
    # ============================================================================
    lateness_vals: List[float] = []
    order_completions: Dict[str, float] = {}

    # Finde Fertigstellungszeit pro Auftrag aus Timeline
    if timeline:
        for entry in timeline:
            order_id = entry.get("orderId")
            op_end = entry.get("endTime", start_time)
            if order_id:
                order_completions[order_id] = max(order_completions.get(order_id, start_time), op_end)

    # Debug-Prints pro Auftrag
    print(f"[PIPO-DEBUG] === Lateness pro Auftrag ===", file=sys.stderr)
    for order_idx in order_sequence:
        order = orders[order_idx]
        completion = order_completions.get(order.order_id, start_time)
        lateness = completion - order.due_date  # positiv = zu spät
        lateness_vals.append(lateness)
        print(f"[PIPO-DEBUG] Order {order.order_id[-8:]}: dueDate={order.due_date:.0f}, completion={completion:.0f}, lateness={lateness:+.1f}", file=sys.stderr)

    # Debug-Prints pro Slot
    print(f"[PIPO-DEBUG] === Auslastung pro Slot ===", file=sys.stderr)
    for machine in sorted(machine_stats.keys()):
        stats = machine_stats[machine]
        slot_span = stats["max_end"] - stats["min_start"]
        util = slot_utilizations.get(machine, 0.0)
        print(f"[PIPO-DEBUG] {machine}: min_start={stats['min_start']:.0f}, max_end={stats['max_end']:.0f}, span={slot_span:.0f}, sum_dur={stats['sum_durations']:.0f}, util={util:.1f}%", file=sys.stderr)

    avg_lateness = sum(lateness_vals) / len(lateness_vals) if lateness_vals else 0.0

    metrics = {
        "makespan": float(time_span),
        "tardiness": float(sum(tardiness_vals)),  # Summe der Verspätungen (>=0)
        "avgTardiness": float(sum(tardiness_vals) / len(tardiness_vals)) if tardiness_vals else 0.0,
        "lateness": float(sum(lateness_vals)),  # Summe mit Vorzeichen
        "avgLateness": float(avg_lateness),  # Durchschnitt mit Vorzeichen (positiv=verspätet, negativ=verfrüht)
        "idleTime": float(idle_time),
        "setupTime": float(total_setup_time),
        "avgUtilization": float(avg_utilization),  # Durchschnittliche Auslastung in %
        "slotUtilizations": slot_utilizations,  # Auslastung pro Slot in %
    }

    return metrics, (timeline if with_timeline else None)


def _clone_operation(raw: Dict[str, Any], default_station: str) -> Operation:
    op_id = str(raw.get("id") or f"{default_station}-{random.randint(1, 9999)}")
    station = str(raw.get("stationId") or default_station)
    duration = _safe_float(raw.get("expectedDuration"), 0.0)
    if duration <= 0:
        print(f"WARNING: Operation {op_id} has duration <= 0: {duration} (from raw: {raw.get('expectedDuration')})", file=sys.stderr)
        # NO FALLBACK - keep 0 to expose the problem
        # duration = 30.0
    resources = [str(r) for r in _ensure_list(raw.get("resources"))]
    family = raw.get("family")
    if family is not None:
        family = str(family)
    return Operation(op_id, station, duration, resources, family)


def _build_orders(payload: Dict[str, Any]) -> Tuple[List[OrderData], float, Dict[str, Any]]:
    raw_orders = payload.get("orders") or []
    if not isinstance(raw_orders, list):
        raise ValueError("orders must be a list")
    start_time = _safe_float(payload.get("startTime"), 0.0)
    config = payload.get("config") or {}
    orders: List[OrderData] = []
    for idx, raw in enumerate(raw_orders):
        if not isinstance(raw, dict):
            raise ValueError(f"[PIPO] Order at index {idx} is not a dict")

        order_id = str(raw.get("orderId") or raw.get("id") or f"order-{idx + 1}")

        # KEIN FALLBACK für dueDate - muss vorhanden sein!
        due_date = raw.get("dueDate")
        if due_date is None:
            raise ValueError(f"[PIPO] Order {order_id} has no dueDate - must be provided from langfristiger Terminierung!")
        due_date = _safe_float(due_date, 0.0)

        # KEIN FALLBACK für operations - müssen vorhanden sein!
        operations_raw = raw.get("operations") or []
        if not operations_raw:
            raise ValueError(f"[PIPO] Order {order_id} has no operations!")

        dem_ops: List[Dict[str, Any]] = []
        mon_ops: List[Dict[str, Any]] = []
        operations: List[Operation] = []

        for op_raw in operations_raw:
            station_id = str(op_raw.get("stationId") or "").lower()
            op_dict = dict(op_raw)

            # Klassifiziere als Demontage oder Montage
            if "dem" in station_id or "disassembly" in station_id:
                dem_ops.append(op_dict)
            else:
                mon_ops.append(op_dict)

            operations.append(_clone_operation(op_raw, f"{order_id}-station"))

        # KEIN FALLBACK für processSequences - müssen vorhanden sein!
        process_sequences = raw.get("processSequences")
        if not process_sequences:
            raise ValueError(f"[PIPO] Order {order_id} has no processSequences!")

        sequence_variants = parse_all_sequence_variants(process_sequences)
        if not sequence_variants:
            raise ValueError(f"[PIPO] Order {order_id} has processSequences but no valid sequence variants could be parsed!")

        print(f"[PIPO] Order {order_id[-4:]}: {len(sequence_variants)} sequence variants found, {len(dem_ops)} dem_ops, {len(mon_ops)} mon_ops", file=sys.stderr)

        orders.append(OrderData(
            order_id=order_id,
            due_date=due_date,
            operations=operations,
            dem_ops=dem_ops,
            mon_ops=mon_ops,
            sequence_variants=sequence_variants,
        ))
    return orders, start_time, config


def _random_permutation(size: int, rng: random.Random) -> List[int]:
    arr = list(range(size))
    rng.shuffle(arr)
    return arr


def _simulate_sequence(
    sequence: Sequence[int],
    orders: Sequence[OrderData],
    start_time: float,
    setup_matrix: Optional[Dict[str, Dict[str, Dict[str, float]]]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    machine_ready: Dict[str, float] = {}
    last_family: Dict[str, Optional[str]] = {}
    intervals: Dict[str, List[Tuple[float, float]]] = {}
    operations_out: List[Dict[str, Any]] = []
    global_completion = start_time
    tardiness_sum = 0.0

    for idx in sequence:
        order = orders[idx]
        job_ready = start_time
        for op in order.operations:
            station = op.station_id
            machine_time = machine_ready.get(station, start_time)
            setup = 0.0
            if setup_matrix and station in setup_matrix:
                prev_family = last_family.get(station)
                if prev_family is not None:
                    setup = (
                        setup_matrix.get(station, {})
                        .get(prev_family, {})
                        .get(op.family or "", 0.0)
                        or 0.0
                    )
            real_start = max(job_ready, machine_time) + setup
            real_end = real_start + op.duration
            machine_ready[station] = real_end
            last_family[station] = op.family
            job_ready = real_end
            global_completion = max(global_completion, real_end)
            intervals.setdefault(station, []).append((real_start, real_end))
            operations_out.append(
                {
                    "id": op.id,
                    "stationId": station,
                    "orderId": order.order_id,
                    "expectedDuration": op.duration,
                    "startTime": real_start,
                    "endTime": real_end,
                    "resources": op.resources,
                    "bgType": op.family,  # Baugruppentyp für Gantt-Chart Label
                }
            )
        tardiness_sum += max(0.0, job_ready - order.due_date)

    idle_sum = 0.0
    for ints in intervals.values():
        ints = sorted(ints, key=lambda x: x[0])
        for i in range(1, len(ints)):
            idle_sum += max(0.0, ints[i][0] - ints[i - 1][1])

    metrics = {
        "makespan": float(global_completion - start_time),
        "tardiness": float(tardiness_sum),
        "idleTime": float(idle_sum),
    }
    return operations_out, metrics


def _dominates(a: Dict[str, float], b: Dict[str, float]) -> bool:
    keys = ("makespan", "tardiness", "idleTime")
    better_or_equal = all(a[k] <= b[k] for k in keys)
    strictly_better = any(a[k] < b[k] for k in keys)
    return better_or_equal and strictly_better


def _fast_non_dominated_sort(plans: List[Plan]) -> List[List[Plan]]:
    fronts: List[List[Plan]] = []
    S: Dict[int, List[int]] = {}
    n_dom: Dict[int, int] = {}
    for i, p in enumerate(plans):
        S[i] = []
        n_dom[i] = 0
        for j, q in enumerate(plans):
            if i == j:
                continue
            if _dominates(p.metrics, q.metrics):
                S[i].append(j)
            elif _dominates(q.metrics, p.metrics):
                n_dom[i] += 1
        if n_dom[i] == 0:
            p.rank = 1
    front_idxs = [i for i in range(len(plans)) if n_dom[i] == 0]
    if front_idxs:
        fronts.append([plans[i] for i in front_idxs])
    current = front_idxs
    while current:
        next_front: List[int] = []
        for i in current:
            for j in S[i]:
                n_dom[j] -= 1
                if n_dom[j] == 0:
                    plans[j].rank = len(fronts) + 1
                    next_front.append(j)
        if not next_front:
            break
        fronts.append([plans[i] for i in next_front])
        current = next_front
    return fronts


def _compute_crowding(front: List[Plan]) -> None:
    if not front:
        return
    metrics = ["makespan", "tardiness", "idleTime"]
    n = len(front)
    for plan in front:
        plan.crowding = 0.0
    for key in metrics:
        front.sort(key=lambda p: p.metrics[key])
        front[0].crowding = float("inf")
        front[-1].crowding = float("inf")
        min_val = front[0].metrics[key]
        max_val = front[-1].metrics[key]
        if max_val == min_val:
            continue
        for i in range(1, n - 1):
            prev_val = front[i - 1].metrics[key]
            next_val = front[i + 1].metrics[key]
            front[i].crowding += (next_val - prev_val) / (max_val - min_val)


def _select_harmony_memory(all_plans: List[Plan], hms: int) -> List[Plan]:
    if len(all_plans) <= hms:
        return list(all_plans)
    fronts = _fast_non_dominated_sort(all_plans)
    selected: List[Plan] = []
    for front in fronts:
        _compute_crowding(front)
        if len(selected) + len(front) <= hms:
            selected.extend(front)
        else:
            front.sort(key=lambda p: p.crowding, reverse=True)
            remaining = hms - len(selected)
            selected.extend(front[:remaining])
            break
    return selected


def _estimate_similarity(hm: List[Plan]) -> float:
    if not hm or len(hm) == 1:
        return 0.0
    n = len(hm[0].sequence)
    matches = 0
    total = (len(hm) * (len(hm) - 1) // 2) * n
    if total <= 0:
        return 0.0
    for i in range(len(hm)):
        seq_i = hm[i].sequence
        for j in range(i + 1, len(hm)):
            seq_j = hm[j].sequence
            for pos in range(n):
                if seq_i[pos] == seq_j[pos]:
                    matches += 1
    return matches / float(total)


def _adaptive_hmcr_par(
    similarity: float,
    hmcr_min: float,
    hmcr_max: float,
    par_min: float,
    par_max: float,
) -> Tuple[float, float]:
    """
    Adaptive HMCR/PAR basierend auf Harmony Memory Similarity.

    Diversitäts-Strategie (invertiert für bessere Exploration):
    - Bei hoher Similarity (Konvergenz) → niedrigere HMCR → mehr Random-Exploration
    - Bei niedriger Similarity (Diversität) → höhere HMCR → mehr Memory-Nutzung

    PAR wird quadratisch skaliert für stärkere lokale Suche bei Konvergenz.
    """
    # Invertierte HMCR: Bei hoher Similarity mehr Exploration (niedrigere HMCR)
    hmcr = hmcr_max - (hmcr_max - hmcr_min) * similarity

    # Quadratische PAR-Skalierung: Stärkerer Pitch Adjustment bei hoher Similarity
    # Dies ermöglicht feinere lokale Suche wenn die Population konvergiert
    par = par_min + (par_max - par_min) * (similarity ** 0.7)

    return hmcr, par


def _generate_new_sequence(hm: List[Plan], rng: random.Random, hmcr: float, par: float) -> List[int]:
    """
    Generiert eine neue Auftragssequenz basierend auf Harmony Memory.

    Diversitäts-Verbesserungen:
    - Gewichtete Memory-Wahl (bessere Pläne bevorzugt)
    - Multi-Swap PAR (bis zu 3 Swaps statt nur 1)
    - Segment-Inversion für größere Strukturänderungen
    """
    if not hm:
        return []
    n = len(hm[0].sequence)
    jobs = list(range(n))
    new_seq: List[Optional[int]] = [None] * n
    used = set()

    for pos in range(n):
        choose_memory = rng.random() < hmcr
        val = None
        if choose_memory:
            # Gewichtete Auswahl: Bessere Pläne (niedrigerer Index in HM) bevorzugen
            weights = [1.0 / (idx + 1) for idx in range(len(hm))]
            total_weight = sum(weights)
            weights = [w / total_weight for w in weights]

            # Gewichtete Planauswahl
            plan_indices = list(range(len(hm)))
            rng.shuffle(plan_indices)  # Shuffle für Tie-Breaking
            for plan_idx in plan_indices:
                if rng.random() < weights[plan_idx] * len(hm):
                    cand = hm[plan_idx].sequence[pos]
                    if cand not in used:
                        val = cand
                        break

            # Fallback: Einfache Memory-Wahl
            if val is None:
                candidates = [plan.sequence[pos] for plan in hm]
                rng.shuffle(candidates)
                for cand in candidates:
                    if cand not in used:
                        val = cand
                        break

        if val is None:
            remaining = [job for job in jobs if job not in used]
            val = rng.choice(remaining)
        new_seq[pos] = val
        used.add(val)

    # Erweiterte Pitch Adjustment: Multi-Swap und Segment-Inversion
    if n > 1 and rng.random() < par:
        # Anzahl der Swaps: 1-3 basierend auf PAR-Intensität
        num_swaps = 1 + int(rng.random() * min(3, n // 2) * par)
        for _ in range(num_swaps):
            i, j = rng.sample(range(n), 2)
            new_seq[i], new_seq[j] = new_seq[j], new_seq[i]

        # Zusätzliche Segment-Inversion mit halber PAR-Wahrscheinlichkeit
        if n > 3 and rng.random() < par * 0.5:
            seg_len = rng.randint(2, max(2, n // 3))
            start = rng.randint(0, n - seg_len)
            # Segment invertieren
            segment = new_seq[start:start + seg_len]
            new_seq[start:start + seg_len] = segment[::-1]

    return [int(x) for x in new_seq if x is not None]


def _generate_variant_choices(
    orders: Sequence[OrderData],
    rng: random.Random,
    hm: Optional[List[Plan]] = None,
    hmcr: float = 0.8,
    par: float = 0.3,
) -> List[int]:
    """
    Generiert Sequenzvarianten-Wahl für alle Aufträge.
    Wenn hm (Harmony Memory) gegeben, nutzt HMCR/PAR für Memory-basierte Wahl.

    Diversitäts-Verbesserungen:
    - Gewichtete Memory-Wahl (seltene Varianten bevorzugen)
    - Erweiterter PAR: Sprung zu beliebiger Variante möglich
    - Block-Mutation: Mehrere aufeinanderfolgende Varianten ändern
    """
    n = len(orders)
    choices: List[int] = []

    for i in range(n):
        order = orders[i]
        num_variants = len(order.sequence_variants) if order.sequence_variants else 1

        if num_variants <= 1:
            choices.append(0)
            continue

        if hm and rng.random() < hmcr:
            # Memory-basierte Wahl mit Diversitäts-Bonus für seltene Varianten
            candidates = []
            for plan in hm:
                if i < len(plan.variant_choices):
                    candidates.append(plan.variant_choices[i])

            if candidates:
                # Zähle Häufigkeit jeder Variante in HM
                variant_counts = {}
                for c in candidates:
                    variant_counts[c] = variant_counts.get(c, 0) + 1

                # Invertierte Gewichtung: Seltene Varianten bevorzugen
                weights = []
                for c in candidates:
                    # Weniger häufig = höheres Gewicht
                    weights.append(1.0 / (variant_counts[c] + 0.5))

                total_weight = sum(weights)
                weights = [w / total_weight for w in weights]

                # Gewichtete Auswahl
                r = rng.random()
                cumsum = 0.0
                choice = candidates[0]
                for idx, w in enumerate(weights):
                    cumsum += w
                    if r <= cumsum:
                        choice = candidates[idx]
                        break
            else:
                choice = rng.randint(0, num_variants - 1)
        else:
            # Zufällige Wahl
            choice = rng.randint(0, num_variants - 1)

        # Erweiterter Pitch Adjustment: Größere Sprünge möglich
        if rng.random() < par:
            if num_variants > 2 and rng.random() < 0.3:
                # Mit 30% Wahrscheinlichkeit: Sprung zu beliebiger anderer Variante
                other_variants = [v for v in range(num_variants) if v != choice]
                if other_variants:
                    choice = rng.choice(other_variants)
            else:
                # Standard: Nachbar-Variante
                if rng.random() < 0.5 and choice > 0:
                    choice -= 1
                elif choice < num_variants - 1:
                    choice += 1

        choices.append(choice)

    # Block-Mutation: Mit PAR-Wahrscheinlichkeit mehrere aufeinanderfolgende Varianten ändern
    if n > 2 and rng.random() < par * 0.4:
        block_size = rng.randint(2, max(2, n // 4))
        start = rng.randint(0, n - block_size)
        for j in range(start, start + block_size):
            order = orders[j]
            num_v = len(order.sequence_variants) if order.sequence_variants else 1
            if num_v > 1:
                # Neue zufällige Variante für diesen Block
                choices[j] = rng.randint(0, num_v - 1)

    return choices


def _score_plan(plan: Plan, weights: Dict[str, float]) -> float:
    return (
        plan.metrics["makespan"] * weights.get("makespan", 0.34)
        + plan.metrics["tardiness"] * weights.get("tardiness", 0.33)
        + plan.metrics["idleTime"] * weights.get("idleTime", 0.33)
    )


def create_iteration_chart(iteration_history: List[Dict[str, float]]) -> Optional[str]:
    """
    Erstellt ein kombiniertes Chart mit 3 Subplots für MOAHS-Konvergenz:
    - Durchlaufzeit (Makespan) über Iterationen
    - Lieferterminabweichung (Lateness mit Vorzeichen) über Iterationen
    - Auslastung (direkt berechnet) über Iterationen
    """
    if not iteration_history:
        return None

    try:
        iterations = list(range(len(iteration_history)))
        makespan_vals = [h["makespan"] for h in iteration_history]
        # Lieferterminabweichung mit Vorzeichen (negativ = verfrüht, positiv = verspätet)
        lateness_vals = [h.get("avgLateness", h.get("tardiness", 0.0)) for h in iteration_history]
        # Auslastung direkt aus Metriken (Summe Bearbeitungszeiten / (Makespan × Maschinen))
        utilization_vals = [h.get("avgUtilization", 0.0) for h in iteration_history]

        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(8, 6))

        # Durchlaufzeit (Makespan)
        ax1.plot(iterations, makespan_vals, marker='o', linewidth=2, color='#9333ea', markersize=3)
        ax1.set_ylabel("Durchlaufzeit (min)", fontsize=9)
        ax1.set_title("MOAHS-Konvergenz: Durchlaufzeit", fontsize=10)
        ax1.grid(True, linestyle="--", alpha=0.4)

        # Lieferterminabweichung (Lateness mit Vorzeichen)
        ax2.plot(iterations, lateness_vals, marker='o', linewidth=2, color='#ea580c', markersize=3)
        ax2.axhline(y=0, color='gray', linestyle='--', linewidth=1, alpha=0.5)  # Nulllinie
        ax2.set_ylabel("Ø Abweichung (min)", fontsize=9)
        ax2.set_title("MOAHS-Konvergenz: Lieferterminabweichung (- = verfrüht, + = verspätet)", fontsize=10)
        ax2.grid(True, linestyle="--", alpha=0.4)

        # Auslastung (direkt berechnet)
        ax3.plot(iterations, utilization_vals, marker='o', linewidth=2, color='#22c55e', markersize=3)
        ax3.set_xlabel("Iteration", fontsize=9)
        ax3.set_ylabel("Auslastung (%)", fontsize=9)
        ax3.set_title("MOAHS-Konvergenz: Kapazitätsauslastung", fontsize=10)
        ax3.grid(True, linestyle="--", alpha=0.4)

        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return None


def create_gantt_chart_pipo(operations: List[Dict[str, Any]], stations: List[str], start_time: float) -> Tuple[Optional[str], Optional[str]]:
    """
    Erstellt ein Gantt-Chart für PIPO (Feinterminierung).
    Zeigt Operationen gruppiert nach Stationen über die Zeit.
    """
    if not operations:
        return None, "no_operations"
    if not stations:
        return None, "no_stations"

    try:
        # Nur valide Operationen rendern
        valid_ops = []
        for op in operations:
            start = op.get("start")
            end = op.get("end")
            if start is None or end is None:
                continue
            try:
                start = float(start)
                end = float(end)
            except Exception:
                continue
            if not math.isfinite(start) or not math.isfinite(end):
                continue
            if end < start:
                continue
            valid_ops.append({**op, "start": start, "end": end})

        if not valid_ops:
            return None, "no_valid_ops"

        # Gruppiere Operationen nach Station
        station_ops = {station: [] for station in stations}
        for op in valid_ops:
            if op["stationId"] in station_ops:
                station_ops[op["stationId"]].append(op)

        plotted = sum(len(v) for v in station_ops.values())
        if plotted == 0:
            return None, "no_ops_for_listed_stations"

        fig, ax = plt.subplots(figsize=(12, max(4, len(stations) * 0.6)))

        # Farben für verschiedene Aufträge (wie bei PIP)
        order_ids = sorted(set(op["orderId"] for op in valid_ops))
        colors = plt.cm.tab20(range(len(order_ids)))
        order_colors = {order_id: colors[i % len(colors)] for i, order_id in enumerate(order_ids)}

        # Zeichne Balken für jede Station
        for i, station in enumerate(stations):
            ops = station_ops.get(station, [])
            for op in ops:
                start = op["start"] - start_time
                duration = op["end"] - op["start"]
                color = order_colors[op["orderId"]]
                ax.barh(i, duration, left=start, height=0.6,
                       color=color, edgecolor='black', alpha=0.8)

                # Label mit Baugruppentyp (wie bei PIP) - konsistent mit mittelfristiger Terminierung
                bg_type = op.get("bgType") or op.get("id") or op.get("step") or ""
                if duration > 2:  # Nur bei ausreichender Breite (wie bei PIP)
                    ax.text(start + duration/2, i, bg_type,
                           ha='center', va='center', fontsize=7, color='black')

        # Formatierung (konsistent mit PIP)
        ax.set_yticks(range(len(stations)))
        ax.set_yticklabels(stations)
        ax.set_xlabel("Zeit (Minuten)")
        ax.set_title("Kurzfristige Terminierung (Ops-Ebene)")
        ax.grid(True, linestyle="--", alpha=0.5, axis="x")

        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode("ascii"), None
    except Exception as exc:
        return None, f"exception: {exc}"


def create_plot_entries_pipo(
    iteration_history: List[Dict[str, float]],
    selected: Optional[Plan],
    start_time: float
) -> List[Dict[str, Any]]:
    """
    Erstellt Plot-Einträge für PIPO-Visualisierungen.
    """
    entries: List[Dict[str, Any]] = []

    try:
        # 1. Iteration Charts
        if iteration_history:
            iteration_b64 = create_iteration_chart(iteration_history)
            if iteration_b64:
                entries.append({
                    "stage": "PIPO_MOAHS_PLOT_ITERATIONS",
                    "media": {
                        "type": "image/png",
                        "encoding": "base64",
                        "data": iteration_b64,
                    },
                })
            else:
                entries.append({
                    "stage": "PIPO_PLOT_INFO",
                    "message": "Iteration chart not generated (no variation or render failure)."
                })

        # 2. Gantt Chart
        if selected:
            stations = sorted(set(op["stationId"] for op in selected.operations))
            gantt_ops = [
                {
                    "stationId": op["stationId"],
                    "orderId": op["orderId"],
                    "start": op["startTime"],
                    "end": op["endTime"],
                    "bgType": op.get("bgType", op.get("id", "")),  # Baugruppentyp für Label
                }
                for op in selected.operations
            ]
            gantt_b64, gantt_reason = create_gantt_chart_pipo(gantt_ops, stations, start_time)
            if gantt_b64:
                entries.append({
                    "stage": "PIPO_MOAHS_PLOT_GANTT",
                    "media": {
                        "type": "image/png",
                        "encoding": "base64",
                        "data": gantt_b64,
                    },
                })
            else:
                entries.append({
                    "stage": "PIPO_PLOT_GANTT_SKIPPED",
                    "message": gantt_reason or "unknown_reason",
                    "stationCount": len(stations),
                    "opCount": len(gantt_ops),
                })

        # 3. Metriken als Textausgabe (statt Bar-Chart)
        if selected and selected.metrics:
            m = selected.metrics
            avg_lateness = m.get("avgLateness", 0.0)
            avg_tardiness = m.get("avgTardiness", 0.0)
            avg_util = m.get("avgUtilization", 0.0)
            makespan = m.get("makespan", 0.0)
            setup_time = m.get("setupTime", 0.0)
            slot_utils = m.get("slotUtilizations", {})

            entries.append({
                "stage": "PIPO_METRICS_SUMMARY",
                "makespan": round(makespan, 1),
                "avgLateness": round(avg_lateness, 1),  # Mit Vorzeichen: + = verspätet, - = verfrüht
                "avgTardiness": round(avg_tardiness, 1),  # Ohne Vorzeichen (>=0)
                "avgUtilization": round(avg_util, 1),
                "setupTime": round(setup_time, 1),
                "slotUtilizations": {k: round(v, 1) for k, v in slot_utils.items()},
                "message": f"Makespan={makespan:.1f} min | Ø Terminabweichung={avg_lateness:+.1f} min | Ø Auslastung={avg_util:.1f}%"
            })

    except Exception as exc:
        entries.append({"stage": "PIPO_PLOT_ERROR", "error": str(exc)})

    return entries


def _build_debug(
    orders: List[OrderData],
    config: Dict[str, Any],
    hm: List[Plan],
    pareto: List[Plan],
    selected: Optional[Plan],
    released: List[Dict[str, Any]],
    iterations: int,
    iteration_history: Optional[List[Dict[str, float]]] = None,
    start_time: float = 0.0,
    ops_input: Optional[List[Dict[str, Any]]] = None,
    fitness_constant: bool = False,
) -> List[Dict[str, Any]]:
    debug: List[Dict[str, Any]] = [
        {"stage": "PIPO_INPUT", "orderCount": len(orders), "config": config},
        {
            "stage": "PIPO_HM_METRICS",
            "hmSize": len(hm),
            "iterations": iterations,
        },
        {
            "stage": "PIPO_PARETO",
            "paretoCount": len(pareto),
            "preview": [
                {"id": plan.plan_id, "metrics": plan.metrics, "sequence": plan.sequence[:15]}
                for plan in pareto[:5]
            ],
        },
    ]
    if ops_input:
        debug.append({"stage": "PIPO_OPS_INPUT", "orders": ops_input})
    if selected:
        debug.append(
            {
                "stage": "PIPO_SELECTED_PLAN",
                "planId": selected.plan_id,
                "metrics": selected.metrics,
                "sequence": selected.sequence[:20],
            }
        )
    if released:
        debug.append(
            {
                "stage": "PIPO_RELEASED_OPS",
                "count": len(released),
                "preview": released[:8],
            }
        )
    if fitness_constant:
        debug.append(
            {
                "stage": "PIPO_FITNESS_CONSTANT",
                "message": "Objective values did not change across iterations; check operation data or weights.",
            }
        )

    # Add matplotlib plot entries
    plot_entries = create_plot_entries_pipo(iteration_history or [], selected, start_time)
    debug.extend(plot_entries)

    return debug


def _schedule(payload: Dict[str, Any]) -> Dict[str, Any]:
    progress: List[Dict[str, Any]] = [{"stage": "PIPO_V2_STAGE", "step": "payload_loaded"}]
    # Capture incoming operations/durations for debugging
    ops_debug = []
    for o in payload.get("orders", []):
        ops_debug.append({
            "orderId": o.get("orderId"),
            "ops": [
                {
                    "id": op.get("id"),
                    "stationId": op.get("stationId"),
                    "expectedDuration": op.get("expectedDuration"),
                    "family": op.get("family"),
                }
                for op in (o.get("operations") or [])
            ],
            "processSequences": o.get("processSequences"),
        })

    orders, start_time, config = _build_orders(payload)
    progress.append({"stage": "PIPO_V2_STAGE", "step": "orders_built", "orders": len(orders)})
    if not orders:
        return {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "holdDecisions": [],
            "debug": [{"stage": "PIPO_EMPTY", "message": "Keine Aufträge vorhanden."}],
        }

    rng = random.Random(int(config.get("seed") or 9211))
    setup_matrix = config.get("setupMatrix")
    weights = config.get("weights") or {}

    # NEU: Factory-Kapazität aus Config extrahieren
    factory_capacity = config.get("factoryCapacity") or {}
    dem_machines = _safe_int(factory_capacity.get("demontageStationen"), 5)
    mon_machines = _safe_int(factory_capacity.get("montageStationen"), 10)
    dem_flex_share = _safe_float(config.get("demFlexSharePct", 50), 50) / 100.0
    mon_flex_share = _safe_float(config.get("monFlexSharePct", 50), 50) / 100.0
    setup_minutes = _safe_float(config.get("setupMinutes", 0), 0)

    # Log der Sequenzvarianten pro Auftrag
    print(f"[PIPO] Factory capacity: DEM={dem_machines} (flex={dem_flex_share:.0%}), MON={mon_machines} (flex={mon_flex_share:.0%}), setup={setup_minutes}min", file=sys.stderr)
    for order in orders:
        print(f"[PIPO] Order {order.order_id[-4:]}: {len(order.sequence_variants)} variants, {len(order.dem_ops)} dem, {len(order.mon_ops)} mon", file=sys.stderr)

    progress.append({"stage": "PIPO_V2_STAGE", "step": "config_ready"})

    # Hilfsfunktion: Simuliere und erstelle Plan
    def create_plan(seq: List[int], variants: List[int], plan_id: str) -> Plan:
        metrics, timeline = simulate_with_capacity(
            seq, variants, orders, start_time,
            dem_machines, mon_machines,
            dem_flex_share, mon_flex_share,
            setup_minutes, with_timeline=True
        )
        # Konvertiere Timeline zu Operations-Format für Kompatibilität
        ops_out = []
        for entry in (timeline or []):
            ops_out.append({
                "id": entry.get("step", "op"),
                "stationId": entry.get("machine", entry.get("stationId", "unknown")),
                "orderId": entry["orderId"],
                "expectedDuration": entry["expectedDuration"],
                "startTime": entry["startTime"],
                "endTime": entry["endTime"],
                "resources": [],
                "machine": entry.get("machine"),
                "machineType": entry.get("machineType"),
            })
        return Plan(plan_id, list(seq), ops_out, metrics, variant_choices=list(variants))

    if len(orders) == 1:
        seq = [0]
        variants = _generate_variant_choices(orders, rng)
        plan = create_plan(seq, variants, "plan-0")
        release_fraction = min(max(float(config.get("releaseFraction") or 0.5), 0.0), 1.0)
        sorted_ops = sorted(plan.operations, key=lambda o: o["startTime"])
        count = max(1, int(len(sorted_ops) * release_fraction))
        released_ops = sorted_ops[:count]
        debug = _build_debug(orders, config, [plan], [plan], plan, released_ops, 0, None, start_time, ops_debug)
        return {
            "paretoSet": [{"id": plan.plan_id, "sequence": plan.sequence, "variantChoices": plan.variant_choices, "operations": plan.operations, "objectiveValues": plan.metrics}],
            "selectedPlanId": plan.plan_id,
            "releasedOps": released_ops,
            "holdDecisions": [],  # Single order fallback - no holds needed
            "debug": debug,
        }

    HMS = max(1, _safe_int(config.get("HMS"), 30))
    iterations = max(0, _safe_int(config.get("iterations"), 200))
    candidates_per_iter = max(1, _safe_int(config.get("candidatesPerIter"), 25))
    max_pareto = max(1, _safe_int(config.get("maxPareto"), 20))
    release_fraction = min(max(_safe_float(config.get("releaseFraction"), 0.5), 0.0), 1.0)
    # Diversitäts-verbesserte HMCR/PAR Spannen (erweitert für mehr Exploration)
    # HMCR: 0.5-0.92 statt 0.7-0.95 → mehr Random-Wahl bei niedriger Similarity
    # PAR: 0.15-0.65 statt 0.2-0.5 → mehr Pitch Adjustment für lokale Suche
    hmcr_min = _safe_float(config.get("HMCRmin"), 0.5)
    hmcr_max = _safe_float(config.get("HMCRmax"), 0.92)
    par_min = _safe_float(config.get("PARmin"), 0.15)
    par_max = _safe_float(config.get("PARmax"), 0.65)

    # MOAHS Initialization Logging
    print(f"[MOAHS-PIPO] Starting with {len(orders)} orders", file=sys.stderr)
    print(f"[MOAHS-PIPO] Config: HMS={HMS}, iterations={iterations}, candidates_per_iter={candidates_per_iter}", file=sys.stderr)
    print(f"[MOAHS-PIPO] Weights: makespan={weights.get('makespan', 0.34):.2f}, tardiness={weights.get('tardiness', 0.33):.2f}, idleTime={weights.get('idleTime', 0.33):.2f}", file=sys.stderr)

    # Log Sequenzvarianten-Suchraum
    total_variant_combos = 1
    for order in orders:
        num_v = max(1, len(order.sequence_variants))
        total_variant_combos *= num_v
    print(f"[MOAHS-PIPO] Sequence variant search space: {total_variant_combos} combinations", file=sys.stderr)

    n = len(orders)
    plan_counter = 0

    # Erstelle initiale Auftragssequenzen (wie zuvor)
    seq_candidates: List[List[int]] = []
    identity = list(range(n))
    seq_candidates.append(identity)

    # Nutze dem_ops + mon_ops Summe für Dauer-Schätzung
    def estimate_duration(order: OrderData) -> float:
        dem_dur = sum(float(op.get("expectedDuration", 0)) for op in order.dem_ops)
        mon_dur = sum(float(op.get("expectedDuration", 0)) for op in order.mon_ops)
        if dem_dur + mon_dur > 0:
            return dem_dur + mon_dur
        return sum(op.duration for op in order.operations)

    durations = [estimate_duration(order) for order in orders]
    due_dates = [order.due_date for order in orders]
    spt = sorted(identity, key=lambda idx: durations[idx])
    edd = sorted(identity, key=lambda idx: due_dates[idx])
    for seq in (spt, edd):
        if seq not in seq_candidates:
            seq_candidates.append(seq)
    seen = {tuple(seq) for seq in seq_candidates}
    target = min(HMS, math.factorial(n) if n <= 10 else HMS)
    while len(seen) < target:
        seq = tuple(_random_permutation(n, rng))
        if seq not in seen:
            seen.add(seq)
            seq_candidates.append(list(seq))

    # Initialisiere Harmony Memory mit verschiedenen Sequenzen UND Varianten
    harmony_memory: List[Plan] = []
    for seq in seq_candidates[:HMS]:
        # Generiere verschiedene Varianten-Kombinationen für jede Sequenz
        variants = _generate_variant_choices(orders, rng)
        plan = create_plan(seq, variants, f"plan-{plan_counter}")
        plan_counter += 1
        harmony_memory.append(plan)

    progress.append({"stage": "PIPO_V2_STAGE", "step": "hm_initialized", "plans": len(harmony_memory)})

    # Log initial Harmony Memory
    if harmony_memory:
        best_init = min(harmony_memory, key=lambda p: _score_plan(p, weights))
        print(f"[MOAHS-PIPO] Initial HM size: {len(harmony_memory)}", file=sys.stderr)
        print(f"[MOAHS-PIPO] Initial best: makespan={best_init.metrics['makespan']:.1f}, tardiness={best_init.metrics['tardiness']:.1f}, idle={best_init.metrics['idleTime']:.1f}", file=sys.stderr)
        print(f"[MOAHS-PIPO] Initial sequence: {best_init.sequence}", file=sys.stderr)
        print(f"[MOAHS-PIPO] Initial variants: {best_init.variant_choices}", file=sys.stderr)

    iteration_history: List[Dict[str, float]] = []
    for it in range(iterations):
        similarity = _estimate_similarity(harmony_memory)
        hmcr, par = _adaptive_hmcr_par(similarity, hmcr_min, hmcr_max, par_min, par_max)
        new_plans: List[Plan] = []
        for _ in range(candidates_per_iter):
            # Generiere neue Auftragssequenz
            new_seq = _generate_new_sequence(harmony_memory, rng, hmcr, par)
            # Generiere neue Varianten-Wahl (nutzt HM für Memory-basierte Wahl)
            new_variants = _generate_variant_choices(orders, rng, harmony_memory, hmcr, par)
            plan = create_plan(new_seq, new_variants, f"plan-{plan_counter}")
            plan_counter += 1
            new_plans.append(plan)
        harmony_memory = _select_harmony_memory(harmony_memory + new_plans, HMS)

        # Track best metrics in current harmony memory
        if harmony_memory:
            best_makespan = min(p.metrics["makespan"] for p in harmony_memory)
            best_tardiness = min(p.metrics["tardiness"] for p in harmony_memory)
            best_idle = min(p.metrics["idleTime"] for p in harmony_memory)
            # Für Lateness: Durchschnitt der avgLateness (mit Vorzeichen)
            best_lateness = min(p.metrics.get("avgLateness", 0.0) for p in harmony_memory)
            # Für Auslastung: Maximum (höhere = besser)
            best_utilization = max(p.metrics.get("avgUtilization", 0.0) for p in harmony_memory)
            iteration_history.append({
                "makespan": best_makespan,
                "tardiness": best_tardiness,
                "idleTime": best_idle,
                "avgLateness": best_lateness,
                "avgUtilization": best_utilization,
            })

            # Iteration Progress Logging
            if it == 0:
                print(f"[MOAHS-PIPO] Iter 0: makespan={best_makespan:.1f}, tardiness={best_tardiness:.1f}, idle={best_idle:.1f}", file=sys.stderr)
                best_plan = min(harmony_memory, key=lambda p: _score_plan(p, weights))
                print(f"[MOAHS-PIPO] Iter 0: sequence={best_plan.sequence}, variants={best_plan.variant_choices}", file=sys.stderr)
            elif (it + 1) % 20 == 0 or it == iterations - 1:
                improvement = ""
                if len(iteration_history) > 1:
                    prev = iteration_history[-2]
                    if best_makespan < prev["makespan"] or best_tardiness < prev["tardiness"] or best_idle < prev["idleTime"]:
                        improvement = "↓"
                    else:
                        improvement = "→"
                print(f"[MOAHS-PIPO] Iter {it + 1}: makespan={best_makespan:.1f}, tardiness={best_tardiness:.1f}, idle={best_idle:.1f} {improvement}", file=sys.stderr)
                print(f"[MOAHS-PIPO] Iter {it + 1}: similarity={similarity:.3f}, HMCR={hmcr:.3f}, PAR={par:.3f}", file=sys.stderr)
    progress.append({"stage": "PIPO_V2_STAGE", "step": "iterations_done", "iterations": iterations})

    fronts = _fast_non_dominated_sort(harmony_memory)
    pareto_front = fronts[0] if fronts else []
    pareto_front = pareto_front[:max_pareto]
    selected = pareto_front[0] if pareto_front else (harmony_memory[0] if harmony_memory else None)
    if selected and weights:
        selected = min(pareto_front, key=lambda p: _score_plan(p, weights))
    progress.append({"stage": "PIPO_V2_STAGE", "step": "selection_done", "pareto": len(pareto_front)})

    # Pareto Front and Selection Logging
    print(f"[MOAHS-PIPO] Pareto front size: {len(pareto_front)}", file=sys.stderr)
    if selected:
        print(f"[MOAHS-PIPO] Selected plan: {selected.plan_id}", file=sys.stderr)
        print(f"[MOAHS-PIPO] Selected metrics: makespan={selected.metrics['makespan']:.1f}, tardiness={selected.metrics['tardiness']:.1f}, idle={selected.metrics['idleTime']:.1f}", file=sys.stderr)
        # Neue Metriken loggen
        avg_lateness = selected.metrics.get('avgLateness', 0.0)
        avg_util = selected.metrics.get('avgUtilization', 0.0)
        lateness_sign = "verspätet" if avg_lateness > 0 else "verfrüht"
        print(f"[MOAHS-PIPO] Ø Terminabweichung: {avg_lateness:+.1f} min ({lateness_sign})", file=sys.stderr)
        print(f"[MOAHS-PIPO] Ø Auslastung: {avg_util:.1f}%", file=sys.stderr)
        print(f"[MOAHS-PIPO] Selected sequence: {selected.sequence}", file=sys.stderr)
        print(f"[MOAHS-PIPO] Selected variants: {selected.variant_choices}", file=sys.stderr)
        print(f"[MOAHS-PIPO] Selected operations count: {len(selected.operations)}", file=sys.stderr)

    released_ops: List[Dict[str, Any]] = []
    if selected:
        sorted_ops = sorted(selected.operations, key=lambda o: o["startTime"])
        count = max(1, int(len(sorted_ops) * release_fraction))
        released_ops = sorted_ops[:count]

        # Released Operations Logging
        print(f"[MOAHS-PIPO] Release fraction: {release_fraction:.1%} → releasing {count}/{len(sorted_ops)} operations", file=sys.stderr)

        # Station utilization statistics
        station_ops = {}
        for op in selected.operations:
            station = op["stationId"]
            station_ops[station] = station_ops.get(station, 0) + 1
        print(f"[MOAHS-PIPO] Station utilization: {dict(sorted(station_ops.items()))}", file=sys.stderr)

    # Detect constant fitness (no improvement across iterations)
    fitness_constant = False
    if iteration_history:
        tuples = {(round(h["makespan"], 6), round(h["tardiness"], 6), round(h["idleTime"], 6)) for h in iteration_history}
        fitness_constant = len(tuples) <= 1
        if fitness_constant:
            print(f"[MOAHS-PIPO] ⚠️  WARNING: Fitness constant across all iterations - no improvement detected!", file=sys.stderr)
            print(f"[MOAHS-PIPO] This may indicate: (1) single/identical orders, (2) excessive capacity, (3) zero weights", file=sys.stderr)

    debug = progress + _build_debug(orders, config, harmony_memory, pareto_front, selected, released_ops, iterations, iteration_history, start_time, ops_debug, fitness_constant)

    # Create etaList from selected plan for JavaScript integration
    eta_list: List[Dict[str, Any]] = []
    if selected and selected.operations:
        # Group operations by orderId and find max endTime for each order
        order_end_times: Dict[str, float] = {}
        for op in selected.operations:
            order_id = op.get("orderId")
            end_time = op.get("endTime", 0.0)
            if order_id:
                order_end_times[order_id] = max(order_end_times.get(order_id, 0.0), end_time)

        eta_list = [
            {"orderId": order_id, "eta": end_time}
            for order_id, end_time in order_end_times.items()
        ]

    # ========== HOLD DECISIONS ==========
    # For PIPO (fine scheduling): Hold orders at the end of the sequence
    # if capacity is overloaded AND they have enough due-date buffer
    hold_decisions: List[Dict[str, Any]] = []

    # Use makespan as batch cycle estimate (or default to 120 minutes)
    batch_cycle_minutes = selected.metrics.get("makespan", 120.0) if selected else 120.0
    hold_until = start_time + batch_cycle_minutes

    # Total capacity
    total_capacity = max(1, dem_machines + mon_machines)

    # Get utilization from selected plan metrics
    utilization = (selected.metrics.get("avgUtilization", 0.0) / 100.0) if selected else 0.0

    # Only hold if overloaded
    UTILIZATION_THRESHOLD = 0.8
    MIN_DUE_DATE_BUFFER = batch_cycle_minutes * 2

    if utilization > UTILIZATION_THRESHOLD and selected and len(orders) > total_capacity:
        release_sequence = selected.sequence  # indices into orders list
        orders_beyond_capacity = release_sequence[total_capacity:]

        for order_idx in orders_beyond_capacity:
            order = orders[order_idx]
            # Calculate slack
            eta_entry = next((e for e in eta_list if e["orderId"] == order.order_id), None)
            estimated_completion = eta_entry["eta"] if eta_entry else start_time + batch_cycle_minutes
            slack = order.due_date - estimated_completion

            if slack > MIN_DUE_DATE_BUFFER:
                hold_decisions.append({
                    "orderId": order.order_id,
                    "holdUntilSimMinute": hold_until,
                    "holdReason": f"PIPO capacity overload ({utilization:.0%} util) - due date buffer {slack:.0f}min"
                })

    if hold_decisions:
        print(f"\n🔒 [PIPO Hold] {len(hold_decisions)} orders held until t={hold_until:.0f} (util={utilization:.0%})", file=sys.stderr)
        for hd in hold_decisions[:5]:
            print(f"  - {hd['orderId'][:12]}: {hd['holdReason']}", file=sys.stderr)
    else:
        print(f"\n✅ [PIPO Hold] No holds - utilization={utilization:.0%}, threshold={UTILIZATION_THRESHOLD:.0%}", file=sys.stderr)

    debug.append({
        "stage": "PIPO_HOLD_DECISIONS",
        "holdCount": len(hold_decisions),
        "utilizationEstimate": utilization,
        "utilizationThreshold": UTILIZATION_THRESHOLD,
        "totalCapacity": total_capacity,
        "ordersInBatch": len(orders),
        "batchCycleMinutes": batch_cycle_minutes,
    })

    # Input order = FIFO order (orders as they were received)
    # Release order = Optimized order from MOAHS (selected.sequence maps indices to orders)
    input_order_list = [o.order_id for o in orders]  # FIFO = original input order
    optimized_release_list = [orders[idx].order_id for idx in (selected.sequence if selected else [])]

    # Debug: log the sequence change
    if selected and selected.sequence:
        fifo_seq = list(range(len(orders)))
        if selected.sequence != fifo_seq:
            print(f"[PIPO] ✅ Sequence CHANGED from FIFO: {fifo_seq[:10]} -> {selected.sequence[:10]}", file=sys.stderr)
        else:
            print(f"[PIPO] ⚠️ Sequence UNCHANGED (still FIFO): {selected.sequence[:10]}", file=sys.stderr)

    return {
        "paretoSet": [
            {
                "id": plan.plan_id,
                "sequence": plan.sequence,
                "variantChoices": plan.variant_choices,
                "operations": plan.operations,
                "objectiveValues": plan.metrics,
            }
            for plan in pareto_front
        ],
        "selectedPlanId": selected.plan_id if selected else None,
        "selectedVariantChoices": selected.variant_choices if selected else [],
        "releasedOps": released_ops,
        # inputOrderList = FIFO order (how orders arrived)
        # releaseList = Optimized order from MOAHS
        "inputOrderList": input_order_list,
        "releaseList": optimized_release_list,
        "etaList": eta_list,
        "holdDecisions": hold_decisions,
        "debug": debug,
    }


def main() -> None:
    try:
        payload = _load_payload()
        result = _schedule(payload)
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover - fail-safe for scheduling daemon
        error_result = {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "holdDecisions": [],
            "debug": [{"stage": "PIPO_ERROR", "message": str(exc)}],
        }
        print(json.dumps(error_result))


if __name__ == "__main__":
    main()
