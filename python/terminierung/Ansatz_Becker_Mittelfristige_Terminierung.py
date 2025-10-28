#!/usr/bin/env python3
"""
Ansatz_Becker_Mittelfristige_Terminierung
-----------------------------------------

Strategischer Mittelfrist-Planer (Pre-Inspection) mit genetischer Optimierung.

* Input  (stdin, JSON):
    {
      "now": <float, aktuelle Simulationsminute>,
      "orders": [
        {
          "orderId": "O-1",
          "dueDate": <float | null>,
          "readyAt": <float | null>,
          "demOps": [{ "expectedDuration": 35, ... }],
          "monOps": [{ "expectedDuration": 40, ... }],
          "routeCandidates": [...]
        },
        ...
      ],
      "config": {
        "qMin": 3,
        "qMax": 6,
        "horizonMinutes": 240,
        "tardinessWeight": 1.0,
        "varianceWeight": 0.1,
        "ga": {
          "population": 60,
          "generations": 80,
          "mutationRate": 0.25,
          "elite": 3,
          "replications": 30,
          "seed": 42
        }
      }
    }

* Output (stdout, JSON):
    {
      "priorities": [...],
      "routes": [...],
      "batches": [...],
      "releaseList": [...],
      "debug": [...]
    }

Die Struktur ist kompatibel mit den bestehenden Terminierungs-Pipelines.
Plots werden – sofern matplotlib verfügbar ist – als Base64-PNG im Debug-Array
zur Verfügung gestellt (Queue-Monitor „Ausgabe-Monitor“).
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

try:  # matplotlib ist optional; falls nicht installiert, funktionieren Kernfeatures dennoch.
    import matplotlib.pyplot as plt  # type: ignore

    HAS_MATPLOTLIB = True
except Exception:  # pragma: no cover - best effort
    HAS_MATPLOTLIB = False


# ---------------------------------------------------------------------------
# Utility-Datentypen
# ---------------------------------------------------------------------------


@dataclass
class OrderData:
    order_id: str
    due_date: Optional[float]
    ready_at: float
    duration_tfn: Tuple[float, float, float]
    combined_ops: List[Dict[str, Any]]
    raw: Dict[str, Any]


# ---------------------------------------------------------------------------
# Allgemeine Helper
# ---------------------------------------------------------------------------


def load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    if not text.strip():
        return {}
    return json.loads(text)


def normalize_minutes(value: Any, fallback: float) -> float:
    """
    Konvertiert Zeitstempel auf Minutenauflösung. Unterstützt:
    - None -> fallback
    - Minuten (float / int)
    - Millisekunden (float / int, > 10^10)
    """
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
    """
    Erzeugt eine Triangular Fuzzy Number (TFN) um die erwartete Dauer.
    Variation default ~25 % auf beiden Seiten.
    """
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


# ---------------------------------------------------------------------------
# GA-Komponenten
# ---------------------------------------------------------------------------


def simulate_sequence_tardiness(
    sequence: Sequence[int],
    orders: Sequence[OrderData],
    replications: int,
    base_seed: int,
) -> Tuple[float, float]:
    """
    Simuliert Tardiness für eine Sequenz mit Monte-Carlo Sampling.
    """
    totals: List[float] = []
    for r in range(replications):
        rng = random.Random(base_seed + r * 9973)
        current_time = min((orders[idx].ready_at for idx in sequence), default=0.0)
        total_tardiness = 0.0
        for idx in sequence:
            order = orders[idx]
            current_time = max(current_time, order.ready_at)
            current_time += random_triangular(rng, order.duration_tfn)
            if order.due_date is not None:
                total_tardiness += max(0.0, current_time - order.due_date)
        totals.append(total_tardiness)

    if not totals:
        return 0.0, 0.0
    mean_val = statistics.fmean(totals)
    var_val = statistics.pvariance(totals) if len(totals) > 1 else 0.0
    return mean_val, var_val


def order_crossover(parent_a: Sequence[int], parent_b: Sequence[int], rng: random.Random) -> List[int]:
    """OX-Crossover."""
    n = len(parent_a)
    if n <= 2:
        return list(parent_a)
    i, j = sorted(rng.sample(range(n), 2))
    child: List[Optional[int]] = [None] * n
    child[i:j] = parent_a[i:j]
    fill = [g for g in parent_b if g not in child[i:j]]
    pointer = 0
    for idx in range(n):
        if child[idx] is None:
            child[idx] = fill[pointer]
            pointer += 1
    return [int(x) for x in child]  # type: ignore[arg-type]


def mutate_swap(sequence: List[int], rng: random.Random, rate: float) -> None:
    if rng.random() < rate and len(sequence) >= 2:
        i, j = rng.sample(range(len(sequence)), 2)
        sequence[i], sequence[j] = sequence[j], sequence[i]


def tournament_select(population: Sequence[List[int]], fitness: Sequence[float], rng: random.Random, k: int = 3) -> List[int]:
    selected = rng.sample(range(len(population)), k)
    best_idx = min(selected, key=lambda idx: fitness[idx])
    return population[best_idx][:]


def optimize_sequence_ga(
    orders: Sequence[OrderData],
    lam: float,
    pop_size: int,
    generations: int,
    mutation_rate: float,
    elite: int,
    reps: int,
    seed: int,
) -> Tuple[List[int], List[float], Tuple[float, float]]:
    """
    GA zur Minimierung von E[Tardiness] + lam * Var[Tardiness].
    """
    rng = random.Random(seed)
    n = len(orders)
    idxs = list(range(n))
    if n <= 1:
        return idxs, [], (0.0, 0.0)

    pop: List[List[int]] = []
    pop.append(idxs[:])  # Identität
    means = [defuzzify_tfn(o.duration_tfn) for o in orders]
    pop.append(sorted(idxs, key=lambda i: means[i]))  # SPT
    while len(pop) < pop_size:
        shuffled = idxs[:]
        rng.shuffle(shuffled)
        pop.append(shuffled)

    cache: Dict[Tuple[int, ...], Tuple[float, float, float]] = {}
    best_seq = pop[0][:]
    best_val = float("inf")
    best_components = (0.0, 0.0)
    history: List[float] = []

    for gen in range(generations):
        fitness_vals: List[float] = []
        metrics_for_pop: List[Tuple[float, float]] = []
        for perm in pop:
            key = tuple(perm)
            if key in cache:
                obj, mu, var = cache[key]
            else:
                base_seed = seed * 7919 ^ hash(key) ^ (gen * 104729)
                mu, var = simulate_sequence_tardiness(perm, orders, reps, base_seed)
                obj = mu + lam * var
                cache[key] = (obj, mu, var)
            fitness_vals.append(obj)
            metrics_for_pop.append((mu, var))

        # Generation-Bestimmung
        gen_best_idx = min(range(len(pop)), key=lambda idx: fitness_vals[idx])
        gen_best_val = fitness_vals[gen_best_idx]
        if gen_best_val < best_val:
            best_val = gen_best_val
            best_seq = pop[gen_best_idx][:]
            best_components = metrics_for_pop[gen_best_idx]

        history.append(best_val)

        # Nächste Population
        next_pop: List[List[int]] = []
        # Elitismus
        elite_indices = sorted(range(len(pop)), key=lambda idx: fitness_vals[idx])[: max(1, elite)]
        for idx in elite_indices:
            next_pop.append(pop[idx][:])

        while len(next_pop) < pop_size:
            parent_a = tournament_select(pop, fitness_vals, rng)
            parent_b = tournament_select(pop, fitness_vals, rng)
            child = order_crossover(parent_a, parent_b, rng)
            mutate_swap(child, rng, mutation_rate)
            next_pop.append(child)

        pop = next_pop

    return best_seq, history, best_components


# ---------------------------------------------------------------------------
# Planaufbau & Auswertung
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
        return {
            "meanProcTime": 0.0,
            "totalTardiness": 0.0,
            "maxTardiness": 0.0,
        }
    total_tardiness = sum(row.get("plannedTardiness", 0.0) for row in plan)
    mean_proc = statistics.fmean(row.get("procTimePlan", 0.0) for row in plan)
    max_tard = max((row.get("plannedTardiness", 0.0) for row in plan), default=0.0)
    return {
        "meanProcTime": float(mean_proc),
        "totalTardiness": float(total_tardiness),
        "maxTardiness": float(max_tard),
    }


def clone_operations(ops: Optional[Iterable[Any]]) -> List[Dict[str, Any]]:
    cloned: List[Dict[str, Any]] = []
    if not ops:
        return cloned
    for op in ops:
        if isinstance(op, dict):
            cloned.append({key: op[key] for key in op})
    return cloned


def build_batches(
    sequence: Sequence[int],
    orders: Sequence[OrderData],
    plan_lookup: Dict[str, Dict[str, float]],
    priorities_map: Dict[str, float],
    q_min: int,
    q_max: int,
) -> List[Dict[str, Any]]:
    batches: List[Dict[str, Any]] = []
    current: List[str] = []
    score_acc = 0.0

    q_min = max(1, q_min)
    q_max = max(q_min, q_max)

    for idx in sequence:
        order_id = orders[idx].order_id
        current.append(order_id)
        score_acc += priorities_map.get(order_id, 0.0)
        if len(current) >= q_max:
            first = current[0]
            release_at = float(plan_lookup.get(first, {}).get("plannedStart", 0.0))
            avg_score = score_acc / len(current) if current else 0.0
            batches.append(
                {
                    "id": f"pip-ga-batch-{len(batches) + 1}",
                    "orderIds": current[:],
                    "releaseAt": release_at,
                    "score": float(avg_score),
                }
            )
            current = []
            score_acc = 0.0

    if current and len(current) >= q_min:
        first = current[0]
        release_at = float(plan_lookup.get(first, {}).get("plannedStart", 0.0))
        avg_score = score_acc / len(current) if current else 0.0
        batches.append(
            {
                "id": f"pip-ga-batch-{len(batches) + 1}",
                "orderIds": current[:],
                "releaseAt": release_at,
                "score": float(avg_score),
            }
        )

    return batches


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


def build_orders_from_payload(
    raw_orders: Sequence[Dict[str, Any]],
    now: float,
    horizon_minutes: float,
    default_duration: float = 60.0,
    variation: float = 0.3,
) -> List[OrderData]:
    orders: List[OrderData] = []
    default_due = now + max(horizon_minutes, 60.0)

    for idx, raw in enumerate(raw_orders):
        order_id = str(raw.get("orderId") or f"order-{idx + 1}")
        dem_ops = clone_operations(raw.get("demOps"))
        mon_ops = clone_operations(raw.get("monOps"))
        combined_ops = dem_ops + mon_ops
        if not combined_ops:
            combined_ops = [
                {
                    "id": f"{order_id}-placeholder",
                    "stationId": "pre-inspection",
                    "expectedDuration": default_duration,
                }
            ]

        duration = sum(
            float(op.get("expectedDuration") or 0.0)
            for op in combined_ops
        )
        if duration <= 0:
            duration = default_duration

        duration_tfn = guess_tfn(duration, variation)
        ready_at = normalize_minutes(raw.get("readyAt"), now)
        due_date = normalize_minutes(raw.get("dueDate"), default_due)

        if due_date < ready_at:
            due_date = ready_at + duration

        orders.append(
            OrderData(
                order_id=order_id,
                due_date=due_date,
                ready_at=ready_at,
                duration_tfn=duration_tfn,
                combined_ops=combined_ops,
                raw=dict(raw),
            )
        )

    return orders


def create_plot_entries(
    history: Sequence[float],
    baseline_metrics: Dict[str, float],
    optimized_metrics: Dict[str, float],
) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    if not HAS_MATPLOTLIB:
        return entries

    try:
        if history:
            fig, ax = plt.subplots(figsize=(6, 3))
            ax.plot(range(1, len(history) + 1), history, marker="o", linewidth=1.2)
            ax.set_title("GA Convergence – Objective Verlauf")
            ax.set_xlabel("Generation")
            ax.set_ylabel("Best Objective")
            ax.grid(True, linestyle="--", alpha=0.4)
            buf = io.BytesIO()
            fig.tight_layout()
            fig.savefig(buf, format="png", dpi=130)
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

        # Balkendiagramm Baseline vs Optimiert
        fig, ax = plt.subplots(figsize=(5, 3))
        labels = ["Mean Proc Time", "Total Tardiness", "Max Tardiness"]
        baseline_vals = [
            baseline_metrics.get("meanProcTime", 0.0),
            baseline_metrics.get("totalTardiness", 0.0),
            baseline_metrics.get("maxTardiness", 0.0),
        ]
        optimized_vals = [
            optimized_metrics.get("meanProcTime", 0.0),
            optimized_metrics.get("totalTardiness", 0.0),
            optimized_metrics.get("maxTardiness", 0.0),
        ]
        positions = range(len(labels))
        ax.bar([p - 0.2 for p in positions], baseline_vals, width=0.4, label="Baseline")
        ax.bar([p + 0.2 for p in positions], optimized_vals, width=0.4, label="Optimiert")
        ax.set_xticks(list(positions))
        ax.set_xticklabels(labels, rotation=15)
        ax.set_title("Baseline vs Optimiert (defuzzifiziert)")
        ax.legend()
        ax.grid(True, linestyle="--", alpha=0.3, axis="y")
        buf = io.BytesIO()
        fig.tight_layout()
        fig.savefig(buf, format="png", dpi=130)
        plt.close(fig)
        entries.append(
            {
                "stage": "PIP_GA_PLOT_COMPARISON",
                "media": {
                    "type": "image/png",
                    "encoding": "base64",
                    "data": base64.b64encode(buf.getvalue()).decode("ascii"),
                },
            }
        )
    except Exception as exc:  # pragma: no cover - rein informativ
        entries.append(
            {
                "stage": "PIP_GA_PLOT_ERROR",
                "error": str(exc),
            }
        )

    return entries


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
) -> List[Dict[str, Any]]:
    history_preview = [round(val, 4) for val in history[:80]]
    improvement = baseline_obj - best_obj
    improvement_pct = (improvement / baseline_obj * 100.0) if baseline_obj else None

    baseline_plan_metrics = compute_plan_metrics(baseline_plan)
    optimized_plan_metrics = compute_plan_metrics(optimized_plan)

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
        {
            "stage": "PIP_GA_KPI_SERIES",
            "series": [
                {
                    "label": "Baseline Total Tardiness",
                    "value": baseline_plan_metrics.get("totalTardiness", 0.0),
                },
                {
                    "label": "Optimized Total Tardiness",
                    "value": optimized_plan_metrics.get("totalTardiness", 0.0),
                },
            ],
        },
    ]

    debug.extend(
        create_plot_entries(history, baseline_plan_metrics, optimized_plan_metrics)
    )

    return debug


def simple_fifo_result(
    raw_orders: Sequence[Dict[str, Any]],
    now: float,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    horizon = float(config.get("horizonMinutes", 240.0) or 240.0)
    orders = build_orders_from_payload(raw_orders, now, horizon)

    if not orders:
        return {
            "priorities": [],
            "routes": [],
            "batches": [],
            "releaseList": [],
            "debug": [
                {
                    "stage": "PIP_EMPTY",
                    "message": "Keine Aufträge verfügbar.",
                }
            ],
        }

    sequence = sorted(
        range(len(orders)),
        key=lambda idx: (
            orders[idx].ready_at,
            orders[idx].due_date if orders[idx].due_date is not None else math.inf,
            orders[idx].order_id,
        ),
    )
    plan = build_plan(sequence, orders, now)
    plan_lookup = {row["orderId"]: row for row in plan}
    priorities, priority_map = compute_priorities(plan)
    q_min = int(config.get("qMin", 3) or 3)
    q_max = int(config.get("qMax", max(q_min, 6)) or max(q_min, 6))
    batches = build_batches(sequence, orders, plan_lookup, priority_map, q_min, q_max)
    routes = build_routes(orders, plan_lookup)
    release_list = [orders[idx].order_id for idx in sequence]

    return {
        "priorities": priorities,
        "routes": routes,
        "batches": batches,
        "releaseList": release_list,
        "debug": [
            {
                "stage": "PIP_FALLBACK",
                "message": "FIFO-Planung verwendet (zu wenige Aufträge für GA).",
                "orderCount": len(orders),
            }
        ],
    }


def schedule_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    now = float(payload.get("now") or 0.0)
    raw_orders = payload.get("orders") or []
    config = payload.get("config") or {}

    if not isinstance(raw_orders, list) or len(raw_orders) == 0:
        return simple_fifo_result([], now, config)

    horizon = float(config.get("horizonMinutes", 240.0) or 240.0)
    orders = build_orders_from_payload(raw_orders, now, horizon)

    if len(orders) <= 1:
        return simple_fifo_result(raw_orders, now, config)

    ga_config = config.get("ga") or config.get("gaSettings") or {}
    pop_size = int(ga_config.get("population", 60) or 60)
    generations = int(ga_config.get("generations", 80) or 80)
    mutation_rate = float(ga_config.get("mutationRate", 0.25) or 0.25)
    elite = int(ga_config.get("elite", 3) or 3)
    reps = int(ga_config.get("replications", 30) or 30)
    seed = int(ga_config.get("seed", 42) or 42)

    pop_size = max(4, pop_size)
    generations = max(1, generations)
    mutation_rate = max(0.0, min(1.0, mutation_rate))
    elite = max(1, min(elite, pop_size - 1))
    reps = max(5, reps)

    lam = float(config.get("varianceWeight", 0.1) or 0.1)

    baseline_seq = sorted(
        range(len(orders)),
        key=lambda idx: (
            orders[idx].due_date if orders[idx].due_date is not None else math.inf,
            orders[idx].ready_at,
            orders[idx].order_id,
        ),
    )

    best_seq, history, best_components = optimize_sequence_ga(
        orders=orders,
        lam=lam,
        pop_size=pop_size,
        generations=generations,
        mutation_rate=mutation_rate,
        elite=elite,
        reps=reps,
        seed=seed,
    )

    if not best_seq:
        best_seq = baseline_seq

    baseline_mu, baseline_var = simulate_sequence_tardiness(
        baseline_seq, orders, reps, seed * 13 + 17
    )
    best_mu, best_var = best_components
    baseline_obj = baseline_mu + lam * baseline_var
    best_obj = best_mu + lam * best_var

    baseline_plan = build_plan(baseline_seq, orders, now)
    optimized_plan = build_plan(best_seq, orders, now)
    plan_lookup = {row["orderId"]: row for row in optimized_plan}

    priorities, priority_map = compute_priorities(optimized_plan)
    routes = build_routes(orders, plan_lookup)

    q_min = int(config.get("qMin", 3) or 3)
    q_max = int(config.get("qMax", max(q_min, 6)) or max(q_min, 6))
    batches = build_batches(best_seq, orders, plan_lookup, priority_map, q_min, q_max)

    release_list = [orders[idx].order_id for idx in best_seq]

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
    )

    return {
        "priorities": priorities,
        "routes": routes,
        "batches": batches,
        "releaseList": release_list,
        "debug": debug,
    }


def main() -> None:
    payload = load_payload()
    result = schedule_payload(payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
