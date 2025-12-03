#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIFO Baseline – Kurzfristige Terminierung (PIPO/Feinterminierung)
Minimaler kompatibler Output zu Becker_Feinterminierung_v2.py
Keine Optimierung (kein MOAHS), nur FIFO-Reihenfolge.
"""

import json
import sys
from typing import Dict, List, Any, Optional
from collections import defaultdict

def load_payload() -> Dict[str, Any]:
    """Lädt JSON-Payload von stdin. Bei leerem Input: leeres Dict."""
    try:
        raw = sys.stdin.read()
        if not raw or not raw.strip():
            return {}
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}

def main():
    debug_stages: List[Dict[str, Any]] = []

    # 1. Payload laden
    payload = load_payload()
    debug_stages.append({"stage": "payload_loaded", "orderCount": len(payload.get("orders", []))})

    orders = payload.get("orders", [])
    start_time = float(payload.get("startTime", 0.0))
    config = payload.get("config", {})

    # Factory-Kapazität aus Config
    factory_capacity = config.get("factoryCapacity", {})
    dem_stations = int(factory_capacity.get("demontageStationen", 5))
    mon_stations = int(factory_capacity.get("montageStationen", 10))
    dem_flex_pct = float(config.get("demFlexSharePct", 50)) / 100.0
    mon_flex_pct = float(config.get("monFlexSharePct", 50)) / 100.0
    release_fraction = float(config.get("releaseFraction", 0.5))

    # Feste und flexible Stationen berechnen
    dem_fixed = max(1, int(dem_stations * (1 - dem_flex_pct)))
    dem_flex = dem_stations - dem_fixed
    mon_fixed = max(1, int(mon_stations * (1 - mon_flex_pct)))
    mon_flex = mon_stations - mon_fixed

    debug_stages.append({
        "stage": "config_parsed",
        "demStations": dem_stations,
        "monStations": mon_stations,
        "demFixed": dem_fixed,
        "demFlex": dem_flex,
        "monFixed": mon_fixed,
        "monFlex": mon_flex,
        "releaseFraction": release_fraction
    })

    # 2. Orders parsen
    valid_orders = []
    skipped_orders = []

    for idx, o in enumerate(orders):
        oid = o.get("orderId")
        if not oid:
            skipped_orders.append({"index": idx, "reason": "missing orderId"})
            continue

        operations = o.get("operations", [])
        if not operations:
            skipped_orders.append({"index": idx, "orderId": oid, "reason": "no operations"})
            continue

        due_date = float(o.get("dueDate", 0.0))

        valid_orders.append({
            "index": idx,
            "orderId": oid,
            "dueDate": due_date,
            "operations": operations,
            "processSequences": o.get("processSequences")
        })

    debug_stages.append({
        "stage": "orders_parsed",
        "validCount": len(valid_orders),
        "skippedCount": len(skipped_orders),
        "skipped": skipped_orders[:5]
    })

    # 3. FIFO-Simulation: Einfaches Scheduling ohne Optimierung
    # Maschinen-Verfügbarkeit tracken
    dem_available = [start_time] * dem_stations
    mon_available = [start_time] * mon_stations

    all_scheduled_ops: List[Dict[str, Any]] = []
    order_completions: Dict[str, float] = {}
    total_proc_time = 0.0

    # Slot-Utilizations tracken
    slot_busy_times: Dict[str, float] = defaultdict(float)

    # FIFO-Sequenz
    sequence = list(range(len(valid_orders)))
    variant_choices = [0] * len(valid_orders)

    for order in valid_orders:
        oid = order["orderId"]
        ops = order["operations"]

        order_end_time = start_time

        for op in ops:
            station_id = op.get("stationId", "MISC")
            duration = float(op.get("expectedDuration", 0.0))

            if duration <= 0:
                continue

            total_proc_time += duration

            # Station-Typ bestimmen
            is_dem = station_id.lower() in ["demontage", "dem", "disassembly"]
            is_mon = station_id.lower() in ["reassembly", "mon", "montage", "remontage"]

            # Maschine auswählen (früheste verfügbare)
            if is_dem:
                earliest_idx = min(range(dem_stations), key=lambda i: dem_available[i])
                op_start = dem_available[earliest_idx]
                op_end = op_start + duration
                dem_available[earliest_idx] = op_end
                slot_name = f"DEM-{earliest_idx + 1}"
            elif is_mon:
                earliest_idx = min(range(mon_stations), key=lambda i: mon_available[i])
                op_start = mon_available[earliest_idx]
                op_end = op_start + duration
                mon_available[earliest_idx] = op_end
                slot_name = f"MON-{earliest_idx + 1}"
            else:
                # Fallback: Demontage
                earliest_idx = min(range(dem_stations), key=lambda i: dem_available[i])
                op_start = dem_available[earliest_idx]
                op_end = op_start + duration
                dem_available[earliest_idx] = op_end
                slot_name = f"DEM-{earliest_idx + 1}"

            slot_busy_times[slot_name] += duration
            order_end_time = max(order_end_time, op_end)

            # Operation speichern
            scheduled_op = {
                "orderId": oid,
                "stationId": station_id,
                "slotId": slot_name,
                "startTime": op_start,
                "endTime": op_end,
                "expectedDuration": duration,
                "label": op.get("label", ""),
                "meta": op.get("meta", {})
            }
            all_scheduled_ops.append(scheduled_op)

        order_completions[oid] = order_end_time

    debug_stages.append({"stage": "sim_done", "scheduledOps": len(all_scheduled_ops)})

    # 4. Metriken berechnen
    if all_scheduled_ops:
        earliest_start = min(op["startTime"] for op in all_scheduled_ops)
        latest_end = max(op["endTime"] for op in all_scheduled_ops)
    else:
        earliest_start = start_time
        latest_end = start_time

    makespan = latest_end - earliest_start if latest_end > earliest_start else 0.0
    total_machines = dem_stations + mon_stations

    # Tardiness und Lateness
    tardiness_sum = 0.0
    lateness_sum = 0.0
    for order in valid_orders:
        oid = order["orderId"]
        due = order["dueDate"]
        completion = order_completions.get(oid, start_time)

        lateness = completion - due if due > 0 else 0.0
        lateness_sum += lateness
        tardiness_sum += max(0.0, lateness)

    avg_lateness = lateness_sum / len(valid_orders) if valid_orders else 0.0

    # Auslastung
    total_available = makespan * total_machines if makespan > 0 else 0.0
    avg_utilization = (total_proc_time / total_available) * 100.0 if total_available > 0 else 0.0
    idle_time = max(0.0, total_available - total_proc_time)

    # Slot-Utilizations
    slot_utilizations = {}
    for slot_name, busy_time in slot_busy_times.items():
        slot_util = (busy_time / makespan) * 100.0 if makespan > 0 else 0.0
        slot_utilizations[slot_name] = min(100.0, slot_util)

    debug_stages.append({
        "stage": "metrics_done",
        "makespan": makespan,
        "tardiness": tardiness_sum,
        "avgLateness": avg_lateness,
        "avgUtilization": avg_utilization,
        "idleTime": idle_time
    })

    # 5. Released Ops (erste releaseFraction nach StartTime)
    sorted_ops = sorted(all_scheduled_ops, key=lambda x: x["startTime"])
    release_count = max(1, int(len(sorted_ops) * release_fraction))
    released_ops = sorted_ops[:release_count]

    # Release List
    release_list = list(dict.fromkeys([op["orderId"] for op in released_ops]))

    # 6. ETA List
    eta_list = []
    for order in valid_orders:
        oid = order["orderId"]
        completion = order_completions.get(oid, start_time)
        eta_list.append({
            "orderId": oid,
            "eta": completion
        })

    # 7. Plan erstellen
    plan = {
        "id": "fifo-plan-1",
        "sequence": sequence,
        "variantChoices": variant_choices,
        "operations": all_scheduled_ops,
        "metrics": {
            "makespan": makespan,
            "tardiness": tardiness_sum,
            "avgLateness": avg_lateness,
            "avgUtilization": min(100.0, avg_utilization),
            "idleTime": idle_time,
            "setupTime": 0.0,
            "slotUtilizations": slot_utilizations
        },
        "objectiveValues": {
            "makespan": makespan,
            "tardiness": tardiness_sum,
            "avgLateness": avg_lateness,
            "avgUtilization": min(100.0, avg_utilization),
            "idleTime": idle_time,
            "setupTime": 0.0,
            "slotUtilizations": slot_utilizations
        }
    }

    # 8. Output zusammenstellen
    result = {
        "paretoSet": [plan],
        "selectedPlanId": "fifo-plan-1",
        "selectedVariantChoices": variant_choices,
        "releasedOps": released_ops,
        "releaseList": release_list,
        "etaList": eta_list,
        "debug": debug_stages
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
