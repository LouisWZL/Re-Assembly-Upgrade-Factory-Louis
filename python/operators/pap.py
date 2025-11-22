#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAP-Lite: sehr schlanke Grobterminierung für Re-Assembly

Zweck (kurz):
- Fensterbasierte Batchbildung mit fester Dauer T (T-Policy).
- Reihenfolge: EDD (Earliest Due Date; Fallback createdAt).
- ETA je Auftrag: Batch-Ende + einfache Staffelung + Prozesszeit.
- Liefertermin: konservativ = obere ETA-Schranke + Versandpuffer.

Annahmen:
- Erwartete Rückläufe ~ Poisson mit Rate lambda pro Stunde (nur für qMin_auto).
- Prozesszeit = Demontage + Montage (Defaults, falls nicht angegeben).
- Zeiten in Minuten (sim/epoch – konsistent innerhalb deiner App).

Eingabe (stdin, JSON):
{
  "now": 1734716400,
  "orders": [
    {"orderId":"O1","createdAt":1734712800,"dueDate":1734802800,
     "processTimeDem":60,"processTimeMon":80}
  ],
  "config": {
    "T_minutes": 240,               # Fensterlänge
    "lambda": 4.0,                  # Rückläufe pro Stunde (für qMin_auto)
    "qMin_auto": true,              # falls true: qMin = ceil(lambda * T/60 * alpha)
    "qMin_alpha": 0.8,              # Sicherheitsfaktor für qMin_auto
    "qMin": 3,                      # nur genutzt, wenn qMin_auto=false
    "outboundBufferMinutes": 0,     # Versand/Verpackung
    "eta_proc_pct": 0.10,           # ± Anteile für ETA-Band (Prozesszeit)
    "eta_poisson_pct": 0.25         # ± Anteil von (T_minutes) als Timing-Band
  }
}

