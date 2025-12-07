#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grobterminierung – Jaccard-Batching + Prognose-Integration:
- Start/End-Fenster, dynamisches Kapazitäts-Gate
- DeferScore mit erwarteten ähnlichen Ankünften
- Puffer an Ankunfts-Unsicherheit gekoppelt
- temporäres q_min abhängig von erwarteter Ähnlichkeit
- CTP unverändert kompatibel

Erwartete Forecast-Inputstruktur (optional, Top-Level 'forecast'):
{
  "variants": [
    {"id":"v1", "lambda_per_T":0.8, "proto_steps":["PS-Fahrwerk","PS-Antrieb","PS-Chassis"]},
    {"id":"v2", "lambda_per_T":0.3, "proto_steps":["PS-Fahrwerk","PS-Chassis"]}
  ],
  "cv_arrival": 0.25   # CoV der Ankunftsrate (optional, sonst 0)
}
"""

import json
import sys
import re
import math
from typing import Dict, List, Any, Tuple, Set
from collections import defaultdict
from itertools import combinations

MIN_PER_DAY = 24 * 60

DEFAULT_FORECAST = {
    "variants": [
        {
            "id": "proto-default",
            "lambda_per_T": 0.5,
            "proto_steps": ["PS-Fahrwerk", "PS-Antrieb", "PS-Chassis"],
        }
    ],
    "cv_arrival": 0.0,
}

# -----------------------------
# I/O
# -----------------------------
def load_payload() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw:
        return {"orders": [], "config": {}}
    return json.loads(raw)

# -----------------------------
# Utilities
# -----------------------------
def days_to_min(d: float) -> float:
    return float(d) * MIN_PER_DAY

def to_bucket(t: float, bucket: int) -> int:
    return int(t // bucket) * bucket

def order_proc_time(o: Dict[str, Any]) -> float:
    return float(o.get("processTimeDem", 60.0)) + float(o.get("processTimeMon", 90.0))

# -----------------------------
# Sequenz-Handling
# -----------------------------
_STOP_TOKENS = {"I", "×", "Q"}

def _normalize_step(step: str) -> str:
    s = str(step)
    s = re.sub(r"^(BG|BGT)-", "", s)  # BG-/BGT- Präfix entfernen
    return s.strip()

def _extract_steps_from_block(block: Dict[str, Any]) -> List[List[str]]:
    out: List[List[str]] = []
    if not isinstance(block, dict):
        return out
    seqs = block.get("sequences", [])
    if isinstance(seqs, list):
        for seq in seqs:
            steps = seq.get("steps")
            if isinstance(steps, list):
                out.append([_normalize_step(s) for s in steps if str(s) not in _STOP_TOKENS])
    return out

def seq_set_from_order_or_global(order: Dict[str, Any],
                                 global_sequences: Dict[str, Any]) -> Set[str]:
    steps_union: Set[str] = set()

    for key in ("baugruppen", "baugruppentypen"):
        block = order.get(key)
        for lst in _extract_steps_from_block(block):
            for s in lst:
                steps_union.add(_normalize_step(s))

    if "sequences" in order:
        seqs = order.get("sequences")
        if isinstance(seqs, list) and seqs:
            if isinstance(seqs[0], dict):  # [{id, steps:[...]}]
                for obj in seqs:
                    for s in obj.get("steps", []):
                        if str(s) not in _STOP_TOKENS:
                            steps_union.add(_normalize_step(s))
            else:  # Liste von Strings
                for s in seqs:
                    if str(s) not in _STOP_TOKENS:
                        steps_union.add(_normalize_step(s))

    for k in ("processSeq", "sequence"):
        seq = order.get(k)
        if isinstance(seq, list):
            for s in seq:
                if str(s) not in _STOP_TOKENS:
                    steps_union.add(_normalize_step(s))

    oid = order.get("orderId")
    if oid and isinstance(global_sequences, dict) and oid in global_sequences:
        seq = global_sequences.get(oid)
        if isinstance(seq, list):
            for s in seq:
                if str(s) not in _STOP_TOKENS:
                    steps_union.add(_normalize_step(s))

    return steps_union

def jaccard(a: Set[str], b: Set[str]) -> float:
    u = a | b
    return 0.0 if not u else len(a & b) / len(u)

# -----------------------------
# Config Defaults
# -----------------------------
def apply_config_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(cfg or {})
    cfg.setdefault("intervalMinutes", 120)
    cfg.setdefault("machines", 1)
    cfg.setdefault("shiftMinutesPerDay", 480)

    setup = dict(cfg.get("setup", {}))
    setup.setdefault("minBatch", 2)
    setup.setdefault("qMin", 2)  # Mindestens 2 Aufträge pro Batch
    setup.setdefault("qMax", 7)
    cfg["setup"] = setup

    defer = dict(cfg.get("defer", {}))
    defer.setdefault("enable", True)
    defer.setdefault("bufferPct", 0.15)           # Basis-Puffer (wird dynamisch skaliert)
    defer.setdefault("maxHoldDays", 14)
    defer.setdefault("serviceWindowDays", 21)

    # DeferScore & Prognose
    defer.setdefault("kMaxDefers", 3)
    defer.setdefault("gamma", 2.0)
    defer.setdefault("lamSim", 1.0)
    defer.setdefault("lamUrg", 1.0)
    defer.setdefault("lamCap", 0.5)
    defer.setdefault("utilAdjustK", 0.3)         # Stärke der Gate-Absenkung
    cfg["defer"] = defer

    windows = dict(cfg.get("windows", {}))
    windows.setdefault("alpha", 0.0)
    windows.setdefault("beta", 0.0)
    cfg["windows"] = windows

    cfg.setdefault("targetUtil", 0.5)
    cfg.setdefault("demandForecastPerDay", 3)
    cfg.setdefault("ctpMaxSlots", 30)
    cfg.setdefault("jaccardThreshold", 0.3)  # Reduziert für größere Batches (0.3 = 30% Ähnlichkeit)
    return cfg

# -----------------------------
# Enrichment
# -----------------------------
def enrich_orders(orders: List[Dict[str, Any]],
                  cfg: Dict[str, Any],
                  now: float,
                  global_sequences: Dict[str, Any]) -> List[Dict[str, Any]]:
    defer = cfg["defer"]
    interval = int(cfg["intervalMinutes"])

    enriched: List[Dict[str, Any]] = []
    for o in orders:
        dem = float(o.get("processTimeDem", 60.0))
        mon = float(o.get("processTimeMon", 90.0))
        total = max(1.0, dem + mon)

        due = o.get("dueDate")
        if not isinstance(due, (int, float)):
            due = now + days_to_min(30)

        service_deadline = now + days_to_min(defer["serviceWindowDays"])
        target_end = min(float(due), service_deadline)

        wait_est = float(interval)
        buffer = float(defer["bufferPct"]) * total

        latest_release = max(now, target_end - total - wait_est - buffer)
        latest_release_cap = now + days_to_min(defer["maxHoldDays"])
        latest_release = min(latest_release, latest_release_cap)

        seqset = seq_set_from_order_or_global(o, global_sequences)
        enriched.append({
            **o,
            "processTimeDem": dem,
            "processTimeMon": mon,
            "processTimeTotal": total,
            "dueDate": float(due),
            "latestRelease": float(latest_release),
            "seqSet": seqset,
            "deferredCount": int(o.get("deferredCount", 0))
        })
    return enriched

# -----------------------------
# Auslastung im nächsten Bucket
# -----------------------------
def next_bucket_util(batches: List[Dict[str, Any]],
                     orders_map: Dict[str, Dict[str, Any]],
                     cfg: Dict[str, Any],
                     now: float) -> float:
    bucket = int(cfg["intervalMinutes"])
    machines = max(1, int(cfg["machines"]))
    shift = int(cfg.get("shiftMinutesPerDay", 480))
    cap_bucket = machines * min(bucket, shift)
    if cap_bucket <= 0:
        return 0.0

    nb_start = (int(now // bucket) + 1) * bucket
    nb_end = nb_start + bucket

    wl_next = 0.0
    for b in batches:
        s = float(b["windowStart"]["earliest"])
        e = float(b["windowEnd"]["latest"])
        if e <= s:
            continue
        overlap = max(0.0, min(e, nb_end) - max(s, nb_start))
        if overlap > 0:
            work = 0.0
            for oid in b["orderIds"]:
                order = orders_map.get(oid)
                if order is None:
                    continue
                work += float(order.get("processTimeTotal", order_proc_time(order)))
            if work <= 0.0:
                continue
            wl_next += work * (overlap / (e - s))
    return min(1.0, wl_next / cap_bucket)

# -----------------------------
# Prognose-Hooks
# -----------------------------
def expected_similar_next(seed_seq: Set[str], forecast: Dict[str, Any], tau: float) -> float:
    """
    E[N_ähnlich] = Sum_v lambda_v_per_T * Pr{ J(seed, S_v) >= tau }.
    Praktisch als hartes Kriterium (1/0) über Prototyp-Schritte S_v implementiert.
    """
    if not isinstance(forecast, dict):
        return 0.0
    variants = forecast.get("variants", [])
    exp = 0.0
    for v in variants:
        lam = float(v.get("lambda_per_T", 0.0))
        proto = set(_normalize_step(s) for s in v.get("proto_steps", []))
        prob_fit = 1.0 if jaccard(seed_seq, proto) >= tau else 0.0
        exp += lam * prob_fit
    return max(0.0, exp)

def dynamic_target_util(cfg: Dict[str, Any],
                        forecast: Dict[str, Any]) -> float:
    """
    targetUtil_eff = max(0.3, targetUtil - k * forecast_load_ratio),
    forecast_load_ratio ~ (Sum_v lambda_v_per_T * T) / Kapazität_T
    """
    base = float(cfg.get("targetUtil", 0.5))
    k = float(cfg["defer"].get("utilAdjustK", 0.3))
    T = int(cfg["intervalMinutes"])
    machines = max(1, int(cfg["machines"]))
    shift = int(cfg.get("shiftMinutesPerDay", 480))
    cap_T = machines * min(T, shift)
    if cap_T <= 0:
        return base

    lam_sum_T = 0.0
    if isinstance(forecast, dict):
        for v in forecast.get("variants", []):
            lam_sum_T += float(v.get("lambda_per_T", 0.0)) * T
    load_ratio = min(1.0, lam_sum_T / cap_T)
    return max(0.3, base - k * load_ratio)

def adjusted_buffer_pct(cfg: Dict[str, Any], forecast: Dict[str, Any]) -> float:
    """
    Puffer dynamisch: bufferPct_eff = bufferPct_base * (1 + cv_arrival)
    """
    base = float(cfg["defer"].get("bufferPct", 0.15))
    cv = 0.0
    if isinstance(forecast, dict):
        cv = float(forecast.get("cv_arrival", 0.0))
    return max(0.0, base * (1.0 + max(0.0, cv)))

def effective_q_min(cfg: Dict[str, Any], exp_similar_next: float, q_max: int) -> int:
    """
    Temporäres q_min: leicht erhöhen, wenn in T viele passende Ankünfte erwartet werden.
    Schwelle 1.5 als Startwert.
    """
    q_min = int(cfg["setup"].get("qMin", 1))
    bump = 1 if exp_similar_next >= 1.5 else 0
    return max(1, min(q_max, q_min + bump))

# -----------------------------
# Jaccard-Clustering (greedy)
# -----------------------------
def cluster_by_jaccard(enriched: List[Dict[str, Any]], threshold: float, q_max: int) -> List[List[Dict[str, Any]]]:
    assigned = set()
    orders_sorted = sorted(enriched, key=lambda o: (o.get("dueDate", 0.0)))
    clusters: List[List[Dict[str, Any]]] = []

    # Debug: Calculate all pairwise similarities
    print(f"\n=== CLUSTERING DEBUG ===", file=sys.stderr)
    print(f"Total orders: {len(orders_sorted)}, Threshold: {threshold}, q_max: {q_max}", file=sys.stderr)

    # Sample pairwise similarities
    if len(orders_sorted) >= 2:
        print(f"\nSample pairwise Jaccard similarities:", file=sys.stderr)
        for i in range(min(3, len(orders_sorted))):
            for j in range(i+1, min(3, len(orders_sorted))):
                sim = jaccard(orders_sorted[i]["seqSet"], orders_sorted[j]["seqSet"])
                oid_i = orders_sorted[i].get("orderId", f"IDX-{i}")[:12]
                oid_j = orders_sorted[j].get("orderId", f"IDX-{j}")[:12]
                seq_i = sorted(list(orders_sorted[i]["seqSet"]))[:5]
                seq_j = sorted(list(orders_sorted[j]["seqSet"]))[:5]
                print(f"  {oid_i} vs {oid_j}: {sim:.3f} (≥{threshold}? {sim >= threshold})", file=sys.stderr)
                print(f"    Seq {oid_i}: {seq_i}", file=sys.stderr)
                print(f"    Seq {oid_j}: {seq_j}", file=sys.stderr)

    for i, o in enumerate(orders_sorted):
        oid = o.get("orderId", f"IDX-{i}")
        if oid in assigned:
            continue
        base_seq = o["seqSet"]
        cluster = [o]
        assigned.add(oid)

        # Debug: Track how many matches found
        matches_found = 0
        for j, p in enumerate(orders_sorted):
            pid = p.get("orderId", f"IDX-{j}")
            if pid in assigned:
                continue
            sim = jaccard(base_seq, p["seqSet"])
            if sim >= threshold:
                cluster.append(p)
                assigned.add(pid)
                matches_found += 1

        print(f"\nCluster starting with {oid[:12]}: found {matches_found} matches, total size {len(cluster)}", file=sys.stderr)

        for k in range(0, len(cluster), max(1, q_max)):
            sub_cluster = cluster[k:k+q_max]
            clusters.append(sub_cluster)
            print(f"  → Sub-cluster {len(clusters)}: size {len(sub_cluster)}", file=sys.stderr)

    print(f"\n=== CLUSTERING RESULT: {len(clusters)} clusters ===\n", file=sys.stderr)
    return clusters

# -----------------------------
# DeferScore-Komponenten
# -----------------------------
def must_release_batch(batch_orders: List[Dict[str, Any]], now: float, cfg: Dict[str, Any]) -> bool:
    S = float(cfg["defer"]["serviceWindowDays"])
    service_deadline = now + days_to_min(S)
    for o in batch_orders:
        p = float(o["processTimeTotal"])
        slack = float(o["dueDate"]) - now - p
        if slack <= 0:
            return True
        if float(o["dueDate"]) <= service_deadline:
            return True
    return False

def avg_pairwise_jaccard(batch_orders: List[Dict[str, Any]]) -> float:
    if len(batch_orders) <= 1:
        return 1.0
    sims = []
    for a, b in combinations(batch_orders, 2):
        sims.append(jaccard(a["seqSet"], b["seqSet"]))
    return sum(sims) / len(sims) if sims else 1.0

def jaccard_matrix(batch_orders: List[Dict[str, Any]]) -> List[List[float]]:
    """
    Berechnet die vollständige Jaccard-Ähnlichkeitsmatrix für alle Aufträge im Batch.
    Rückgabe: n x n Matrix, wobei matrix[i][j] die Ähnlichkeit zwischen Auftrag i und j ist.
    """
    n = len(batch_orders)
    matrix = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i][j] = 1.0
            else:
                matrix[i][j] = jaccard(batch_orders[i]["seqSet"], batch_orders[j]["seqSet"])

    return matrix

def expected_delta_j(avgJ: float, size: int, exp_similar_next: float) -> float:
    """
    ΔJ ≈ Verbesserung, falls exp_similar_next perfekt passende Aufträge im nächsten Takt hinzukommen.
    """
    if size <= 0 or exp_similar_next <= 0:
        return 0.0
    new_avg = (size * avgJ + exp_similar_next * 1.0) / (size + exp_similar_next)
    return max(0.0, new_avg - avgJ)

def urgency_U(batch_orders: List[Dict[str, Any]], now: float, gamma: float) -> float:
    vals = []
    for o in batch_orders:
        p = float(o["processTimeTotal"])
        slack = max(0.0, float(o["dueDate"]) - now - p)
        denom = max(1e-6, gamma * p)
        u = max(0.0, 1.0 - (slack / denom))
        vals.append(min(1.0, u))
    return sum(vals) / len(vals) if vals else 0.0

def capacity_pressure_C(batches_if_release: List[Dict[str, Any]],
                        probe_batch: Dict[str, Any],
                        orders_map: Dict[str, Dict[str, Any]],
                        cfg: Dict[str, Any],
                        now: float) -> float:
    util_with = next_bucket_util(batches_if_release + [probe_batch], orders_map, cfg, now)
    target = float(cfg.get("targetUtil", 0.5))
    return max(0.0, util_with - target)

def defer_score(batch_orders: List[Dict[str, Any]],
                probe_batch: Dict[str, Any],
                batches_so_far: List[Dict[str, Any]],
                orders_map: Dict[str, Dict[str, Any]],
                cfg: Dict[str, Any],
                now: float,
                forecast: Dict[str, Any],
                tau: float) -> float:
    """
    λ_sim*ΔJ(exp_similar_next) - λ_urg*U - λ_cap*C
    exp_similar_next stammt aus der Prognose (variantenbasiert).
    """
    defer_cfg = cfg["defer"]
    lam_sim = float(defer_cfg["lamSim"])
    lam_urg = float(defer_cfg["lamUrg"])
    lam_cap = float(defer_cfg["lamCap"])
    gamma   = float(defer_cfg["gamma"])

    # Seed = „repräsentativer“ Auftrag des Batches (erster)
    seed_seq = batch_orders[0]["seqSet"] if batch_orders else set()
    exp_sim = expected_similar_next(seed_seq, forecast, tau)

    avgJ = avg_pairwise_jaccard(batch_orders)
    dJ   = expected_delta_j(avgJ, len(batch_orders), exp_sim)
    U    = urgency_U(batch_orders, now, gamma)
    C    = capacity_pressure_C(batches_so_far, probe_batch, orders_map, cfg, now)
    return lam_sim * dJ - lam_urg * U - lam_cap * C, exp_sim

# -----------------------------
# Batches bauen (mit Prognoseeinbindung)
# -----------------------------
def build_batches(enriched: List[Dict[str, Any]], cfg: Dict[str, Any], now: float, forecast: Dict[str, Any]
                  ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    T = int(cfg["intervalMinutes"])
    m = max(1, int(cfg["machines"]))
    base_target_util = float(cfg.get("targetUtil", 0.5))
    thr   = float(cfg.get("jaccardThreshold", 0.3))
    alpha = float(cfg["windows"]["alpha"])
    beta  = float(cfg["windows"]["beta"])
    k_max_defers = int(cfg["defer"]["kMaxDefers"])

    # dynamische Parameter aus Prognose
    target_util_eff = dynamic_target_util(cfg, forecast)
    buffer_pct_eff  = adjusted_buffer_pct(cfg, forecast)

    orders_map = {o["orderId"]: o for o in enriched if "orderId" in o}
    clusters = cluster_by_jaccard(enriched, threshold=thr, q_max=int(cfg["setup"]["qMax"]))

    batches: List[Dict[str, Any]] = []
    deferred_list: List[Dict[str, Any]] = []
    slot_time0 = (int(now // T) + 1) * T
    slot_cursor = float(slot_time0)
    batch_idx = 1

    for cluster in clusters:
        ids = [o["orderId"] for o in cluster if "orderId" in o]
        if not ids:
            continue

        # temporäres q_min: abhängig von erwarteten ähnlichen Ankünften
        seed_seq = cluster[0]["seqSet"]
        exp_sim_next = expected_similar_next(seed_seq, forecast, thr)
        q_min_eff = effective_q_min(cfg, exp_sim_next, int(cfg["setup"]["qMax"]))

        # Dauer und initiales Fenster mit dynamischem Puffer
        work = sum(orders_map[i]["processTimeTotal"] for i in ids if i in orders_map)
        duration = work / m
        s_early = float(slot_cursor)
        s_late  = s_early + buffer_pct_eff * duration
        e_early = s_early + duration
        e_late  = s_late  + duration

        s_nom = s_early
        start_e = s_nom - alpha * duration if alpha else s_early
        start_l = s_nom + beta  * duration if beta  else s_late
        end_e   = start_e + duration
        end_l   = start_l + duration

        probe = {
            "orderIds": ids,
            "windowStart": {"earliest": start_e, "latest": start_l},
            "windowEnd":   {"earliest": end_e,   "latest": end_l}
        }

        avgJ = avg_pairwise_jaccard(cluster)
        weak_batch = len(cluster) < q_min_eff or avgJ < thr

        if not must_release_batch(cluster, now, cfg) and weak_batch:
            dscore, exp_sim = defer_score(cluster, probe, batches, orders_map, cfg, now, forecast, thr)
            max_def = max(o.get("deferredCount", 0) for o in cluster)
            if dscore > 0 and max_def < k_max_defers:
                for o in cluster:
                    o["deferredCount"] = int(o.get("deferredCount", 0)) + 1
                    deferred_list.append({"orderId": o["orderId"], "deferredCount": o["deferredCount"]})
                continue  # zurückhalten

        # Kapazitäts-Gate (dynamische Zielauslastung)
        while next_bucket_util(batches + [probe], orders_map, cfg, now) > target_util_eff:
            start_e += T; start_l += T; end_e += T; end_l += T
            probe["windowStart"]["earliest"] = start_e
            probe["windowStart"]["latest"]   = start_l
            probe["windowEnd"]["earliest"]   = end_e
            probe["windowEnd"]["latest"]     = end_l

        # Berechne Jaccard-Matrix und extrahiere Sequenzen
        jmatrix = jaccard_matrix(cluster)
        order_sequences = []
        for o in cluster:
            oid = o.get("orderId")
            seqset = o.get("seqSet", set())
            order_sequences.append({
                "orderId": oid,
                "sequence": sorted(list(seqset))  # Sortierte Liste der Steps
            })

        batches.append({
            "id": f"pap-batch-{batch_idx}",
            "policy": "JACCARD+FORECAST+WINDOW+DEFER",
            "param": {"T": T, "threshold": thr, "targetUtilBase": base_target_util, "targetUtilEff": target_util_eff,
                      "bufferPctEff": buffer_pct_eff},
            "orderIds": ids,
            "size": len(ids),
            "releaseAt": float(start_e),
            "forced": False,
            "windowStart": {"earliest": start_e, "latest": start_l},
            "windowEnd":   {"earliest": end_e,   "latest": end_l},
            "jaccardSimilarity": avgJ,
            "jaccardMatrix": jmatrix,
            "orderSequences": order_sequences
        })
        batch_idx += 1
        slot_cursor = max(slot_cursor + T, end_l)

    return batches, deferred_list

# -----------------------------
# ETA je Auftrag (ein Liefertermin)
# -----------------------------
def build_eta_list(
    batches: List[Dict[str, Any]],
    orders_map: Dict[str, Dict[str, Any]],
    cfg: Dict[str, Any],
) -> List[Dict[str, Any]]:
    eta_list: List[Dict[str, Any]] = []
    if not batches:
        return eta_list

    machines = max(1, int(cfg.get("machines", 1)))
    current_time = 0.0

    # sort batches by planned release so that deliveries progress through time
    sorted_batches = sorted(
        batches,
        key=lambda b: float(
            b.get("releaseAt")
            or b.get("windowStart", {}).get("earliest")
            or 0.0
        ),
    )

    for batch in sorted_batches:
        release_at = batch.get("releaseAt")
        if release_at is None:
            release_at = batch.get("windowStart", {}).get("earliest", current_time)
        try:
            release_at = float(release_at)
        except (TypeError, ValueError):
            release_at = current_time
        if not math.isfinite(release_at):
            release_at = current_time
        if release_at < current_time:
            release_at = current_time

        order_ids = batch.get("orderIds") or []
        total_work = sum(
            float(orders_map.get(order_id, {}).get("processTimeTotal", 0.0))
            for order_id in order_ids
        )
        duration = total_work / machines if total_work > 0 else 0.0

        if duration <= 0:
            window_start = float(batch.get("windowStart", {}).get("earliest", release_at))
            window_end = float(batch.get("windowEnd", {}).get("latest", window_start))
            duration = max(1.0, window_end - window_start)

        delivery = release_at + duration
        current_time = delivery

        for order_id in order_ids:
            order = orders_map.get(order_id)
            if order is None:
                continue
            p = float(order.get("processTimeTotal", duration))
            eta_list.append(
                {
                    "orderId": order_id,
                    "eta": delivery,
                    "lower": delivery - 0.1 * p,
                    "upper": delivery + 0.1 * p,
                    "confidence": 0.7,
                }
            )

    return eta_list

# -----------------------------
# Reporting: Bucket-Auslastung
# -----------------------------
def utilization_forecast(batches: List[Dict[str, Any]],
                         orders_map: Dict[str, Dict[str, Any]],
                         cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    bucket = int(cfg["intervalMinutes"])
    machines = max(1, int(cfg["machines"]))
    shift = int(cfg.get("shiftMinutesPerDay", 480))
    cap_bucket = machines * min(bucket, shift)

    util = defaultdict(float)
    for b in batches:
        s = float(b["windowStart"]["earliest"])
        e = float(b["windowEnd"]["latest"])
        if e <= s:
            continue
        work = 0.0
        for oid in b["orderIds"]:
            order = orders_map.get(oid)
            if order is None:
                continue
            work += float(order.get("processTimeTotal", order_proc_time(order)))
        if work <= 0.0:
            continue
        per_min = work / (e - s)
        t = int(s)
        while t < e:
            k = to_bucket(t, bucket)
            util[k] += per_min * min(bucket, e - t)
            t += bucket

    out = []
    for k in sorted(util.keys()):
        wl = util[k]
        util_ratio = 0.0 if cap_bucket <= 0 else min(1.0, wl / cap_bucket)
        out.append({"bucketStart": k, "workloadMin": wl, "capacityMin": cap_bucket, "utilization": util_ratio})
    return out

# -----------------------------
# CTP (Capable-to-Promise)
# -----------------------------
def ctp_promise_orders(new_orders: List[Dict[str, Any]],
                       batches: List[Dict[str, Any]],
                       orders_map: Dict[str, Dict[str, Any]],
                       cfg: Dict[str, Any],
                       now: float) -> List[Dict[str, Any]]:
    if not new_orders:
        return []

    T = int(cfg["intervalMinutes"])
    m = max(1, int(cfg["machines"]))
    S = float(cfg["defer"]["serviceWindowDays"])
    alpha = float(cfg["windows"]["alpha"])
    beta = float(cfg["windows"]["beta"])
    target_util = float(cfg.get("targetUtil", 0.5))
    max_slots = int(cfg.get("ctpMaxSlots", 30))

    preview_batches = list(batches)
    preview_orders_map = dict(orders_map)
    promises = []

    for idx, n in enumerate(new_orders):
        p = max(1.0, order_proc_time(n))
        due = n.get("dueDate")
        if not isinstance(due, (int, float)):
            due = now + days_to_min(30)
        hard_deadline = min(float(due), now + days_to_min(S))

        slot_time = (int(now // T) + 1) * T
        found = False

        base_id = str(n.get("orderId") or f"NEW-{idx}")
        probe_id = base_id if base_id not in preview_orders_map else f"NEW-{base_id}-{idx}"

        for attempt in range(max_slots):
            duration_est = p / m
            s_nom = float(slot_time)
            start_e = s_nom - alpha * duration_est
            start_l = s_nom + beta * duration_est
            end_e = start_e + duration_est
            end_l = start_l + duration_est

            probe_batch = {
                "id": f"ctp-probe-{probe_id}-{attempt}",
                "orderIds": [probe_id],
                "releaseAt": float(slot_time),
                "windowStart": {"earliest": start_e, "latest": start_l},
                "windowEnd": {"earliest": end_e, "latest": end_l}
            }
            probe_map = dict(preview_orders_map)
            probe_map[probe_id] = {"processTimeTotal": p}
            util_with = next_bucket_util(preview_batches + [probe_batch], probe_map, cfg, now)

            promise = slot_time + duration_est + 0.1 * p
            if util_with <= target_util and promise <= hard_deadline:
                promises.append({
                    "orderId": n.get("orderId", probe_id),
                    "promisedDate": float(promise),
                    "method": "insert-light",
                    "confidence": 0.7
                })
                preview_batches.append(probe_batch)
                preview_orders_map[probe_id] = {"processTimeTotal": p}
                found = True
                break
            slot_time += T

        if not found:
            promises.append({
                "orderId": n.get("orderId", probe_id),
                "promisedDate": float(hard_deadline),
                "method": "deadline-fallback",
                "confidence": 0.5
            })

    return promises

# -----------------------------
# ASCII-Barcharts (optional)
# -----------------------------
def _print_ascii_barchart(hist: Dict[Any, int], title: str) -> None:
    if not hist:
        print(f"{title}: keine Daten"); return
    max_count = max(hist.values()); scale = 50 / max_count if max_count > 0 else 1.0
    print("\n" + title); print("-" * len(title))
    for k, v in hist.items():
        bar = "#" * max(1, int(v * scale))
        print(f"{str(k):>8}: {bar}  ({v})")

def build_batch_size_histogram(batches: List[Dict[str, Any]]) -> Dict[int, int]:
    hist = defaultdict(int)
    for b in batches:
        size = int(b.get("size", len(b.get("orderIds", []))))
        hist[size] += 1
    return dict(sorted(hist.items()))

def build_release_histogram(batches: List[Dict[str, Any]], cfg: Dict[str, Any]) -> Dict[str, int]:
    T = int(cfg["intervalMinutes"])
    hist = defaultdict(int)
    for b in batches:
        rel = int(b.get("releaseAt", 0))
        bucket = (rel // T) * T
        label = f"{bucket}–{bucket+T}"
        hist[label] += 1
    def _key(lbl: str) -> int:
        return int(lbl.split("–")[0])
    return dict(sorted(hist.items(), key=lambda x: _key(x[0])))

def print_batch_size_chart(batches: List[Dict[str, Any]]) -> None:
    _print_ascii_barchart(build_batch_size_histogram(batches),
                          "Batchgrößen-Verteilung (Anzahl Aufträge je Batch)")

def print_release_chart(batches: List[Dict[str, Any]], cfg: Dict[str, Any]) -> None:
    _print_ascii_barchart(build_release_histogram(batches, cfg),
                          "Verteilung der Batch-Starts je Takt (releaseAt)")

# -----------------------------
# MAIN
# -----------------------------
def main():
    progress: List[Dict[str, Any]] = [{"stage": "PAP_V2_STAGE", "step": "payload_loaded"}]
    try:
        payload = load_payload()
        now = float(payload.get("now", 0.0))
        cfg = apply_config_defaults(payload.get("config", {}))
        orders = payload.get("orders", [])
        new_orders = payload.get("newOrders", [])
        global_sequences = payload.get("processSequences", {})
        forecast = payload.get("forecast") or DEFAULT_FORECAST  # interne Defaults

        debug: List[Dict[str, Any]] = []
        debug.append({"stage": "INPUT", "now": now, "order_count": len(orders), "config_core": {
            "T": cfg["intervalMinutes"],
            "machines": cfg["machines"],
            "targetUtilBase": cfg["targetUtil"],
            "jaccardThreshold": cfg.get("jaccardThreshold", 0.3)
        }})
        progress.append({"stage": "PAP_V2_STAGE", "step": "input_parsed"})

        # 1) Enrichment
        enriched = enrich_orders(orders, cfg, now, global_sequences)
        orders_map = {o["orderId"]: o for o in enriched if "orderId" in o}
        seq_present = sum(1 for o in enriched if o.get("seqSet"))
        progress.append({"stage": "PAP_V2_STAGE", "step": "enrichment_done", "orders": len(enriched)})

        # Debug: Show sample sequences
        print("\n=== SEQUENCE EXTRACTION DEBUG ===", file=sys.stderr)
        for i, o in enumerate(enriched[:3]):  # Show first 3 orders
            oid = o.get("orderId", "unknown")[:12]
            seqset = o.get("seqSet", set())
            raw_seq = orders[i].get("sequences") if i < len(orders) else None
            print(f"Order {oid}:", file=sys.stderr)
            print(f"  Raw sequences field: {raw_seq}", file=sys.stderr)
            print(f"  Extracted seqSet: {sorted(list(seqset))[:10]}", file=sys.stderr)
            print(f"  seqSet size: {len(seqset)}", file=sys.stderr)
        print(f"\nTotal: {seq_present}/{len(enriched)} orders have non-empty sequences\n", file=sys.stderr)

        debug.append({"stage": "SEQUENCES",
                      "orders_with_seq": seq_present,
                      "orders_missing_seq": len(enriched) - seq_present})

        # 2) Batching (mit Prognose-Hooks)
        batches, deferred_list = build_batches(enriched, cfg, now, forecast)
        progress.append({"stage": "PAP_V2_STAGE", "step": "batching_done", "batches": len(batches)})

        # 3) ETA je Auftrag
        eta_list = build_eta_list(batches, orders_map, cfg)
        progress.append({"stage": "PAP_V2_STAGE", "step": "eta_done", "etaCount": len(eta_list)})

        # 4) Bucket-Auslastung
        util_fc = utilization_forecast(batches, orders_map, cfg)

        # 5) CTP (optional)
        ctp_preview = []
        if isinstance(new_orders, list) and new_orders:
            ctp_preview = ctp_promise_orders(new_orders, batches, orders_map, cfg, now)

        # Convert deferred orders to holdDecisions format for TypeScript
        # Hold until next batch cycle (now + intervalMinutes)
        batch_cycle_minutes = int(cfg.get("intervalMinutes", 120))
        hold_until = now + batch_cycle_minutes

        hold_decisions = [
            {
                "orderId": d["orderId"],
                "holdUntilSimMinute": hold_until,
                "holdReason": f"PAP Defer #{d['deferredCount']} - weak batch (low Jaccard similarity or insufficient batch size)"
            }
            for d in deferred_list
        ]

        if hold_decisions:
            print(f"\n🔒 [PAP Hold] {len(hold_decisions)} orders held until t={hold_until} (next batch cycle)", file=sys.stderr)
            for hd in hold_decisions[:5]:  # Show first 5
                print(f"  - {hd['orderId'][:12]}: {hd['holdReason']}", file=sys.stderr)

        debug.append({
            "stage": "SUMMARY",
            "batches": len(batches),
            "eta": len(eta_list),
            "utilBuckets": len(util_fc),
            "ctp": len(ctp_preview),
            "deferred": len(deferred_list),
            "holdDecisions": len(hold_decisions),
            "forecast_present": isinstance(forecast, dict),
            "targetUtil_eff": dynamic_target_util(cfg, forecast),
            "bufferPct_eff": adjusted_buffer_pct(cfg, forecast)
        })

        result = {
            "batches": batches,
            "etaList": eta_list,
            "utilizationForecast": util_fc,
            "ctpPreview": ctp_preview,
            "deferredOrders": deferred_list,
            "holdDecisions": hold_decisions,
            "debug": progress + debug
        }
    except Exception as exc:  # pragma: no cover
        result = {
            "batches": [],
            "etaList": [],
            "utilizationForecast": [],
            "ctpPreview": [],
            "deferredOrders": [],
            "holdDecisions": [],
            "debug": progress + [{"stage": "PAP_V2_ERROR", "message": str(exc)}],
        }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
