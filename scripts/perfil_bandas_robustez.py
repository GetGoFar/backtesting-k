# Robustez: ¿se mantiene "±50% mejora rtb con igual vol realizada" incluyendo 2008?
# Histórico largo con proxies USD (SP500/AGG/GLD) — incluye la crisis de 2008.
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

# proxies largos (incluyen 2008). SPY 1993, AGG 2003, GLD 2004
px={"RV":fm("SPY.US"),"RF":fm("AGG.US"),"Oro":fm("GLD.US")}
classes=["RV","RF","Oro"]
months=sorted(set(px["RV"])&set(px["RF"])&set(px["Oro"]))
rets={c:[px[c][months[i]]/px[c][months[i-1]]-1 for i in range(1,len(months))] for c in classes}
n=len(months)-1
print(f"Ventana LARGA: {months[1]} -> {months[-1]} ({n} meses, incluye 2008)\n")

def simulate(p0, band):  # band = rel fraction
    tgt=PROFILES[p0]; val=dict(tgt); pr=[]; tax=0; ann=0; ty=-1
    cost=dict(tgt)
    for i in range(n):
        tb=sum(val.values()); rp=sum(val[c]/tb*rets[c][i] for c in classes); pr.append(rp)
        for c in classes: val[c]*=(1+rets[c][i])
        tot=sum(val.values()); w={c:val[c]/tot for c in classes}
        if any(tgt[c]>0 and abs(w[c]-tgt[c])/tgt[c]>band for c in classes):
            yr=int(months[i+1][:4])
            if yr!=ty: ty=yr; ann=0
            gain=0
            for c in classes:
                t=tot*tgt[c]
                if val[c]-t>1e-9:
                    sold=val[c]-t; cbs=cost[c]*sold/val[c]; gain+=sold-cbs; cost[c]-=cbs
            # IRPF tramos (aprox: 19/21/23/27/28)
            def irpf(g):
                br=[(6000,.19),(44000,.21),(150000,.23),(150000,.27),(1e15,.28)]; t=0; rem=g
                for lim,rate in br:
                    x=min(rem,lim); t+=x*rate; rem-=x
                    if rem<=0: break
                return t
            tx=irpf(ann+gain)-irpf(max(0,ann)) if gain>0 else 0
            ann+=max(0,gain); tot-=tx; tax+=tx
            for c in classes:
                t=tot*tgt[c]
                if t-val[c]>1e-9: cost[c]+=t-val[c]
                val[c]=t
    vol=st.pstdev(pr)*math.sqrt(12)*100
    cagr=((sum(val.values())/1.0)**(12/n)-1)*100
    # max drawdown sobre la curva de equity bruta (riesgo de cola)
    eq=1.0; peak=1.0; mdd=0.0
    for r in pr:
        eq*=(1+r); peak=max(peak,eq); mdd=min(mdd,eq/peak-1)
    return cagr,vol,mdd*100

print(f"{'Banda':14}{'CAGR':>9}{'volRealiz':>11}{'CAGR/vol':>10}{'maxDD':>9}")
for band,lab in [(0.01,"±1%"),(0.10,"±10%"),(0.25,"±25%"),(0.50,"±50%"),(1.0,"±100% B&H")]:
    cs=[simulate(p,band) for p in range(1,11)]
    cagr=sum(c[0] for c in cs)/10; vol=sum(c[1] for c in cs)/10; mdd=sum(c[2] for c in cs)/10
    print(f"  {lab:12}{cagr:>8.2f}%{vol:>10.2f}%{cagr/vol:>10.2f}{mdd:>8.1f}%")
