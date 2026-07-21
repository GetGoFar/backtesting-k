# Genera gráficos + numbers.json para el documento CNMV.
import json, os, urllib.request, math, statistics as st
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

BT=r"C:\ClaudeTest\backtesting-k"
OUT=os.path.join(BT,"scripts","cnmv"); os.makedirs(OUT,exist_ok=True)
RED="#C81E2E"; NAVY="#202020"; BEIGE="#F5F0EB"; BLUE="#1d4ed8"; GOLD="#B8860B"; GREY="#8a8a8a"
plt.rcParams.update({"font.family":"DejaVu Sans","axes.edgecolor":"#cccccc","axes.grid":True,
    "grid.color":"#e8e8e8","figure.facecolor":"white","axes.facecolor":"white"})

def readf(p):
    raw=open(p,'rb').read()
    for e in('utf-8-sig','utf-8','latin-1'):
        try: return raw.decode(e)
        except: pass
env={}
for l in readf(BT+r"\.env.local").splitlines():
    l=l.strip()
    if '=' in l and not l.startswith('#'): k,v=l.split('=',1); env[k.strip()]=v.strip().strip('"')
TOK=env['EODHD_API_TOKEN']
ladder=json.load(open(BT+r"\scripts\perfil_bandas_ladder.json"))["ladder"]
PROFILES={int(p):{k:w[k]/100.0 for k in("RV","RF","Oro")} for p,w in ladder.items()}
def fm(sym):
    with urllib.request.urlopen(f"https://eodhd.com/api/eod/{sym}?api_token={TOK}&fmt=json&period=m",timeout=60) as r:
        return {d['date'][:7]:(d.get('adjusted_close') or d.get('close')) for d in json.load(r) if (d.get('adjusted_close') or d.get('close'))}

CLS=["RV","RF","Oro"]
def build(rv,rf,oro):
    px={"RV":fm(rv),"RF":fm(rf),"Oro":fm(oro)}
    months=sorted(set(px["RV"])&set(px["RF"])&set(px["Oro"]))
    rets={c:[px[c][months[i]]/px[c][months[i-1]]-1 for i in range(1,len(months))] for c in CLS}
    rm=months[1:]; n=len(rm)
    mean={c:sum(rets[c])/n for c in CLS}
    S={(a,b):sum((rets[a][i]-mean[a])*(rets[b][i]-mean[b]) for i in range(n))/(n-1)*12 for a in CLS for b in CLS}
    def vol(w): return math.sqrt(max(0,sum(w[a]*w[b]*S[(a,b)] for a in CLS for b in CLS)))
    sig={p:vol(PROFILES[p]) for p in range(1,11)}
    bounds=[(sig[p]+sig[p+1])/2 for p in range(1,10)]
    def implied(v):
        p=1
        for i,b in enumerate(bounds):
            if v>b: p=i+2
        return p
    def irpf(g):
        br=[(6000,.19),(44000,.21),(150000,.23),(150000,.27),(1e15,.28)];t=0;rem=g
        for lim,rate in br:
            x=min(rem,lim);t+=x*rate;rem-=x
            if rem<=0:break
        return t
    def sim(p0,band,init=100000):
        tgt=PROFILES[p0];val={c:init*tgt[c] for c in CLS};cost=dict(val);pr=[];tax=0;ann=0;ty=-1;ser=[]
        for i in range(n):
            tb=sum(val.values());rp=sum(val[c]/tb*rets[c][i] for c in CLS);pr.append(rp)
            for c in CLS: val[c]*=(1+rets[c][i])
            tot=sum(val.values());w={c:val[c]/tot for c in CLS}
            if any(tgt[c]>0 and abs(w[c]-tgt[c])/tgt[c]>band for c in CLS):
                yr=int(rm[i][:4])
                if yr!=ty: ty=yr;ann=0
                gain=0
                for c in CLS:
                    t=tot*tgt[c]
                    if val[c]-t>1e-9: sold=val[c]-t;cbs=cost[c]*sold/val[c];gain+=sold-cbs;cost[c]-=cbs
                tx=irpf(ann+gain)-irpf(max(0,ann)) if gain>0 else 0
                ann+=max(0,gain);tot-=tx;tax+=tx
                for c in CLS:
                    t=tot*tgt[c]
                    if t-val[c]>1e-9: cost[c]+=t-val[c]
                    val[c]=t
                w=dict(tgt)
            ser.append({"m":rm[i],"impl":implied(vol(w)),"volEx":vol(w)*100,"RV":w["RV"]*100})
        eq=1.0;peak=1.0;mdd=0.0
        for r in pr: eq*=(1+r);peak=max(peak,eq);mdd=min(mdd,eq/peak-1)
        volr=st.pstdev(pr)*math.sqrt(12)*100; cagr=((sum(val.values())/init)**(12/n)-1)*100
        return {"cagr":cagr,"vol":volr,"mdd":mdd*100,"tax":tax,"final":sum(val.values()),"ser":ser}
    return dict(rm=rm,n=n,sig=sig,bounds=bounds,implied=implied,sim=sim,first=rm[0],last=rm[-1])

