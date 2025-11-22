#!/usr/bin/env python3
"""
Ansatz_Becker_Feinterminierung_v2
---------------------------------

Feinterminierung nach MOAHS (Liu et al. 2020) mit vollständiger Queue-Monitor-Kompatibilität.
"""

from __future__ import annotations

import json
import math
import random
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

HAS_MATPLOTLIB = False


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
    rank: int = 0
    crowding: float = 0.0


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
    resources = [str(r) for r in _ensure_list(raw.get("resources"))]
    family = raw.get("family")
    if family is not None:
        family = str(family)
    return Operation(op_id, station, duration, resources, family)


def _build_orders(payload: Dict[str, Any]) -> Tuple[List[OrderData], float, Dict[str, Any]]:
    raw_orders = payload.get("orders") or []
    if not isinstance(raw_orders, list):
        raise ValueError("orders must be a list")
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
                {"id": f"{order_id}-fallback", "stationId": "station", "expectedDuration": 45}
            ]
        operations = [_clone_operation(op_raw, f"{order_id}-station") for op_raw in operations_raw]
        orders.append(OrderData(order_id, due_date, operations))
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
    hmcr = hmcr_min + (hmcr_max - hmcr_min) * similarity
    par = par_min + (par_max - par_min) * similarity
    return hmcr, par


def _generate_new_sequence(hm: List[Plan], rng: random.Random, hmcr: float, par: float) -> List[int]:
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

    if n > 1 and rng.random() < par:
        i, j = rng.sample(range(n), 2)
        new_seq[i], new_seq[j] = new_seq[j], new_seq[i]

    return [int(x) for x in new_seq if x is not None]


def _score_plan(plan: Plan, weights: Dict[str, float]) -> float:
    return (
        plan.metrics["makespan"] * weights.get("makespan", 0.34)
        + plan.metrics["tardiness"] * weights.get("tardiness", 0.33)
        + plan.metrics["idleTime"] * weights.get("idleTime", 0.33)
    )


def _build_debug(
    orders: List[OrderData],
    config: Dict[str, Any],
    hm: List[Plan],
    pareto: List[Plan],
    selected: Optional[Plan],
    released: List[Dict[str, Any]],
    iterations: int,
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
    return debug


def _schedule(payload: Dict[str, Any]) -> Dict[str, Any]:
    orders, start_time, config = _build_orders(payload)
    if not orders:
        return {
            "paretoSet": [],
            "selectedPlanId": None,
            "releasedOps": [],
            "debug": [{"stage": "PIPO_EMPTY", "message": "Keine Aufträge vorhanden."}],
        }

    rng = random.Random(int(config.get("seed") or 9211))
    setup_matrix = config.get("setupMatrix")
    weights = config.get("weights") or {}

    if len(orders) == 1:
        seq = [0]
        ops, metrics = _simulate_sequence(seq, orders, start_time, setup_matrix)
        plan = Plan("plan-0", seq, ops, metrics)
        release_fraction = min(max(float(config.get("releaseFraction") or 0.5), 0.0), 1.0)
        sorted_ops = sorted(plan.operations, key=lambda o: o["startTime"])
        count = max(1, int(len(sorted_ops) * release_fraction))
        released_ops = sorted_ops[:count]
        debug = _build_debug(orders, config, [plan], [plan], plan, released_ops, 0)
        return {
            "paretoSet": [{"id": plan.plan_id, "sequence": plan.sequence, "operations": plan.operations, "objectiveValues": plan.metrics}],
            "selectedPlanId": plan.plan_id,
            "releasedOps": released_ops,
            "debug": debug,
        }

    HMS = int(config.get("HMS") or 30)
    iterations = int(config.get("iterations") or 200)
    candidates_per_iter = int(config.get("candidatesPerIter") or 25)
    max_pareto = int(config.get("maxPareto") or 20)
    release_fraction = min(max(float(config.get("releaseFraction") or 0.5), 0.0), 1.0)
    hmcr_min = float(config.get("HMCRmin") or 0.7)
    hmcr_max = float(config.get("HMCRmax") or 0.95)
    par_min = float(config.get("PARmin") or 0.2)
    par_max = float(config.get("PARmax") or 0.5)

    n = len(orders)
    plan_counter = 0
    seq_candidates: List[List[int]] = []
    identity = list(range(n))
    seq_candidates.append(identity)
    durations = [sum(op.duration for op in order.operations) for order in orders]
    due_dates = [order.due_date for order in orders]
    spt = sorted(identity, key=lambda idx: durations[idx])
    edd = sorted(identity, key=lambda idx: due_dates[idx])
    for seq in (spt, edd):
        if seq not in seq_candidates:
            seq_candidates.append(seq)
    seen = {tuple(seq) for seq in seq_candidates}
    target = min(HMS, math.factorial(n))
    while len(seen) < target:
        seq = tuple(_random_permutation(n, rng))
        if seq not in seen:
            seen.add(seq)
            seq_candidates.append(list(seq))
    harmony_memory: List[Plan] = []
    for seq in seq_candidates[:HMS]:
        ops, metrics = _simulate_sequence(seq, orders, start_time, setup_matrix)
        plan_id = f"plan-{plan_counter}"
        plan_counter += 1
        harmony_memory.append(Plan(plan_id, list(seq), ops, metrics))

    for it in range(iterations):
        similarity = _estimate_similarity(harmony_memory)
        hmcr, par = _adaptive_hmcr_par(similarity, hmcr_min, hmcr_max, par_min, par_max)
        new_plans: List[Plan] = []
        for _ in range(candidates_per_iter):
            new_seq = _generate_new_sequence(harmony_memory, rng, hmcr, par)
            ops, metrics = _simulate_sequence(new_seq, orders, start_time, setup_matrix)
            plan_id = f"plan-{plan_counter}"
            plan_counter += 1
            new_plans.append(Plan(plan_id, new_seq, ops, metrics))
        harmony_memory = _select_harmony_memory(harmony_memory + new_plans, HMS)

    fronts = _fast_non_dominated_sort(harmony_memory)
    pareto_front = fronts[0] if fronts else []
    pareto_front = pareto_front[:max_pareto]
    selected = pareto_front[0] if pareto_front else (harmony_memory[0] if harmony_memory else None)
    if selected and weights:
        selected = min(pareto_front, key=lambda p: _score_plan(p, weights))

    released_ops: List[Dict[str, Any]] = []
    if selected:
        sorted_ops = sorted(selected.operations, key=lambda o: o["startTime"])
        count = max(1, int(len(sorted_ops) * release_fraction))
        released_ops = sorted_ops[:count]

    debug = _build_debug(orders, config, harmony_memory, pareto_front, selected, released_ops, iterations)

    return {
        "paretoSet": [
            {
                "id": plan.plan_id,
                "sequence": plan.sequence,
                "operations": plan.operations,
                "objectiveValues": plan.metrics,
            }
            for plan in pareto_front
        ],
        "selectedPlanId": selected.plan_id if selected else None,
        "releasedOps": released_ops,
        "debug": debug,
    }


def main() -> None:
    payload = _load_payload()
    result = _schedule(payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

