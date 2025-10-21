#!/usr/bin/env python3
"""
Simple PAP (Pre-Acceptance Planning) heuristic.

Input JSON (stdin):
{
  "now": 1234567890,                       # current simulation timestamp (minutes)
  "orders": [{
      "orderId": "O1",
      "createdAt": 1234567800,
      "dueDate": 1234569000,
      "processTimeDem": 60,
      "processTimeMon": 80,
      "priorityHint": 0.5
  }],
  "config": {
      "qMin": 3,
      "qMax": 7,
      "intervalMinutes": 60
  }
}

Output JSON (stdout):
{
  "batches": [{
      "id": "pap-batch-1",
      "orderIds": ["O1", "O2"],
      "releaseAt": 1234568400,
      "score": 0.85
  }],
  "etaList": [{
      "orderId": "O1",
      "eta": 1234569400,
      "lower": 1234569300,
      "upper": 1234569600,
      "confidence": 0.7
  }]
}
"""

import json
import math
import sys
from typing import Dict, List, Any


def load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    if not text:
        return {"orders": [], "config": {}}
    return json.loads(text)


def poisson_eta(now: float, lam: float, idx: int) -> float:
    """Very small helper to approximate the ETA using inter-arrival expectation."""
    if lam <= 0:
        lam = 1.0
    # expected inter-arrival time = 60 / lam (lam = returns per hour)
    mean_interarrival = 60.0 / lam
    return now + (idx + 1) * mean_interarrival


def build_batches(orders: List[Dict[str, Any]], config: Dict[str, Any], now: float) -> List[Dict[str, Any]]:
    q_min = int(config.get("qMin", 3))
    q_max = max(q_min, int(config.get("qMax", 7)))
    lam = float(config.get("lambda", 4.0))

    batches = []
    current_batch: List[str] = []
    batch_idx = 1

    for idx, order in enumerate(orders):
        current_batch.append(order["orderId"])
        if len(current_batch) >= q_max:
            batches.append({
                "id": f"pap-batch-{batch_idx}",
                "orderIds": current_batch,
                "releaseAt": poisson_eta(now, lam, batch_idx),
                "score": 1.0 / batch_idx
            })
            current_batch = []
            batch_idx += 1

    if current_batch and len(current_batch) >= q_min:
        batches.append({
            "id": f"pap-batch-{batch_idx}",
            "orderIds": current_batch,
            "releaseAt": poisson_eta(now, lam, batch_idx),
            "score": 1.0 / batch_idx
        })

    return batches


def build_eta_list(orders: List[Dict[str, Any]], now: float, lam: float) -> List[Dict[str, Any]]:
    eta_list = []
    for idx, order in enumerate(orders):
        base_eta = poisson_eta(now, lam, idx)
        process_time = float(order.get("processTimeDem", 60)) + float(order.get("processTimeMon", 90))
        eta = base_eta + process_time
        eta_list.append({
            "orderId": order["orderId"],
            "eta": eta,
            "lower": eta - process_time * 0.1,
            "upper": eta + process_time * 0.1,
            "confidence": 0.6
        })
    return eta_list


def main():
    payload = load_payload()
    orders = payload.get("orders", [])
    config = payload.get("config", {})
    now = float(payload.get("now", 0))

    debug_log: List[Dict[str, Any]] = []

    debug_log.append({
        "stage": "PAP_INPUT",
        "order_count": len(orders),
        "lambda": config.get("lambda", 4.0),
        "qMin": config.get("qMin", 3),
        "qMax": config.get("qMax", 7),
    })

    enriched_orders: List[Dict[str, Any]] = []
    for order in orders:
        process_dem = float(order.get("processTimeDem", 60))
        process_mon = float(order.get("processTimeMon", 90))
        total_process = max(process_dem + process_mon, 1.0)

        due_date = order.get("dueDate")
        if due_date is None or not isinstance(due_date, (int, float)):
            # fallback: assume 30 simulated days horizon
            due_date = now + 60.0 * 24.0 * 30.0

        slack = due_date - now - total_process
        priority_hint = order.get("priorityHint")
        if isinstance(priority_hint, (int, float)):
            priority_score = float(priority_hint)
        else:
            priority_score = slack / total_process

        enriched_orders.append({
            **order,
            "processTimeDem": process_dem,
            "processTimeMon": process_mon,
            "processTimeTotal": total_process,
            "dueDate": due_date,
            "slack": slack,
            "priorityScore": priority_score,
        })

    debug_log.append({
        "stage": "PAP_PRIORITY",
        "order_count": len(enriched_orders),
        "preview": [
            {
                "orderId": o.get("orderId"),
                "priorityScore": round(o.get("priorityScore", 0.0), 3),
                "slack": round(o.get("slack", 0.0), 1),
                "dueDate": o.get("dueDate"),
            }
            for o in sorted(enriched_orders, key=lambda o: o.get("priorityScore", 0.0))[:8]
        ],
    })

    orders_sorted = sorted(
        enriched_orders,
        key=lambda o: (
            o.get("priorityScore", 0.0),
            o.get("dueDate", math.inf),
            o.get("createdAt", now),
        ),
    )

    lam = float(config.get("lambda", 4.0))
    batches = build_batches(orders_sorted, config, now)
    debug_log.append({
        "stage": "PAP_BATCH",
        "batch_count": len(batches),
        "batches": [
            {
                "id": batch.get("id"),
                "size": len(batch.get("orderIds", [])),
                "releaseAt": batch.get("releaseAt")
            }
            for batch in batches[:6]
        ],
    })
    eta_list = build_eta_list(orders_sorted, now, lam)
    eta_map = {eta.get("orderId"): eta for eta in eta_list if eta.get("orderId")}
    debug_log.append({
        "stage": "PAP_ETA",
        "eta_count": len(eta_list),
        "eta_preview": [
            {
                "orderId": eta.get("orderId"),
                "eta": eta.get("eta"),
                "lower": eta.get("lower"),
                "upper": eta.get("upper"),
            }
            for eta in eta_list[:6]
        ],
    })
    debug_log.append({
        "stage": "PAP_ASSIGNMENTS",
        "sequenceSize": len(orders_sorted),
        "sequence": [
            {
                "orderId": order.get("orderId"),
                "eta": eta_map.get(order.get("orderId"), {}).get("eta"),
                "priorityScore": order.get("priorityScore"),
            }
            for order in orders_sorted[:20]
        ],
    })

    result = {
        "batches": batches,
        "etaList": eta_list,
        "debug": debug_log,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
