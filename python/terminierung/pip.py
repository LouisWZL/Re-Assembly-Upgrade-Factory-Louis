#!/usr/bin/env python3
"""
Simplified Pre-Inspection Planning (PIP) operator.

Heuristics:
- Priorities: Weighted mix of due-date urgency and simple size proxy.
- Routes: choose first candidate or fall back to default dem/montage ops.
- Batches: cluster by product group (if provided) and respect (Q,T) policy.
- Release list: sorted by priority then due date.
"""

import json
import math
import sys
from collections import defaultdict
from typing import Any, Dict, List


def load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    if not text:
        return {"orders": [], "config": {}}
    return json.loads(text)


def compute_priority(order: Dict[str, Any], now: float, tardiness_weight: float, variance_weight: float) -> float:
    due = order.get("dueDate", now + 60 * 24 * 7)
    slack = max(due - now, 1.0)
    size_factor = len(order.get("demOps", [])) + len(order.get("monOps", [])) + 1
    base_priority = tardiness_weight / slack + variance_weight * size_factor
    return base_priority


def choose_route(order: Dict[str, Any], now: float) -> Dict[str, Any]:
    route_candidates = order.get("routeCandidates") or []
    if route_candidates:
        route = route_candidates[0]
    else:
        dem_ops = order.get("demOps") or []
        mon_ops = order.get("monOps") or []
        route = {
            "id": f"default-route-{order['orderId']}",
            "operations": dem_ops + mon_ops
        }
    start = max(order.get("readyAt", now), now)
    duration = sum(op.get("expectedDuration", 30) for op in route.get("operations", []))
    return {
        "orderId": order["orderId"],
        "routeId": route.get("id", f"route-{order['orderId']}"),
        "operations": route.get("operations", []),
        "expectedStart": start,
        "expectedEnd": start + duration
    }


def cluster_batches(orders: List[Dict[str, Any]], config: Dict[str, Any], now: float) -> List[Dict[str, Any]]:
    q_min = int(config.get("qMin", 3))
    q_max = max(q_min, int(config.get("qMax", 6)))
    horizon = float(config.get("horizonMinutes", 240.0))

    groups = defaultdict(list)
    for order in orders:
        key = order.get("productGroup") or order.get("productVariant") or "default"
        groups[key].append(order)

    batches = []
    for key, group_orders in groups.items():
        group_orders.sort(key=lambda o: o.get("priority", 0), reverse=True)
        chunk: List[str] = []
        batch_idx = 0
        for order in group_orders:
            chunk.append(order["orderId"])
            if len(chunk) >= q_max:
                batches.append({
                    "id": f"pip-batch-{key}-{batch_idx}",
                    "orderIds": chunk,
                    "releaseAt": now + horizon * (batch_idx + 1) / 4,
                    "score": sum(o.get("priority", 1) for o in group_orders) / len(group_orders)
                })
                batch_idx += 1
                chunk = []

        if len(chunk) >= q_min:
            batches.append({
                "id": f"pip-batch-{key}-{batch_idx}",
                "orderIds": chunk,
                "releaseAt": now + horizon * (batch_idx + 1) / 4,
                "score": sum(
                    o.get("priority", 1) for o in group_orders[: len(chunk)]
                )
            })

    return batches


def main():
    payload = load_payload()
    orders = payload.get("orders", [])
    config = payload.get("config", {})
    now = float(payload.get("now", 0))

    debug_log: List[Dict[str, Any]] = []

    tardiness_weight = float(config.get("tardinessWeight", 1.0))
    variance_weight = float(config.get("varianceWeight", 0.1))

    debug_log.append({
        "stage": "PIP_INPUT",
        "order_count": len(orders),
        "tardinessWeight": tardiness_weight,
        "varianceWeight": variance_weight,
        "qMin": config.get("qMin", 3),
        "qMax": config.get("qMax", 6),
    })

    enriched_orders: List[Dict[str, Any]] = []
    for order in orders:
        priority = compute_priority(order, now, tardiness_weight, variance_weight)
        enriched = dict(order)
        enriched["priority"] = priority
        enriched_orders.append(enriched)

    priorities = [
        {
            "orderId": order["orderId"],
            "priority": order["priority"],
            "dueDate": order.get("dueDate"),
            "expectedCompletion": order.get("dueDate") or (now + 60 * 8)
        }
        for order in enriched_orders
    ]
    debug_log.append({
        "stage": "PIP_PRIORITIES",
        "count": len(priorities),
        "preview": [
            {
                "orderId": p["orderId"],
                "priority": round(p["priority"], 3),
                "dueDate": p.get("dueDate"),
            }
            for p in priorities[:8]
        ],
    })

    routes = [choose_route(order, now) for order in enriched_orders]
    batches = cluster_batches(enriched_orders, config, now)
    debug_log.append({
        "stage": "PIP_BATCH",
        "count": len(batches),
        "preview": [
            {
                "id": batch.get("id"),
                "size": len(batch.get("orderIds", [])),
                "releaseAt": batch.get("releaseAt"),
                "score": batch.get("score"),
            }
            for batch in batches[:6]
        ],
    })

    release_list = [
        entry["orderId"]
        for entry in sorted(priorities, key=lambda x: (-x["priority"], x.get("dueDate", math.inf)))
    ]
    debug_log.append({
        "stage": "PIP_RELEASE",
        "release_count": len(release_list),
        "preview": release_list[:12],
    })

    result = {
        "priorities": priorities,
        "routes": routes,
        "batches": batches,
        "releaseList": release_list,
        "debug": debug_log,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
