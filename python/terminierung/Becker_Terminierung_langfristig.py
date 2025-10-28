#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grobterminierung – einfach & erklärbar (TF + Defer + Family + Util-Gate + CTP)

Was der Algorithmus tut – in einem Satz:
- Er gibt Aufträge in festen Takten frei, hält sie bis zum spätesten erlaubten Start zurück,
  bildet möglichst familienreine Lose, vergibt Start-/End-Fenster und macht eine einfache
  Kapazitäts-/Auslastungsprüfung sowie Lieferzusagen (CTP) bei Auftragseingang.

Eingabe (stdin, JSON):
{
  "now": 1234567890,                 # Minutenzeitstempel
  "orders": [{ ... }],               # planbare Aufträge (Backlog)
  "newOrders": [{ ... }],            # optional: neue Anfragen für CTP
  "config": {
    "intervalMinutes": 120,          # Takt T (Slot-Abstand)
    "machines": 1,                   # Parallelität m
    "shiftMinutesPerDay": 480,       # grobe Tageskapazität pro Maschine (Minuten)
    "setup": {"familyKey":"variant", "minBatch":3, "qMax":7, "qMin":3},
    "defer": {"enable":true, "bufferPct":0.15, "maxHoldDays":14, "serviceWindowDays":21},
    "windows": {"alpha":0.5, "beta":0.5},
    "targetUtil": 0.5,               # Zielauslastung als weiches Gate
    "demandForecastPerDay": 3        # nur informativ; im Code nicht zwingend verwendet
  }
}

