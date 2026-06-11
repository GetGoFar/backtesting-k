# Tests empíricos de invariantes del motor (se borra tras la auditoría)
import json, urllib.request

API = "http://localhost:3100/api/backtest"

def run(cfg):
    req = urllib.request.Request(API, data=json.dumps(cfg).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

base = {
    "startDate": "2000-01-01", "endDate": "2026-06-01",
    "initialAmount": 10000, "rebalanceFrequency": "monthly",
    "displayGranularity": "monthly", "useCommonDateRange": True,
}

# --- T1: I1 — cartera 2 fondos, rebalanceo mensual (realiza plusvalías), SIN impuestos
t1 = run({**base, "monthlyContribution": 500,
          "portfolioA": {"name": "NoTax", "holdings": [
              {"fundId": "spdr-spy", "weight": 60},
              {"fundId": "vanguard-vfinx", "weight": 40}]}})
fa = t1["resultA"]["fees"]
print("T1 sin impuestos:")
print("  totalTaxesPaid:", fa.get("totalTaxesPaid"), " pendingTaxes:", fa.get("pendingTaxes"),
      " taxMode:", fa.get("taxMode"))
print("  PASS I1" if not fa.get("totalTaxesPaid") and not fa.get("pendingTaxes") else "  *** FAIL I1 ***")
print("  rebalanceLog taxPaid>0 events:",
      sum(1 for e in t1["resultA"].get("rebalanceLog", []) if e.get("taxPaid", 0) > 0))

# --- T2: control — misma cartera CON flat 19% → debe haber impuestos
t2 = run({**base, "monthlyContribution": 500,
          "portfolioA": {"name": "Tax19", "taxMode": "flat", "taxRate": 0.19,
                          "holdings": [
              {"fundId": "spdr-spy", "weight": 60},
              {"fundId": "vanguard-vfinx", "weight": 40}]}})
fb = t2["resultA"]["fees"]
print("\nT2 flat 19%:")
print("  totalTaxesPaid:", fb.get("totalTaxesPaid"), " pendingTaxes:", fb.get("pendingTaxes"))
print("  PASS (impuestos>0)" if (fb.get("totalTaxesPaid") or 0) > 0 else "  *** FAIL: no computa impuestos ***")
# El valor final con impuestos debe ser MENOR que sin impuestos
v1, v2 = t1["resultA"]["finalValue"], t2["resultA"]["finalValue"]
print(f"  finalValue noTax={v1:,.0f} vs tax={v2:,.0f} ->", "PASS" if v2 < v1 else "*** FAIL ***")

# --- T3: I2 — un solo fondo, sin aportaciones: TWRR == finalValue/initial - 1
t3 = run({**base, "monthlyContribution": 0,
          "portfolioA": {"name": "Single", "holdings": [{"fundId": "spdr-spy", "weight": 100}]}})
ra = t3["resultA"]
simple = ra["finalValue"] / 10000 - 1
twrr = ra["metrics"]["totalReturn"]
diff = abs(simple - twrr) / max(1e-9, abs(simple))
print("\nT3 TWRR sin flujos:")
print(f"  simple={simple:.4f} twrr={twrr:.4f} diff_rel={diff:.4%} ->", "PASS" if diff < 0.005 else "*** FAIL I2 ***")

# --- T4: consistencia serie/finalValue
last = ra["timeSeries"][-1]["value"]
print("\nT4 ultima serie == finalValue:", f"{last:,.2f} vs {ra['finalValue']:,.2f}",
      "PASS" if abs(last - ra["finalValue"]) < 1 else "*** FAIL ***")

# --- T5: con aportaciones, TWRR != money-weighted pero el valor final cuadra con contribuciones
rc = t1["resultA"]
print("\nT5 contribuciones: totalContributions =", rc.get("totalContributions"),
      "(esperado 10000 + 500*meses)")
