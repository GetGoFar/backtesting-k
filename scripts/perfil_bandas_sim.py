# PROTOTIPO fase 2 — Calibracion vol ex-ante por perfil + simulacion con bandas.
import json, re, urllib.request, time, math, statistics as st

BT = r"C:\ClaudeTest\backtesting-k"
def readf(p):
    raw=open(p,'rb').read()
    for e in ('utf-8-sig','utf-8','latin-1'):
        try: return raw.decode(e)
        except: pass
    return raw.decode('utf-8','replace')

env={}
for l in readf(BT+r"\.env.local").splitlines():
    l=l.strip()
    if '=' in l and not l.startswith('#'):
        k,v=l.split('=',1); env[k.strip()]=v.strip().strip('"')
TOK=env['EODHD_API_TOKEN']

# escalera (de la fase 1)
ladder = json.load(open(BT+r"\scripts\perfil_bandas_ladder.json"))["ladder"]
PROFILES = {int(p): {k: w[k]/100.0 for k in ("RV","RF","Oro")} for p,w in ladder.items()}

def fetch_monthly(sym):
    url=f"https://eodhd.com/api/eod/{sym}?api_token={TOK}&fmt=json&period=m"
    with urllib.request.urlopen(url,timeout=60) as r: data=json.load(r)
    out={}
    for d in data:
        px=d.get('adjusted_close') or d.get('close')
        if px: out[d['date'][:7]]=px
    return out

px = {"RV":fetch_monthly("IWDA.AS"), "RF":fetch_monthly("AGG.US"), "Oro":fetch_monthly("8PSG.F")}
months = sorted(set(px["RV"]) & set(px["RF"]) & set(px["Oro"]))
classes=["RV","RF","Oro"]
# retornos mensuales en la ventana comun
rets={c:[] for c in classes}
for i in range(1,len(months)):
    m0,m1=months[i-1],months[i]
    for c in classes:
        rets[c].append(px[c][m1]/px[c][m0]-1)
ret_months = months[1:]
n=len(ret_months)
print(f"Ventana comun: {ret_months[0]} -> {ret_months[-1]} ({n} meses)")

# covarianza anualizada
mean={c:sum(rets[c])/n for c in classes}
def cov(a,b): return sum((rets[a][i]-mean[a])*(rets[b][i]-mean[b]) for i in range(n))/(n-1)
S={(a,b):cov(a,b)*12 for a in classes for b in classes}  # anualizada
def vol_exante(w):
    var=sum(w[a]*w[b]*S[(a,b)] for a in classes for b in classes)
    return math.sqrt(max(0,var))

# vol ex-ante por perfil (objetivo) -> fronteras
print("\n=== CALIBRACION: vol ex-ante por perfil (objetivo) ===")
sig={}
for p in range(1,11):
    sig[p]=vol_exante(PROFILES[p])
    print(f"  P{p:<3} RV={PROFILES[p]['RV']*100:>4.0f}%  vol ex-ante = {sig[p]*100:5.2f}%")
bounds=[(sig[p]+sig[p+1])/2 for p in range(1,10)]  # frontera p|p+1
print("  Fronteras (puntos medios):", [f"{b*100:.2f}%" for b in bounds])

def implied_profile(v):
    p=1
    for i,b in enumerate(bounds):
        if v>b: p=i+2
    return p

# --- simulacion con bandas relativas ---
def simulate(p0, band_rel=0.50):
    tgt=PROFILES[p0]
    val={c:tgt[c] for c in classes}  # valor por clase (suma 1)
    series=[]
    port_rets=[]
    rebal_months=[]
    for i in range(n):
        # aplicar retorno del mes i a los valores actuales (pesos de antes)
        tot_before=sum(val.values())
        w_before={c:val[c]/tot_before for c in classes}
        r_p=sum(w_before[c]*rets[c][i] for c in classes)
        port_rets.append(r_p)
        for c in classes: val[c]*=(1+rets[c][i])
        tot=sum(val.values())
        w={c:val[c]/tot for c in classes}
        # comprobar bandas relativas (solo clases con objetivo>0)
        breach=any(tgt[c]>0 and abs(w[c]-tgt[c])/tgt[c] > band_rel for c in classes)
        if breach:
            val={c:tgt[c] for c in classes}
            w=dict(tgt); rebal_months.append(ret_months[i])
        # vol realizada trailing 12m
        rv12=None
        if len(port_rets)>=12:
            rv12=st.pstdev(port_rets[-12:])*math.sqrt(12)
        ve=vol_exante(w)
        series.append({"mes":ret_months[i],"RV":round(w["RV"]*100,1),"RF":round(w["RF"]*100,1),
                       "Oro":round(w["Oro"]*100,1),"vol_ex":round(ve*100,2),
                       "perf_ex":implied_profile(ve),
                       "vol_re":round(rv12*100,2) if rv12 else None,
                       "perf_re":implied_profile(rv12) if rv12 else None})
    return series, rebal_months

# Resumen para los 10 perfiles (metrica ex-ante)
print("\n=== DERIVA DE PERFIL POR BANDAS (ex-ante) — bandas relativas +-50% ===")
print(f"{'Perfil':7}{'rebal':>7}{'=obj%':>8}{'<=±1%':>8}{'derivaMax':>11}{'RVmax%':>8}")
for p0 in range(1,11):
    series,rebals=simulate(p0,0.50)
    same=sum(1 for s in series if s["perf_ex"]==p0)/len(series)*100
    near=sum(1 for s in series if abs(s["perf_ex"]-p0)<=1)/len(series)*100
    maxdev=max(s["perf_ex"]-p0 for s in series)
    rvmax=max(s["RV"] for s in series)
    print(f"  P{p0:<4}{len(rebals):>7}{same:>7.0f}%{near:>7.0f}%{('+%d'%maxdev):>11}{rvmax:>8.1f}")

# Detalle del perfil 6 (el del ejemplo): primeros y mas extremos meses
print("\n=== PERFIL 6 — muestra mensual (deriva e implied profile) ===")
series,rebals=simulate(6,0.50)
print(f"  Rebalanceos por banda: {len(rebals)}  {rebals[:8]}{'...' if len(rebals)>8 else ''}")
# meses donde el perfil implicito difiere
diff=[s for s in series if s["perf_ex"]!=6]
print(f"  Meses fuera de perfil 6 (ex-ante): {len(diff)}/{len(series)} ({len(diff)/len(series)*100:.0f}%)")
print(f"  {'mes':9}{'RV%':>6}{'RF%':>6}{'Oro%':>6}{'volEx':>7}{'pEx':>5}{'volRe':>7}{'pRe':>5}")
for s in series[::8]:  # cada 8 meses, muestra
    print(f"  {s['mes']:9}{s['RV']:>6}{s['RF']:>6}{s['Oro']:>6}{s['vol_ex']:>7}{s['perf_ex']:>5}{str(s['vol_re']):>7}{str(s['perf_re']):>5}")