Ausgabe (stdout, JSON):
{
  "batches": [...],                  # Lose inkl. Fenster
  "etaList": [...],                  # einfache ETA je Auftrag
  "utilizationForecast": [...],      # Bucket-Auslastung
  "ctpPreview": [...],               # CTP für newOrders
  "deferredOrders": [...],           # Aufträge, die diesmal bewusst zurückgestellt wurden
  "debug": [...]                     # kurze Vorschau & Eckwerte
}
"""

import json
import sys
from typing import Dict, List, Any, Tuple
from collections import defaultdict

MIN_PER_DAY = 24 * 60


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
    """Rundet t auf den Start eines Buckets (z. B. 2h-Takt)."""
    return int(t // bucket) * bucket


def order_proc_time(o: Dict[str, Any]) -> float:
    """Gesamtprozesszeit eines Auftrags (Dem + Mon) mit sinnvollen Defaults."""
    return float(o.get("processTimeDem", 60.0)) + float(o.get("processTimeMon", 90.0))


# -----------------------------
# Config Defaults
# -----------------------------
def apply_config_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(cfg or {})
    cfg.setdefault("intervalMinutes", 120)
    cfg.setdefault("machines", 1)
    cfg.setdefault("shiftMinutesPerDay", 480)

    setup = dict(cfg.get("setup", {}))
    setup.setdefault("familyKey", "variant")
    setup.setdefault("minBatch", 3)
    setup.setdefault("qMin", 3)
    setup.setdefault("qMax", 7)
    cfg["setup"] = setup

    defer = dict(cfg.get("defer", {}))
    defer.setdefault("enable", True)
    defer.setdefault("bufferPct", 0.15)
    defer.setdefault("maxHoldDays", 14)
    defer.setdefault("serviceWindowDays", 21)
    cfg["defer"] = defer

    windows = dict(cfg.get("windows", {}))
    windows.setdefault("alpha", 0.5)
    windows.setdefault("beta", 0.5)
    cfg["windows"] = windows

    cfg.setdefault("targetUtil", 0.5)           # Zielauslastung 50 %
    cfg.setdefault("demandForecastPerDay", 3)   # informativ/erklärend
    cfg.setdefault("ctpMaxSlots", 30)           # Suche für CTP
    return cfg


# -----------------------------
# Enrichment pro Auftrag:
# - p_i, due fallback, family, LPRT
# - optional: deferredCount (wie oft zurückgestellt)
# -----------------------------
def enrich_orders(orders: List[Dict[str, Any]], cfg: Dict[str, Any], now: float) -> List[Dict[str, Any]]:
    setup = cfg["setup"]
    defer = cfg["defer"]
    interval = int(cfg["intervalMinutes"])

    enriched: List[Dict[str, Any]] = []
    for o in orders:
        dem = float(o.get("processTimeDem", 60.0))
        mon = float(o.get("processTimeMon", 90.0))
        total = max(1.0, dem + mon)  # p_i ≥ 1 Minute

        due = o.get("dueDate")
        if not isinstance(due, (int, float)):
            due = now + days_to_min(30)  # robuster Fallback

        service_deadline = now + days_to_min(defer["serviceWindowDays"])
        target_end = min(float(due), service_deadline)

        wait_est = float(interval)                      # grobe Wartezeit bis nächster Slot
        buffer = float(defer["bufferPct"]) * total      # Puffer relativ zu p_i

        latest_release = max(now, target_end - total - wait_est - buffer)
        latest_release_cap = now + days_to_min(defer["maxHoldDays"])
        latest_release = min(latest_release, latest_release_cap)

        family = str(o.get(setup["familyKey"], "default"))
        deferred_count = int(o.get("deferredCount", 0))

        enriched.append({
            **o,
            "processTimeDem": dem,
            "processTimeMon": mon,
            "processTimeTotal": total,
            "dueDate": float(due),
            "family": family,
            "latestRelease": float(latest_release),
            "deferredCount": deferred_count
        })
    return enriched


# -----------------------------
# Einfache Vorschau der Auslastung im nächsten Bucket
# (gleichmäßige Verteilung des Los-Workloads über sein Fenster)
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
# Batches bauen (TF + Defer + Family + simples Util-Gate)
# - MUST: latestRelease ≤ Slot → muss raus (Terminschutz)
# - CAN: freiwillig; nur wenn Zielauslastung im nächsten Bucket eingehalten wird
# - Zurückstellen: CAN, die nicht passen → bleiben im Pool (deferredCount+1)
# -----------------------------
def build_batches(enriched: List[Dict[str, Any]], cfg: Dict[str, Any], now: float
                  ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    setup = cfg["setup"]
    T = int(cfg["intervalMinutes"])
    q_min = int(setup["qMin"])
    q_max = max(int(setup["qMax"]), q_min)
    min_batch = int(setup["minBatch"])
    alpha = float(cfg["windows"]["alpha"])
    beta = float(cfg["windows"]["beta"])
    m = max(1, int(cfg["machines"]))
    target_util = float(cfg.get("targetUtil", 0.5))

    # stabil sortieren: wer „früher“ muss, steht vorn
    pool = sorted(enriched, key=lambda o: (o["latestRelease"], o["dueDate"], o.get("createdAt", now)))
    batches: List[Dict[str, Any]] = []
    batch_idx = 1

    # Für Fenster-/Util-Berechnung brauchen wir eine Map
    orders_map = {o["orderId"]: o for o in enriched}

    # Slot-Schleife: wir gehen so lange vorwärts, bis der Pool leer ist
    slot_time = (int(now // T) + 1) * T
    deferred_registry = defaultdict(int)  # orderId -> wie oft zurückgestellt (nur dieses Run)

    while pool:
        # MUST: alles mit LPRT ≤ slot_time
        must = [o for o in pool if o["latestRelease"] <= slot_time]

        # 1) MUST-Batches: familienrein, bis q_max; q_min darf unterschritten werden
        fam_to_must = defaultdict(list)
        for o in must:
            fam_to_must[o["family"]].append(o)
        for fam, lst in list(fam_to_must.items()):
            lst.sort(key=lambda o: (o["dueDate"], o.get("createdAt", now)))
            while lst:
                chunk = lst[:q_max]
                lst = lst[q_max:]
                ids = [o["orderId"] for o in chunk]
                # aus pool entfernen
                pool = [o for o in pool if o["orderId"] not in ids]
                # Fenster ableiten
                work = sum(orders_map[i]["processTimeTotal"] for i in ids if i in orders_map)
                duration_est = work / m
                s_nom = float(slot_time)
                start_e = s_nom - alpha * duration_est
                start_l = s_nom + beta * duration_est
                end_e = start_e + duration_est
                end_l = start_l + duration_est

                batches.append({
                    "id": f"pap-batch-{batch_idx}",
                    "policy": "TF+DEFER",
                    "param": {"T": T},
                    "orderIds": ids,
                    "size": len(ids),
                    "releaseAt": float(slot_time),
                    "forced": True,
                    "windowStart": {"earliest": start_e, "latest": start_l},
                    "windowEnd": {"earliest": end_e, "latest": end_l}
                })
                batch_idx += 1

        if pool:
            can = [o for o in pool if o["latestRelease"] > slot_time]
            fam_to_can = defaultdict(list)
            for o in can:
                fam_to_can[o["family"]].append(o)

            if fam_to_can:
                fam_best, lst = max(fam_to_can.items(), key=lambda kv: len(kv[1]))
                lst.sort(key=lambda o: (o["dueDate"], o.get("createdAt", now)))

                if len(lst) >= min_batch:
                    take = min(q_max, len(lst))
                    candidate_ids = [o["orderId"] for o in lst[:take]]

                    # Probe-Fenster ermitteln (für Util-Prognose nächster Bucket)
                    work = sum(orders_map[i]["processTimeTotal"] for i in candidate_ids if i in orders_map)
                    duration_est = work / m
                    s_nom = float(slot_time)
                    start_e = s_nom - alpha * duration_est
                    start_l = s_nom + beta * duration_est
                    end_e = start_e + duration_est
                    end_l = start_l + duration_est

                    probe = {
                        "orderIds": candidate_ids,
                        "windowStart": {"earliest": start_e, "latest": start_l},
                        "windowEnd": {"earliest": end_e, "latest": end_l}
                    }
                    util_with = next_bucket_util(batches + [probe], orders_map, cfg, now)

                    if util_with <= target_util:
                        # Gate offen -> freigeben
                        pool = [o for o in pool if o["orderId"] not in candidate_ids]
                        batches.append({
                            "id": f"pap-batch-{batch_idx}",
                            "policy": "TF+DEFER",
                            "param": {"T": T},
                            "orderIds": candidate_ids,
                            "size": len(candidate_ids),
                            "releaseAt": float(slot_time),
                            "forced": False,
                            "windowStart": {"earliest": start_e, "latest": start_l},
                            "windowEnd": {"earliest": end_e, "latest": end_l}
                        })
                        batch_idx += 1
                    else:
                        # Gate zu -> wir stellen diese Kandidaten zurück (behalten sie im Pool)
                        for i in candidate_ids:
                            deferred_registry[i] += 1

        # nächster Slot
        slot_time += T

    deferred_list = [{"orderId": k, "deferredCount": v} for k, v in sorted(deferred_registry.items()) if v > 0]
    return batches, deferred_list


# -----------------------------
# ETA je Auftrag (einfach: Staffelung im Endfenster)
# -----------------------------
def build_eta_list(batches: List[Dict[str, Any]],
                   orders_map: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    eta_list: List[Dict[str, Any]] = []
    for b in batches:
        s_e = float(b["windowEnd"]["earliest"])
        s_l = float(b["windowEnd"]["latest"])
        n = max(1, len(b["orderIds"]))
        span = max(0.0, s_l - s_e)
        step = span / n if span > 0 else 0.0
        for i, oid in enumerate(b["orderIds"]):
            order = orders_map.get(oid)
            if order is None:
                continue
            p = order["processTimeTotal"]
            eta = s_e + (i + 0.5) * step
            eta_list.append({
                "orderId": oid,
                "eta": eta,
                "lower": eta - 0.1 * p,
                "upper": eta + 0.1 * p,
                "confidence": 0.7
            })
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
# CTP (Capable-to-Promise) – einfache, kapazitätsbewusste Zusage
# - wähle frühesten Slot, für den (Promise ≤ Hard-Deadline) UND (Util-Gate ok)
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
# MAIN
# -----------------------------
def main():
    payload = load_payload()
    now = float(payload.get("now", 0.0))
    cfg = apply_config_defaults(payload.get("config", {}))
    orders = payload.get("orders", [])
    new_orders = payload.get("newOrders", [])

    debug: List[Dict[str, Any]] = []
    debug.append({"stage": "INPUT", "now": now, "order_count": len(orders), "config_core": {
        "T": cfg["intervalMinutes"],
        "machines": cfg["machines"],
        "targetUtil": cfg["targetUtil"],
        "familyKey": cfg["setup"]["familyKey"]
    }})

    # 1) Enrichment
    enriched = enrich_orders(orders, cfg, now)
    orders_map = {o["orderId"]: o for o in enriched if "orderId" in o}

    # 2) Batching (TF + Defer + Family + Util-Gate + „Zurückstellen“)
    batches, deferred_list = build_batches(enriched, cfg, now)

    # 3) ETA je Auftrag (einfach)
    eta_list = build_eta_list(batches, orders_map)

    # 4) Bucket-Auslastung (Reporting)
    util_fc = utilization_forecast(batches, orders_map, cfg)

    # 5) CTP (optional)
    ctp_preview = []
    if isinstance(new_orders, list) and new_orders:
        ctp_preview = ctp_promise_orders(new_orders, batches, orders_map, cfg, now)

    debug.append({
        "stage": "SUMMARY",
        "batches": len(batches),
        "eta": len(eta_list),
        "utilBuckets": len(util_fc),
        "ctp": len(ctp_preview),
        "deferred": len(deferred_list)
    })

    result = {
        "batches": batches,
        "etaList": eta_list,
        "utilizationForecast": util_fc,
        "ctpPreview": ctp_preview,
        "deferredOrders": deferred_list,
        "debug": debug
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