print("Construyendo ventana principal (2013-2026, IWDA/AGG/8PSG)...")
M=build("IWDA.AS","AGG.US","8PSG.F")
print("Construyendo ventana robustez (2004-2026, SPY/AGG/GLD, incl 2008)...")
L=build("SPY.US","AGG.US","GLD.US")

BANDS=[(0.01,"±1%"),(0.10,"±10%"),(0.20,"±20%"),(0.25,"±25%"),(0.50,"±50%"),(1.0,"B&H")]
def sweep(W):
    out=[]
    for band,lab in BANDS:
        rs=[W["sim"](p,band) for p in range(1,11)]
        out.append(dict(band=band,label=lab,
            cagr=sum(r["cagr"] for r in rs)/10, vol=sum(r["vol"] for r in rs)/10,
            mdd=sum(r["mdd"] for r in rs)/10, tax=sum(r["tax"] for r in rs)/10,
            within1=sum(sum(1 for s in r["ser"] if abs(s["impl"]-p)<=1)/len(r["ser"]) for p,r in zip(range(1,11),rs))/10*100,
            onp=sum(sum(1 for s in r["ser"] if s["impl"]==p)/len(r["ser"]) for p,r in zip(range(1,11),rs))/10*100))
    return out
swM=sweep(M); swL=sweep(L)

# ---- Gráfico 1: calibración escalera ----
fig,ax=plt.subplots(figsize=(8,4.2))
ps=list(range(1,11)); vols=[M["sig"][p]*100 for p in ps]; rvs=[PROFILES[p]["RV"]*100 for p in ps]
ax.plot(ps,vols,"-o",color=RED,lw=2.4,ms=7,zorder=3)
for p,v,rv in zip(ps,vols,rvs): ax.annotate(f"{v:.1f}%",(p,v),textcoords="offset points",xytext=(0,9),ha="center",fontsize=8,color=NAVY)
ax.set_xticks(ps); ax.set_xlabel("Perfil de riesgo (Cartera K)"); ax.set_ylabel("Volatilidad ex-ante (anualizada)")
ax.set_title("Calibración: volatilidad ex-ante de cada perfil objetivo",color=NAVY,fontweight="bold")
ax.yaxis.set_major_formatter(PercentFormatter())
ax2=ax.twinx(); ax2.bar(ps,rvs,alpha=0.12,color=BLUE,zorder=1); ax2.set_ylabel("% Renta Variable (barras)",color=BLUE); ax2.set_ylim(0,100); ax2.grid(False)
fig.tight_layout(); fig.savefig(os.path.join(OUT,"fig1_calibracion.png"),dpi=150); plt.close()

# ---- Gráfico 2: deriva de la etiqueta de perfil (P6, ventana principal) ----
r6=M["sim"](6,0.50); ser=r6["ser"]
fig,ax=plt.subplots(figsize=(9,3.6))
xs=list(range(len(ser))); impl=[s["impl"] for s in ser]
ax.axhspan(5,7,color=BLUE,alpha=0.07,zorder=0,label="banda ±1 perfil")
ax.step(xs,impl,where="post",color=RED,lw=1.8,label="Perfil implícito (etiqueta ex-ante)")
ax.axhline(6,color=NAVY,ls="--",lw=1.3,label="Perfil objetivo (6)")
tk=[i for i in xs if ser[i]["m"].endswith("-01")]; ax.set_xticks(tk); ax.set_xticklabels([ser[i]["m"][:4] for i in tk],fontsize=8)
ax.set_yticks(range(4,11)); ax.set_ylabel("Perfil"); ax.set_title("Deriva de la ETIQUETA de perfil — Perfil 6, bandas ±50%",color=NAVY,fontweight="bold")
ax.legend(loc="upper left",fontsize=8,framealpha=.9); fig.tight_layout(); fig.savefig(os.path.join(OUT,"fig2_deriva_p6.png"),dpi=150); plt.close()

