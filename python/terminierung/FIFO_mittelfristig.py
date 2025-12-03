#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIFO Baseline – Mittelfristige Terminierung (PIP)
Minimaler kompatibler Output zu Becker_Mittelfristige_Terminierung_v2.py
Keine Optimierung, nur FIFO-Reihenfolge.
"""

import json
import sys
from typing import Dict, List, Any

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
    now = float(payload.get("now", 0.0))
    config = payload.get("config", {})

    # Maschinen aus Config (falls vorhanden)
    factory_capacity = config.get("factoryCapacity", {})
    dem_stations = factory_capacity.get("demontageStationen", 5)
    mon_stations = factory_capacity.get("montageStationen", 10)
    total_machines = dem_stations + mon_stations

    # 2. Orders verarbeiten (FIFO-Reihenfolge)
    valid_orders = []
    skipped_orders = []

    for idx, o in enumerate(orders):
        oid = o.get("orderId")
        if not oid:
            skipped_orders.append({"index": idx, "reason": "missing orderId"})
            continue

        # Operations extrahieren
        operations = o.get("operations", [])
        dem_ops = o.get("demOps", [])
        mon_ops = o.get("monOps", [])

        # Kombinierte Operations
        all_ops = operations if operations else (dem_ops + mon_ops)

        valid_orders.append({
            "index": idx,
            "orderId": oid,
            "dueDate": float(o.get("dueDate", 0.0)),
            "operations": all_ops,
            "processSequences": o.get("processSequences")
        })

    debug_stages.append({
        "stage": "orders_parsed",
        "validCount": len(valid_orders),
        "skippedCount": len(skipped_orders),
        "skipped": skipped_orders[:5]  # Nur erste 5 für Debug
    })

    # 3. FIFO-Simulation: sequenzielle Abarbeitung
    sequence = list(range(len(valid_orders)))
    current_time = now
    completions = []
    total_proc_time = 0.0

    for order in valid_orders:
        # Gesamtdauer der Operations
        duration = sum(float(op.get("expectedDuration", 0.0)) for op in order["operations"])
        total_proc_time += duration

        # Einfache Schätzung: parallelisiert über alle Maschinen
        order_time = duration / max(1, total_machines)
        completion = current_time + order_time
        current_time = completion

        lateness = completion - order["dueDate"] if order["dueDate"] > 0 else 0.0

        completions.append({
            "orderId": order["orderId"],
            "completion": completion,
            "lateness": lateness,
            "tardiness": max(0.0, lateness)
        })

    debug_stages.append({"stage": "sim_done", "orderCount": len(completions)})

    # 4. Metriken berechnen
    makespan = current_time - now if current_time > now else 0.0
    total_tardiness = sum(c["tardiness"] for c in completions)
    avg_lateness = sum(c["lateness"] for c in completions) / len(completions) if completions else 0.0
    avg_utilization = (total_proc_time / (makespan * total_machines)) * 100.0 if makespan > 0 else 0.0

    debug_stages.append({
        "stage": "metrics_done",
        "makespan": makespan,
        "totalTardiness": total_tardiness,
        "avgLateness": avg_lateness,
        "avgUtilization": avg_utilization
    })

    # 5. Plan erstellen
    plan = {
        "id": "fifo-plan-1",
        "sequence": sequence,
        "metrics": {
            "makespan": makespan,
            "tardiness": total_tardiness,
            "avgLateness": avg_lateness,
            "avgUtilization": min(100.0, avg_utilization),
            "idleTime": max(0.0, (makespan * total_machines) - total_proc_time)
        },
        "completions": completions
    }

    # 6. Output zusammenstellen
    result = {
        "plans": [plan],
        "selectedPlanId": "fifo-plan-1",
        "barchart": None,  # Kein Chart für FIFO-Baseline
        "debug": debug_stages
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
