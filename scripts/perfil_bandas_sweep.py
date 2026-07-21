# Sensibilidad: amplitud de banda -> estabilidad del perfil (metrica ex-ante).
import json, urllib.request, math, statistics as st

BT=r"C:\ClaudeTest\backtesting-k"
def readf(p):
    raw=open(p,'rb').read()
    for e in ('utf-8-sig','utf-8','latin-1'):
        try: return raw.decode(e)
        except: pass
env={}
for l in readf(BT+r"\.env.local").splitlines():
    l=l.strip()
    if '=' in l and not l.startswith('#'):
        k,v=l.split('=',1); env[k.strip()]=v.strip().strip('"')
TOK=env['EODHD_API_TOKEN']
ladder=json.load(open(BT+r"\scripts\perfil_bandas_ladder.json"))["ladder"]
PROFILES={int(p):{k:w[k]/100.0 for k in("RV","RF","Oro")} for p,w in ladder.items()}
def fm(sym):
    with urllib.request.urlopen(f"https://eodhd.com/api/eod/{sym}?api_token={TOK}&fmt=json&period=m",timeout=60) as r:
        return {d['date'][:7]:(d.get('adjusted_close') or d.get('close')) for d in json.load(r) if (d.get('adjusted_close') or d.get('close'))}
px={"RV":fm("IWDA.AS"),"RF":fm("AGG.US"),"Oro":fm("8PSG.F")}
classes=["RV","RF","Oro"]
months=sorted(set(px["RV"])&set(px["RF"])&set(px["Oro"]))
rets={c:[px[c][months[i]]/px[c][months[i-1]]-1 for i in range(1,len(months))] for c in classes}
n=len(months)-1
mean={c:sum(rets[c])/n for c in classes}
S={(a,b):sum((rets[a][i]-mean[a])*(rets[b][i]-mean[b]) for i in range(n))/(n-1)*12 for a in classes for b in classes}
def vol(w): return math.sqrt(max(0,sum(w[a]*w[b]*S[(a,b)] for a in classes for b in classes)))
sig={p:vol(PROFILES[p]) for p in range(1,11)}
bounds=[(sig[p]+sig[p+1])/2 for p in range(1,10)]
def implied(v):
    p=1
    for i,b in enumerate(bounds):
        if v>b: p=i+2
    return p

def simulate(p0, band, mode):
    tgt=PROFILES[p0]; val=dict(tgt); profs=[]; rebals=0
    for i in range(n):
        for c in classes: val[c]*=(1+rets[c][i])
        tot=sum(val.values()); w={c:val[c]/tot for c in classes}
        if mode=="rel": breach=any(tgt[c]>0 and abs(w[c]-tgt[c])/tgt[c]>band for c in classes)
        else:           breach=any(abs(w[c]-tgt[c])>band for c in classes)
        if breach: val=dict(tgt); w=dict(tgt); rebals+=1
        profs.append(implied(vol(w)))
    same=sum(1 for p in profs if p==p0)/len(profs)*100
    near=sum(1 for p in profs if abs(p-p0)<=1)/len(profs)*100
    maxdev=max(p-p0 for p in profs)
    return same,near,maxdev,rebals

bands=[("rel",0.10,"±10% rel"),("rel",0.15,"±15% rel"),("rel",0.20,"±20% rel"),
       ("rel",0.25,"±25% rel"),("rel",0.50,"±50% rel"),
       ("abs",0.02,"±2 pp abs"),("abs",0.05,"±5 pp abs"),("abs",0.10,"±10 pp abs")]

print(f"Ventana: {months[1]} -> {months[-1]} ({n} meses)\n")
print("=== PERFIL 6 — estabilidad segun amplitud de banda (ex-ante) ===")
print(f"{'Banda':12}{'=obj%':>8}{'<=±1%':>8}{'derivaMax':>11}{'rebal/13a':>11}")
for mode,b,lab in bands:
    same,near,mx,rb=simulate(6,b,mode)
    print(f"  {lab:12}{same:>7.0f}%{near:>7.0f}%{('+%d'%mx):>11}{rb:>11}")

print("\n=== MEDIA de los 10 perfiles — % meses EN perfil (=obj) y <=±1 ===")
print(f"{'Banda':12}{'=obj%':>8}{'<=±1%':>8}{'rebal/13a':>11}")
for mode,b,lab in bands:
    res=[simulate(p,b,mode) for p in range(1,11)]
    same=sum(r[0] for r in res)/10; near=sum(r[1] for r in res)/10; rb=sum(r[3] for r in res)/10
    print(f"  {lab:12}{same:>7.0f}%{near:>7.0f}%{rb:>11.1f}")