# ---- Gráfico 3: rentabilidad vs riesgo REAL por banda (principal) ----
fig,ax=plt.subplots(figsize=(8,4.4))
labs=[s["label"] for s in swM]; x=range(len(labs))
ax.bar([i-0.2 for i in x],[s["cagr"] for s in swM],0.38,color=RED,label="CAGR neto")
ax.bar([i+0.2 for i in x],[s["vol"] for s in swM],0.38,color=GREY,label="Vol realizada")
for i,s in enumerate(swM):
    ax.text(i-0.2,s["cagr"]+0.05,f"{s['cagr']:.2f}",ha="center",fontsize=7,color=NAVY)
    ax.text(i+0.2,s["vol"]+0.05,f"{s['vol']:.2f}",ha="center",fontsize=7,color=NAVY)
ax.set_xticks(list(x)); ax.set_xticklabels(labs); ax.set_ylabel("% anualizado")
ax.set_title("Rentabilidad sube, riesgo REAL (vol realizada) NO — por banda",color=NAVY,fontweight="bold")
ax.legend(fontsize=9); ax.yaxis.set_major_formatter(PercentFormatter()); fig.tight_layout(); fig.savefig(os.path.join(OUT,"fig3_rtb_vs_riesgo.png"),dpi=150); plt.close()

# ---- Gráfico 4: fiscalidad (impuesto/perfil) vs estabilidad ±1 por banda ----
fig,ax=plt.subplots(figsize=(8,4.2))
ax.plot(labs,[s["tax"] for s in swM],"-o",color=RED,lw=2,label="Impuesto IRPF medio / perfil (€)")
ax.set_ylabel("€ impuesto (13 años, 100k)",color=RED); ax.set_xlabel("Banda")
ax.set_title("Coste fiscal por banda — se satura; ±50% no paga más que ±25%",color=NAVY,fontweight="bold")
for i,s in enumerate(swM): ax.annotate(f"{s['tax']:,.0f}€",(i,s["tax"]),textcoords="offset points",xytext=(0,8),ha="center",fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(OUT,"fig4_fiscalidad.png"),dpi=150); plt.close()

# ---- numbers.json ----
out=dict(
  main=dict(first=M["first"],last=M["last"],n=M["n"],
            ladder=[dict(p=p,rv=PROFILES[p]["RV"]*100,rf=PROFILES[p]["RF"]*100,oro=PROFILES[p]["Oro"]*100,vol=M["sig"][p]*100) for p in range(1,11)],
            sweep=swM, p6=dict(within1=sum(1 for s in ser if abs(s["impl"]-6)<=1)/len(ser)*100,
                               onp=sum(1 for s in ser if s["impl"]==6)/len(ser)*100,
                               maxImpl=max(s["impl"] for s in ser), maxRV=max(s["RV"] for s in ser),
                               volMin=min(s["volEx"] for s in ser), volMax=max(s["volEx"] for s in ser),
                               rebal=sum(1 for i in range(1,len(ser)) if ser[i]["impl"]!=ser[i-1]["impl"] and False) )),
  robust=dict(first=L["first"],last=L["last"],n=L["n"],sweep=swL),
)
json.dump(out,open(os.path.join(OUT,"numbers.json"),"w"),indent=1)
print("\nGráficos + numbers.json en", OUT)
print("Principal:",M["first"],"->",M["last"],"| Robustez:",L["first"],"->",L["last"])
print("\nSWEEP principal:")
for s in swM: print(f"  {s['label']:6} CAGR {s['cagr']:.2f}% vol {s['vol']:.2f}% mdd {s['mdd']:.1f}% tax {s['tax']:,.0f} ±1 {s['within1']:.0f}% onp {s['onp']:.0f}%")
