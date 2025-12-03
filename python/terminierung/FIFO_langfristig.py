#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIFO Baseline – Langfristige Terminierung (PAP)
Minimaler kompatibler Output zu Becker_Terminierung_langfristig_v2.py
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

    # 2. Orders filtern (nur mit orderId)
    valid_orders = []
    for o in orders:
        if o.get("orderId"):
            valid_orders.append(o)

    debug_stages.append({"stage": "orders_filtered", "validCount": len(valid_orders)})

    # 3. FIFO-Reihenfolge beibehalten, ein einziges Batch bilden
    order_ids = [o["orderId"] for o in valid_orders]

    # Prozesszeiten berechnen
    process_times = {}
    for o in valid_orders:
        oid = o["orderId"]
        dem_time = float(o.get("processTimeDem", 0.0))
        mon_time = float(o.get("processTimeMon", 0.0))
        process_times[oid] = dem_time + mon_time

    # Batch erstellen
    batches = []
    if order_ids:
        batch = {
            "orderIds": order_ids,
            "releaseAt": now,
            "windowStart": now,
            "windowEnd": now,
            "jaccardMatrix": [],  # Leere Matrix für FIFO
            "batchId": "fifo-batch-1"
        }
        batches.append(batch)

    debug_stages.append({"stage": "batch_built", "batchCount": len(batches), "orderCount": len(order_ids)})

    # 4. ETA berechnen (einfache sequenzielle Schätzung)
    eta_list = []
    cumulative_time = now

    for oid in order_ids:
        proc_time = process_times.get(oid, 0.0)
        # Einfache Schätzung: sequenziell pro Order
        eta = cumulative_time + proc_time / max(1, total_machines)
        cumulative_time = eta

        # Puffer: ±10%
        buffer = max(10.0, eta * 0.1)

        eta_list.append({
            "orderId": oid,
            "eta": eta,
            "lower": eta - buffer,
            "upper": eta + buffer,
            "confidence": 0.5
        })

    debug_stages.append({"stage": "eta_built", "etaCount": len(eta_list)})

    # 5. Utilization Forecast (trivial)
    utilization_forecast = []
    if order_ids:
        total_proc_time = sum(process_times.values())
        makespan = cumulative_time - now if cumulative_time > now else 1.0
        utilization = (total_proc_time / (makespan * total_machines)) * 100.0 if makespan > 0 else 0.0

        utilization_forecast.append({
            "bucketStart": now,
            "bucketEnd": cumulative_time,
            "utilization": min(100.0, utilization)
        })

    # 6. Output zusammenstellen
    result = {
        "batches": batches,
        "etaList": eta_list,
        "utilizationForecast": utilization_forecast,
        "ctpPreview": [],
        "deferredOrders": [],
        "debug": debug_stages
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
