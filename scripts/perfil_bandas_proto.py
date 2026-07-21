# PROTOTIPO — Estudio CNMV: deriva de perfil bajo rebalanceo por bandas.
# 1) Extrae la escalera de los 10 perfiles K Geografica UCIT (pesos RV/RF/Oro).
# 2) Descarga retornos mensuales de proxies de clase de activo (EODHD).
# 3) Calibra la volatilidad ex-ante de cada perfil -> fronteras entre perfiles.
# Esta fase solo valida la CALIBRACION (perfil -> vol). La simulacion va aparte.
import json, re, urllib.request, urllib.error, time
import math

BT = r"C:\ClaudeTest\backtesting-k"

def readf(p):
    raw=open(p,'rb').read()
    for e in ('utf-8-sig','utf-8','latin-1'):
        try: return raw.decode(e)
        except: pass
    return raw.decode('utf-8','replace')

# ---- 1) categorias de fondos (id -> category) ----
fdb = readf(BT+r"\src\lib\fund-database.ts")
cat_by_id = {}
for m in re.finditer(r'id:\s*"([^"]+)".*?category:\s*"([^"]+)"', fdb, re.S):
    fid, cat = m.group(1), m.group(2)
    if fid not in cat_by_id:
        cat_by_id[fid] = cat

def asset_class(cat):
    if cat.startswith("RV"): return "RV"
    if cat.startswith("RF"): return "RF"
    if cat == "Oro": return "Oro"
    return "Alt"

# ---- 2) escalera de perfiles geo-ucit 1..10 ----
pp = readf(BT+r"\src\lib\portfolio-presets.ts")
def profile_weights(family, p):
    # localizar el bloque del preset family-p
    m = re.search(r'id:\s*"'+re.escape(f"{family}-{p}")+r'"(.*?)\n  \},', pp, re.S)
    if not m: return None
    block = m.group(1)
    w = {"RV":0.0,"RF":0.0,"Oro":0.0,"Alt":0.0}
    for hm in re.finditer(r'fundId:\s*"([^"]+)",\s*weight:\s*([0-9.]+)', block):
        fid, wt = hm.group(1), float(hm.group(2))
        cls = asset_class(cat_by_id.get(fid,"RV"))
        w[cls]+=wt
    return w

print("=== ESCALERA DE PERFILES (K Geografica UCIT) — pesos objetivo ===")
print(f"{'Perfil':7}{'RV%':>7}{'RF%':>7}{'Oro%':>7}{'Alt%':>7}{'suma':>7}")
ladder = {}
for p in range(1,11):
    w = profile_weights("k-geografica-ucit", p)
    if not w: print(f"  P{p}: NO ENCONTRADO"); continue
    ladder[p]=w
    s=sum(w.values())
    print(f"  P{p:<4}{w['RV']:>7.1f}{w['RF']:>7.1f}{w['Oro']:>7.1f}{w['Alt']:>7.1f}{s:>7.1f}")

# ---- 3) proxies de clase de activo (EODHD) ----
env={}
for l in readf(BT+r"\.env.local").splitlines():
    l=l.strip()
    if '=' in l and not l.startswith('#'):
        k,v=l.split('=',1); env[k.strip()]=v.strip().strip('"')
TOK=env['EODHD_API_TOKEN']

def fetch_monthly(sym):
    url=f"https://eodhd.com/api/eod/{sym}?api_token={TOK}&fmt=json&period=m"
    try:
        with urllib.request.urlopen(url,timeout=60) as r: data=json.load(r)
        if not isinstance(data,list) or len(data)<24: return None
        out={}
        for d in data:
            px=d.get('adjusted_close') or d.get('close')
            if px: out[d['date'][:7]]=px
        return out
    except Exception as e:
        return {"__err__":str(e)[:40]}

# candidatos por clase (preferimos historico largo, EUR si posible)
candidates = {
 "RV":  ["IWDA.AS","URTH.US","SWDA.L","GSPC.INDX","SPY.US"],
 "RF":  ["AGGH.MI","AGG.US","IEAG.AS","VAGF.L","SEGA.L"],
 "Oro": ["8PSG.F","GLD.US","SGLN.L","XAUUSD.FOREX"],
}
print("\n=== PROXIES DISPONIBLES (meses de historico) ===")
chosen={}
series={}
for cls, syms in candidates.items():
    for sym in syms:
        d=fetch_monthly(sym); time.sleep(0.12)
        if d and "__err__" not in d and len(d)>=60:
            print(f"  {cls:4} {sym:16} {len(d)} meses  ({min(d)} -> {max(d)})")
            chosen[cls]=sym; series[cls]=d; break
        else:
            n = (len(d) if d and '__err__' not in d else (d or {}).get('__err__','-'))
            print(f"  {cls:4} {sym:16} descartado ({n})")
    if cls not in chosen:
        print(f"  {cls:4} SIN PROXY VALIDO")

json.dump({"ladder":{str(k):v for k,v in ladder.items()}, "chosen":chosen}, open(BT+r"\scripts\perfil_bandas_ladder.json","w"), indent=1)
print("\nProxies elegidos:", chosen)
