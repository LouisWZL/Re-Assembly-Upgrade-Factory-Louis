#!/usr/bin/env python3
"""
Simplified Post-Inspection Fine Scheduling (MOAHS-inspired heuristic).

The script constructs a small set of candidate plans (Pareto set) using
combinations of sequencing heuristics (SPT, LPT, Earliest Due Date) and
selects one plan via a weighted sum of the objectives.
"""

import json
import math
import sys
from typing import Any, Dict, List


def load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    if not text:
        return {"orders": [], "config": {}}
    return json.loads(text)


def compute_plan_metrics(sequence: List[Dict[str, Any]]) -> Dict[str, float]:
    time_cursor = 0.0
    tardiness_sum = 0.0
    idle_time = 0.0
    setup_penalty = 0.0

    last_station = None

    for order in sequence:
        operations = order.get("operations", [])
        due = order.get("dueDate", time_cursor + 480)
        for op in operations:
            duration = op.get("expectedDuration", 30)
            time_cursor += duration
            if last_station and op.get("stationId") != last_station:
                setup_penalty += 5.0
            last_station = op.get("stationId")
        tardiness_sum += max(time_cursor - due, 0)

    makespan = time_cursor
    return {
        "makespan": makespan,
        "tardiness": tardiness_sum,
        "idleTime": idle_time,
        "setupPenalty": setup_penalty
    }


def build_operation_blocks(sequence: List[Dict[str, Any]], start_time: float) -> List[Dict[str, Any]]:
    cursor = start_time
    blocks = []
    for order in sequence:
        for op in order.get("operations", []):
            duration = op.get("expectedDuration", 30)
            block = {
                "id": op.get("id") or f"{order['orderId']}-{op.get('stationId', 'op')}",
                "stationId": op.get("stationId", "station"),
                "orderId": order["orderId"],
                "expectedDuration": duration,
                "startTime": cursor,
                "endTime": cursor + duration,
                "resources": op.get("resources", [])
            }
            blocks.append(block)
            cursor += duration
    return blocks


def build_sequences(orders: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    sequences = {
        "spt": sorted(orders, key=lambda o: sum(op.get("expectedDuration", 30) for op in o.get("operations", []))),
        "lpt": sorted(orders, key=lambda o: -sum(op.get("expectedDuration", 30) for op in o.get("operations", []))),
        "edd": sorted(orders, key=lambda o: o.get("dueDate", math.inf)),
    }
    return sequences


def main():
    payload = load_payload()
    orders = payload.get("orders", [])
    config = payload.get("config", {})
    start_time = float(payload.get("startTime", 0))

    weights = config.get("weights", {"makespan": 0.4, "tardiness": 0.4, "setupPenalty": 0.2})

    debug_log: List[Dict[str, Any]] = []
    debug_log.append({
        "stage": "PIPO_INPUT",
        "order_count": len(orders),
        "weights": weights,
    })

    if not orders:
        result = {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "debug": debug_log + [{"stage": "PIPO_EMPTY", "message": "No orders provided"}],
        }
        print(json.dumps(result))
        return

    sequences = build_sequences(orders)
    pareto_set = []

    for key, seq in sequences.items():
        metrics = compute_plan_metrics(seq)
        debug_log.append({
            "stage": "PIPO_SEQUENCE",
            "variant": key,
            "order_count": len(seq),
            "metrics": {
                "makespan": metrics.get("makespan"),
                "tardiness": metrics.get("tardiness"),
                "setupPenalty": metrics.get("setupPenalty"),
            },
        })
        pareto_set.append({
            "id": f"plan-{key}",
            "objectiveValues": metrics,
            "operations": build_operation_blocks(seq, start_time)
        })

    if not pareto_set:
        result = {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "debug": debug_log + [{"stage": "PIPO_NO_PARETO", "message": "No candidate plans generated"}],
        }
        print(json.dumps(result))
        return

    best_plan = min(
        pareto_set,
        key=lambda plan: sum(
            plan["objectiveValues"].get(obj, 0) * weights.get(obj, 0.0)
            for obj in weights.keys()
        ),
    )

    debug_log.append({
        "stage": "PIPO_SELECTION",
        "selectedPlanId": best_plan["id"],
        "objectiveValues": best_plan["objectiveValues"],
    })

    released_ops = best_plan["operations"][: max(1, len(best_plan["operations"]) // 2)]

    debug_log.append({
        "stage": "PIPO_RELEASE",
        "released_count": len(released_ops),
        "preview": [
            {
                "id": op.get("id"),
                "stationId": op.get("stationId"),
                "duration": op.get("expectedDuration"),
            }
            for op in released_ops[:8]
        ],
    })

    result = {
        "paretoSet": pareto_set,
        "selectedPlanId": best_plan["id"],
        "releasedOps": released_ops,
        "debug": debug_log,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