Ausgabe (stdout, JSON):
{
  "batches": [
    {"id":"batch-1","orderIds":["O1","O2"],
     "window":{"start":1734716400,"end":1734716400+240},"releaseAt":1734716400+240}
  ],
  "etaList": [{"orderId":"O1","eta":..., "lower":..., "upper":..., "confidence":0.6}],
  "deliveryList": [{"orderId":"O1","deliveryAt":..., "basis":"upper+buffer"}],
  "debug": {...}
}
"""

import json
import math
import sys
from typing import Dict, List, Any, Tuple

# ---------- Helpers ----------
def load_payload() -> Dict[str, Any]:
    text = sys.stdin.read()
    return json.loads(text) if text else {"orders": [], "config": {}, "now": 0}

def f(x, d=0.0) -> float:
    try:
        return float(x)
    except Exception:
        return d

def proc_time(o: Dict[str, Any]) -> float:
    return max(0.0, f(o.get("processTimeDem"), 60.0)) + max(0.0, f(o.get("processTimeMon"), 90.0))

def sort_edd(orders: List[Dict[str, Any]], now: float) -> List[Dict[str, Any]]:
    return sorted(orders, key=lambda o: (o.get("dueDate", math.inf), o.get("createdAt", now)))

# ---------- Core: windowed T-Policy ----------
def build_batches_T(
    orders_sorted: List[Dict[str, Any]], now: float, T_minutes: float,
    qmin: int
) -> List[Dict[str, Any]]:
    """
    Bildet fortlaufende Fenster [now, now+T), [now+T, now+2T), ...
    Zuweisung: alle Orders mit createdAt < window_end kommen in das aktuelle Fenster.
    Falls < qmin, werden sie trotzdem grob geplant (Ziel: Einfachheit).
    releaseAt = window_end (konservative Startannahme).
    """
    batches = []
    if not orders_sorted:
        return batches

    # wir laufen Fensterweise vorwärts, bis alle Orders zugewiesen sind
    idx = 0
    n = len(orders_sorted)
    window_start = now
    window_end = now + T_minutes
    batch_id = 1

    while idx < n:
        bucket = []
        while idx < n and f(orders_sorted[idx].get("createdAt"), now) < window_end:
            bucket.append(orders_sorted[idx]["orderId"])
            idx += 1

        # auch wenn bucket < qmin: wir planen (grob) trotzdem, um simpel zu bleiben
        batches.append({
            "id": f"batch-{batch_id}",
            "orderIds": bucket,
            "window": {"start": window_start, "end": window_end},
            "releaseAt": window_end,
            "size": len(bucket),
            "notes": f"T-window; qmin={qmin}, size={len(bucket)}"
        })
        batch_id += 1
        window_start = window_end
        window_end = window_start + T_minutes

    return batches

# ---------- ETA & Delivery ----------
def eta_plan(
    orders_sorted: List[Dict[str, Any]],
    batches: List[Dict[str, Any]],
    eta_proc_pct: float,
    eta_poisson_pct: float,
    T_minutes: float
) -> List[Dict[str, Any]]:
    """
    ETA = batch.releaseAt + einfache Staffelung + eigene Prozesszeit.
    Unsicherheitsband: ±(eta_proc_pct * Prozesszeit + eta_poisson_pct * T_minutes).
    Staffelung: 10 % der eigenen Prozesszeit pro Position im Batch.
    """
    # Index orderId -> (releaseAt, pos)
    placement: Dict[str, Tuple[float, int]] = {}
    for b in batches:
        rel = f(b.get("releaseAt"), 0.0)
        for pos, oid in enumerate(b.get("orderIds", [])):
            placement[oid] = (rel, pos)

    out = []
    for o in orders_sorted:
        oid = o["orderId"]
        rel, pos = placement.get(oid, (f(o.get("createdAt")), 0))
        p = proc_time(o)
        stage = 0.10 * p * pos
        eta = rel + stage + p
        delta = eta_proc_pct * p + eta_poisson_pct * T_minutes
        out.append({
            "orderId": oid,
            "eta": eta,
            "lower": eta - delta,
            "upper": eta + delta,
            "confidence": 0.6
        })
    return out

def delivery_plan(eta_list: List[Dict[str, Any]], buffer_min: float) -> List[Dict[str, Any]]:
    """
    Liefertermin = obere ETA-Schranke + Versandpuffer (konservativ, grobplanerisch).
    """
    out = []
    for e in eta_list:
        delivery_at = f(e.get("upper"), e["eta"]) + buffer_min
        out.append({
            "orderId": e["orderId"],
            "deliveryAt": delivery_at,
            "basis": "upper+buffer",
            "components": {"eta_upper": f(e.get("upper"), e["eta"]), "buffer": buffer_min}
        })
    return out

# ---------- Main ----------
def main():
    payload = load_payload()
    now = f(payload.get("now"), 0.0)
    orders = payload.get("orders", [])
    cfg = payload.get("config", {})

    T_minutes = f(cfg.get("T_minutes"), 240.0)
    lam = f(cfg.get("lambda"), 4.0)
    qmin_auto = bool(cfg.get("qMin_auto", True))
    alpha = f(cfg.get("qMin_alpha"), 0.8)
    qmin_cfg = int(cfg.get("qMin", 3))
    buffer_min = f(cfg.get("outboundBufferMinutes"), 0.0)
    eta_proc_pct = f(cfg.get("eta_proc_pct"), 0.10)
    eta_poisson_pct = f(cfg.get("eta_poisson_pct"), 0.25)

    # qMin-Autowert aus erwarteten Ankünften im Fenster
    # Erwartete Ankünfte im Fenster: lambda * (T/60). Sicherheitsfaktor alpha.
    qmin = max(1, int(math.ceil(lam * (T_minutes / 60.0) * alpha))) if qmin_auto else qmin_cfg

    orders_sorted = sort_edd(orders, now)

    batches = build_batches_T(orders_sorted, now, T_minutes, qmin)
    eta_list = eta_plan(orders_sorted, batches, eta_proc_pct, eta_poisson_pct, T_minutes)
    delivery_list = delivery_plan(eta_list, buffer_min)

    out = {
        "batches": batches,
        "etaList": eta_list,
        "deliveryList": delivery_list,
        "debug": {
            "now": now,
            "config_used": {
                "T_minutes": T_minutes,
                "lambda": lam,
                "qMin_auto": qmin_auto,
                "qMin_alpha": alpha,
                "qMin_effective": qmin,
                "outboundBufferMinutes": buffer_min,
                "eta_proc_pct": eta_proc_pct,
                "eta_poisson_pct": eta_poisson_pct
            },
            "counts": {"orders": len(orders), "batches": len(batches)}
        }
    }
    print(json.dumps(out))

if __name__ == "__main__":
    main()
