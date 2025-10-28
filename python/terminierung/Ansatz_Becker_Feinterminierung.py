#!/usr/bin/env python3
"""
Ansatz_Becker_Feinterminierung
------------------------------

Feinterminierung nach MOAHS-inspirierter Heuristik.

Eingabe (stdin, JSON):
{
  "startTime": 1234.0,
  "orders": [
    {
      "orderId": "O1",
      "dueDate": 1560.0,
      "operations": [
        {"id": "op-1", "stationId": "dem", "expectedDuration": 35, "resources": [], "family": "F1"}
      ]
    }
  ],
  "config": {
    "weights": {"makespan": 0.4, "tardiness": 0.4, "idleTime": 0.2},
    "HMS": 30,
    "iterations": 200,
    "candidatesPerIter": 25,
    "maxPareto": 20,
    "releaseFraction": 0.5,
    "setupMatrix": {
      "stationA": {
        "familyX": {"familyY": 5}
      }
    }
  }
}

Ausgabe (stdout, JSON):
{
  "paretoSet": [...],
  "selectedPlanId": "...",
  "releasedOps": [...],
  "debug": [...]
}
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
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

# Matplotlib disabled for performance
HAS_MATPLOTLIB = False

# try:
#     import matplotlib.pyplot as plt  # type: ignore
#     HAS_MATPLOTLIB = True
# except Exception:  # pragma: no cover
#     HAS_MATPLOTLIB = False

# --------------------------------------------------------------------------- #
# Datentypen
# --------------------------------------------------------------------------- #


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


@dataclass
class Plan:
    plan_id: str
    sequence: List[int]
    operations: List[Dict[str, Any]]
    metrics: Dict[str, float]


# --------------------------------------------------------------------------- #
# Helper
# --------------------------------------------------------------------------- #


def _load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    if not text.strip():
        return {}
    return json.loads(text)


def _ensure_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _clone_operation(raw: Dict[str, Any], default_station: str) -> Operation:
    op_id = str(raw.get("id") or f"{default_station}-{random.randint(1, 9999)}")
    station = str(raw.get("stationId") or default_station)
    duration = float(raw.get("expectedDuration") or 0.0)
    if duration <= 0:
        duration = 30.0
    resources = _ensure_list(raw.get("resources"))
    family = raw.get("family")
    if family is not None:
        family = str(family)
    return Operation(
        id=op_id,
        station_id=station,
        duration=duration,
        resources=[str(r) for r in resources],
        family=family,
    )


def _build_orders(payload: Dict[str, Any]) -> Tuple[List[OrderData], float, Dict[str, Any]]:
    raw_orders = payload.get("orders") or []
    if not isinstance(raw_orders, list):
        raise ValueError("payload.orders muss eine Liste sein")

    start_time = float(payload.get("startTime") or 0.0)
    config = payload.get("config") or {}

    orders: List[OrderData] = []
    for idx, raw in enumerate(raw_orders):
        if not isinstance(raw, dict):
            continue
        order_id = str(raw.get("orderId") or f"order-{idx + 1}")
        due_date = raw.get("dueDate")
        if due_date is None:
            due_date = start_time + 8 * 60.0
        due_date = float(due_date)

        operations_raw = raw.get("operations") or []
        if not operations_raw:
            operations_raw = [
                {
                    "id": f"{order_id}-fallback",
                    "stationId": "station",
                    "expectedDuration": 45,
                }
            ]

        operations = [
            _clone_operation(op_raw, f"{order_id}-station")
            for op_raw in operations_raw
        ]

        orders.append(
            OrderData(
                order_id=order_id,
                due_date=due_date,
                operations=operations,
            )
        )

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
                    setup = setup_matrix.get(station, {}).get(prev_family, {}).get(
                        op.family or "", 0.0
                    ) or 0.0

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
                }
            )

        tardiness_sum += max(0.0, job_ready - order.due_date)

    idle_sum = 0.0
    for station, ints in intervals.items():
        ints = sorted(ints, key=lambda x: x[0])
        for i in range(1, len(ints)):
            prev_end = ints[i - 1][1]
            current_start = ints[i][0]
            idle_sum += max(0.0, current_start - prev_end)

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


def _non_dominated(plans: List[Plan]) -> List[Plan]:
    pareto: List[Plan] = []
    for plan in plans:
        dominated = False
        to_remove: List[Plan] = []
        for existing in pareto:
            if _dominates(existing.metrics, plan.metrics):
                dominated = True
                break
            if _dominates(plan.metrics, existing.metrics):
                to_remove.append(existing)
        if dominated:
            continue
        for rem in to_remove:
            pareto.remove(rem)
        pareto.append(plan)
    return pareto


def _score_plan(plan: Plan, weights: Dict[str, float]) -> float:
    return (
        plan.metrics["makespan"] * weights.get("makespan", 0.34)
        + plan.metrics["tardiness"] * weights.get("tardiness", 0.33)
        + plan.metrics["idleTime"] * weights.get("idleTime", 0.33)
    )


def _create_plot(debug_candidates: List[Plan], pareto: List[Plan]) -> Optional[Dict[str, Any]]:
    if not HAS_MATPLOTLIB:
        return None
    try:
        fig = plt.figure(figsize=(5.5, 4))
        ax = fig.add_subplot(111, projection="3d")  # type: ignore[attr-defined]
        ax.set_title("Feinterminierung – Lösungsraum")
        ax.set_xlabel("makespan")
        ax.set_ylabel("tardiness")
        ax.set_zlabel("idleTime")

        def scatter(plans: List[Plan], color: str, label: str) -> None:
            if not plans:
                return
            xs = [p.metrics["makespan"] for p in plans]
            ys = [p.metrics["tardiness"] for p in plans]
            zs = [p.metrics["idleTime"] for p in plans]
            ax.scatter(xs, ys, zs, c=color, label=label, depthshade=True, alpha=0.7)

        scatter(debug_candidates, "#9CA3AF", "Pool")
        scatter(pareto, "#EF4444", "Pareto")

        ax.legend(loc="upper left")
        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=130)
        plt.close(fig)
        return {
            "stage": "PIPO_MOAHS_PLOT",
            "media": {
                "type": "image/png",
                "encoding": "base64",
                "data": base64.b64encode(buf.getvalue()).decode("ascii"),
            },
        }
    except Exception as exc:  # pragma: no cover
        return {"stage": "PIPO_MOAHS_PLOT_ERROR", "error": str(exc)}


def _build_debug(
    orders: List[OrderData],
    config: Dict[str, Any],
    candidates: List[Plan],
    pareto: List[Plan],
    selected: Optional[Plan],
    release_ops: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    debug: List[Dict[str, Any]] = []

    debug.append(
        {
            "stage": "PIPO_INPUT",
            "orderCount": len(orders),
            "config": config,
        }
    )

    if candidates:
        best_makespan = min(p.metrics["makespan"] for p in candidates)
        best_tardiness = min(p.metrics["tardiness"] for p in candidates)
        best_idle = min(p.metrics["idleTime"] for p in candidates)
    else:
        best_makespan = best_tardiness = best_idle = None

    debug.append(
        {
            "stage": "PIPO_POOL_METRICS",
            "candidateCount": len(candidates),
            "bestMakespan": best_makespan,
            "bestTardiness": best_tardiness,
            "bestIdleTime": best_idle,
        }
    )

    debug.append(
        {
            "stage": "PIPO_PARETO",
            "paretoCount": len(pareto),
            "preview": [
                {
                    "id": plan.plan_id,
                    "metrics": plan.metrics,
                }
                for plan in pareto[:6]
            ],
        }
    )

    if selected:
        debug.append(
            {
                "stage": "PIPO_SELECTED_PLAN",
                "planId": selected.plan_id,
                "metrics": selected.metrics,
                "sequence": selected.sequence[:20],
            }
        )

    if release_ops:
        debug.append(
            {
                "stage": "PIPO_RELEASED_OPS",
                "count": len(release_ops),
                "preview": release_ops[:8],
            }
        )

    plot_entry = _create_plot(candidates, pareto)
    if plot_entry:
        debug.append(plot_entry)

    return debug


def _schedule(payload: Dict[str, Any]) -> Dict[str, Any]:
    orders, start_time, config = _build_orders(payload)

    if not orders:
        return {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "debug": [
                {
                    "stage": "PIPO_EMPTY",
                    "message": "Keine Aufträge für Feinterminierung vorhanden.",
                }
            ],
        }

    weights = config.get("weights") or {}
    setup_matrix = config.get("setupMatrix")
    rng = random.Random(int(config.get("seed") or 9211))

    # Kandidaten erzeugen (Heuristiken & zufällig)
    n = len(orders)
    permutations: List[List[int]] = []
    identity = list(range(n))
    permutations.append(identity)

    durations = [sum(op.duration for op in order.operations) for order in orders]
    due_dates = [order.due_date for order in orders]
    spt = sorted(identity, key=lambda idx: durations[idx])
    edd = sorted(identity, key=lambda idx: due_dates[idx])
    permutations.append(spt)
    permutations.append(edd)

    max_candidates = int(config.get("iterations") or 10)
    candidates_per_iter = int(config.get("candidatesPerIter") or 1)
    max_total = max_candidates * max(1, candidates_per_iter)
    max_total = min(max_total, 10)

    seen_sequences = {tuple(seq) for seq in permutations}

    # Calculate maximum possible unique sequences (n!)
    import math
    max_possible = math.factorial(n)
    actual_target = min(max_total, max_possible)

    # Add safety limit: max 1000 attempts to prevent infinite loop
    attempts = 0
    max_attempts = min(1000, max_possible * 10)

    while len(seen_sequences) < actual_target and attempts < max_attempts:
        seq = tuple(_random_permutation(n, rng))
        if seq not in seen_sequences:
            seen_sequences.add(seq)
        attempts += 1

    candidate_sequences = [list(seq) for seq in seen_sequences]

    plans: List[Plan] = []
    for idx, seq in enumerate(candidate_sequences):
        ops, metrics = _simulate_sequence(seq, orders, start_time, setup_matrix)
        plan_id = f"plan-{idx}"
        plans.append(
            Plan(
                plan_id=plan_id,
                sequence=seq,
                operations=ops,
                metrics=metrics,
            )
        )

    pareto = _non_dominated(plans)
    pareto_limit = int(config.get("maxPareto") or 20)
    pareto = pareto[:pareto_limit]

    selected = pareto[0] if pareto else None
    if selected and weights:
        selected = min(pareto, key=lambda p: _score_plan(p, weights))

    release_fraction = float(config.get("releaseFraction") or 0.5)
    release_fraction = min(max(release_fraction, 0.0), 1.0)
    released_ops: List[Dict[str, Any]] = []
    if selected:
        sorted_ops = sorted(selected.operations, key=lambda o: o["startTime"])
        count = max(1, int(len(sorted_ops) * release_fraction))
        released_ops = sorted_ops[:count]

    debug = _build_debug(orders, config, plans, pareto, selected, released_ops)

    return {
        "paretoSet": [
            {
                "id": plan.plan_id,
                "sequence": plan.sequence,
                "operations": plan.operations,
                "objectiveValues": plan.metrics,
            }
            for plan in pareto
        ],
        "selectedPlanId": selected.plan_id if selected else None,
        "releasedOps": released_ops,
        "debug": debug,
    }


def main() -> None:
    try:
        payload = _load_payload()
        result = _schedule(payload)
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover
        error_result = {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "debug": [
                {"stage": "PIPO_ERROR", "message": str(exc)},
            ],
        }
        print(json.dumps(error_result))


if __name__ == "__main__":
    main()
