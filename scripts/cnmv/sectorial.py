# Estudio CNMV — versión SECTORIAL OFICIAL (Cartera Core El Proyecto K v3.0).
# Composición y bandas de volatilidad OFICIALES del Excel del cliente.
import json, os, urllib.request, math, statistics as st
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

BT=r"C:\ClaudeTest\backtesting-k"; OUT=os.path.join(BT,"scripts","cnmv"); os.makedirs(OUT,exist_ok=True)
RED="#C81E2E"; NAVY="#202020"; BLUE="#1d4ed8"; GREY="#8a8a8a"
plt.rcParams.update({"font.family":"DejaVu Sans","axes.grid":True,"grid.color":"#e8e8e8","axes.edgecolor":"#cccccc"})
def re(p):
    raw=open(p,'rb').read()
    for e in('utf-8-sig','utf-8','latin-1'):
        try:return raw.decode(e)
        except:pass
env={}
for l in re(BT+r"\.env.local").splitlines():
    l=l.strip()
    if '=' in l and not l.startswith('#'):k,v=l.split('=',1);env[k.strip()]=v.strip().strip('"')
TOK=env['EODHD_API_TOKEN']
def fm(sym):
    with urllib.request.urlopen(f"https://eodhd.com/api/eod/{sym}?api_token={TOK}&fmt=json&period=m",timeout=60) as r:
        return {d['date'][:7]:(d.get('adjusted_close') or d.get('close')) for d in json.load(r) if (d.get('adjusted_close') or d.get('close'))}

# --- DATOS OFICIALES (Excel Cartera Core v3.0, hoja "Pesos Cartera K Sectorial") ---
# Composición Maslow por perfil (RV/RF/Oro)
RV =[.10,.15,.25,.35,.45,.55,.65,.70,.75,.80]
RF =[.75,.70,.60,.50,.35,.25,.15,.10,.05,.00]
ORO=[.15,.15,.15,.15,.20,.20,.20,.20,.20,.20]
# Volatilidad OBJETIVO oficial por perfil (las bandas regulatorias)
VOLOBJ=[.05,.055,.06,.07,.08,.09,.10,.11,.12,.13]
# Reparto sectorial DENTRO de la RV (oficial)
SEC={"Staples":.25,"Health":.25,"Tech":.25,"Energy":.125,"RealEstate":.125}
PROFILES={p+1:{"RV":RV[p],"RF":RF[p],"Oro":ORO[p]} for p in range(10)}
RVpct=[r*100 for r in RV]
# fronteras de perfil por % RV (puntos medios de la escalera oficial)
bounds_rv=[(RVpct[i]+RVpct[i+1])/2 for i in range(9)]
def implied(rvp):
    p=1
    for i,b in enumerate(bounds_rv):
        if rvp>b: p=i+2
    return p

# --- retornos: RV = blend sectorial (SPDR US, proxy largo incl. 2008) ---
print("Descargando sectores SPDR + RF + Oro...")
S={"Staples":fm("XLP.US"),"Health":fm("XLV.US"),"Tech":fm("XLK.US"),"Energy":fm("XLE.US"),"RealEstate":fm("VNQ.US")}
RFs=fm("AGG.US"); OROs=fm("GLD.US")
allm=set(RFs)&set(OROs)
for s in S.values(): allm&=set(s)
months=sorted(allm); rm=months[1:]; n=len(rm)
def ret(series): return [series[months[i]]/series[months[i-1]]-1 for i in range(1,len(months))]
secr={k:ret(v) for k,v in S.items()}
rv_ret=[sum(SEC[k]*secr[k][i] for k in SEC) for i in range(n)]   # RV sectorial
rf_ret=ret(RFs); oro_ret=ret(OROs)
rets={"RV":rv_ret,"RF":rf_ret,"Oro":oro_ret}
print(f"Ventana: {rm[0]} -> {rm[-1]} ({n} meses, incluye 2008)")

def irpf(g):
    br=[(6000,.19),(44000,.21),(150000,.23),(150000,.27),(1e15,.28)];t=0;rem=g
    for lim,rate in br:
        x=min(rem,lim);t+=x*rate;rem-=x
        if rem<=0:break
    return t
CLS=["RV","RF","Oro"]
def sim(p0,band,init=100000):
    tgt=PROFILES[p0];val={c:init*tgt[c] for c in CLS};cost=dict(val);pr=[];tax=0;ann=0;ty=-1;ser=[]
    for i in range(n):
        tb=sum(val.values());rp=sum(val[c]/tb*rets[c][i] for c in CLS);pr.append(rp)
        for c in CLS:val[c]*=(1+rets[c][i])
        tot=sum(val.values());w={c:val[c]/tot for c in CLS}
        if any(tgt[c]>0 and abs(w[c]-tgt[c])/tgt[c]>band for c in CLS):
            yr=int(rm[i][:4])
            if yr!=ty:ty=yr;ann=0
            gain=0
            for c in CLS:
                t=tot*tgt[c]
                if val[c]-t>1e-9:sold=val[c]-t;cbs=cost[c]*sold/val[c];gain+=sold-cbs;cost[c]-=cbs
            tx=irpf(ann+gain)-irpf(max(0,ann)) if gain>0 else 0
            ann+=max(0,gain);tot-=tx;tax+=tx
            for c in CLS:
                t=tot*tgt[c]
                if t-val[c]>1e-9:cost[c]+=t-val[c]
                val[c]=t
            w=dict(tgt)
        ser.append({"m":rm[i],"rv":w["RV"]*100,"impl":implied(w["RV"]*100)})
    eq=1;peak=1;mdd=0
    for r in pr:eq*=(1+r);peak=max(peak,eq);mdd=min(mdd,eq/peak-1)
    vol=st.pstdev(pr)*math.sqrt(12)*100;cagr=((sum(val.values())/init)**(12/n)-1)*100
    onp=sum(1 for s in ser if s["impl"]==p0)/len(ser)*100
    w1=sum(1 for s in ser if abs(s["impl"]-p0)<=1)/len(ser)*100
    return dict(cagr=cagr,vol=vol,mdd=mdd*100,tax=tax,onp=onp,w1=w1,maxrv=max(s["rv"] for s in ser),
                maximpl=max(s["impl"] for s in ser),ser=ser,rebal=sum(1 for s in ser if s.get("reb")))

BANDS=[(0.01,"±1%"),(0.10,"±10%"),(0.20,"±20%"),(0.25,"±25%"),(0.50,"±50%"),(1.0,"B&H")]
def sweep():
    out=[]
    for band,lab in BANDS:
        rs=[sim(p,band) for p in range(1,11)]
        out.append(dict(label=lab,band=band,cagr=sum(r["cagr"] for r in rs)/10,vol=sum(r["vol"] for r in rs)/10,
            mdd=sum(r["mdd"] for r in rs)/10,tax=sum(r["tax"] for r in rs)/10,
            onp=sum(r["onp"] for r in rs)/10,w1=sum(r["w1"] for r in rs)/10))
    return out
sw=sweep()
print("\nSWEEP sectorial (media 10 perfiles):")
for s in sw: print(f"  {s['label']:6} CAGR {s['cagr']:.2f}% vol {s['vol']:.2f}% mdd {s['mdd']:.1f}% tax {s['tax']:,.0f} ±1 {s['w1']:.0f}% onp {s['onp']:.0f}%")

# ---- Fig1: calibración OFICIAL (vol objetivo + RV%) ----
fig,ax=plt.subplots(figsize=(8,4.2));ps=list(range(1,11))
ax.plot(ps,[v*100 for v in VOLOBJ],"-o",color=RED,lw=2.4,ms=7,label="Volatilidad objetivo OFICIAL")
for p,v in zip(ps,VOLOBJ):ax.annotate(f"{v*100:.1f}%",(p,v*100),textcoords="offset points",xytext=(0,9),ha="center",fontsize=8,color=NAVY)
ax.set_xticks(ps);ax.set_xlabel("Perfil de riesgo");ax.set_ylabel("Volatilidad objetivo (oficial)")
ax.set_title("Calibración OFICIAL: volatilidad objetivo por perfil (Cartera Core)",color=NAVY,fontweight="bold")
ax.yaxis.set_major_formatter(PercentFormatter())
ax2=ax.twinx();ax2.bar(ps,RVpct,alpha=0.12,color=BLUE);ax2.set_ylabel("% Renta Variable (barras)",color=BLUE);ax2.set_ylim(0,100);ax2.grid(False)
fig.tight_layout();fig.savefig(os.path.join(OUT,"sfig1_calibracion.png"),dpi=150);plt.close()

# ---- Fig2: deriva P6 ----
r6=sim(6,0.50);ser=r6["ser"];xs=list(range(len(ser)));impl=[s["impl"] for s in ser]
fig,ax=plt.subplots(figsize=(9,3.6))
ax.axhspan(5,7,color=BLUE,alpha=0.07,label="banda ±1 perfil")
ax.step(xs,impl,where="post",color=RED,lw=1.8,label="Perfil implícito (composición)")
ax.axhline(6,color=NAVY,ls="--",lw=1.3,label="Perfil objetivo (6)")
tk=[i for i in xs if ser[i]["m"].endswith("-01")];ax.set_xticks(tk);ax.set_xticklabels([ser[i]["m"][:4] for i in tk],fontsize=8)
ax.set_yticks(range(4,11));ax.set_ylabel("Perfil");ax.set_title("Deriva de la etiqueta — Perfil 6 sectorial, bandas ±50%",color=NAVY,fontweight="bold")
ax.legend(loc="upper left",fontsize=8);fig.tight_layout();fig.savefig(os.path.join(OUT,"sfig2_deriva_p6.png"),dpi=150);plt.close()

# ---- Fig3: rtb vs riesgo realizado ----
fig,ax=plt.subplots(figsize=(8,4.4));labs=[s["label"] for s in sw];x=range(len(labs))
ax.bar([i-0.2 for i in x],[s["cagr"] for s in sw],0.38,color=RED,label="CAGR neto")
ax.bar([i+0.2 for i in x],[s["vol"] for s in sw],0.38,color=GREY,label="Vol realizada")
for i,s in enumerate(sw):ax.text(i-0.2,s["cagr"]+0.06,f"{s['cagr']:.2f}",ha="center",fontsize=7);ax.text(i+0.2,s["vol"]+0.06,f"{s['vol']:.2f}",ha="center",fontsize=7)
ax.set_xticks(list(x));ax.set_xticklabels(labs);ax.set_ylabel("% anualizado")
ax.set_title("Sectorial: la rentabilidad sube, el riesgo REAL no — por banda",color=NAVY,fontweight="bold")
ax.legend();ax.yaxis.set_major_formatter(PercentFormatter());fig.tight_layout();fig.savefig(os.path.join(OUT,"sfig3_rtb_vs_riesgo.png"),dpi=150);plt.close()

# ---- Fig4: fiscalidad ----
fig,ax=plt.subplots(figsize=(8,4.2))
ax.plot(labs,[s["tax"] for s in sw],"-o",color=RED,lw=2)
for i,s in enumerate(sw):ax.annotate(f"{s['tax']:,.0f}€",(i,s["tax"]),textcoords="offset points",xytext=(0,8),ha="center",fontsize=8)
ax.set_ylabel("€ IRPF medio / perfil");ax.set_xlabel("Banda");ax.set_title("Coste fiscal por banda (sectorial) — se satura",color=NAVY,fontweight="bold")
fig.tight_layout();fig.savefig(os.path.join(OUT,"sfig4_fiscalidad.png"),dpi=150);plt.close()

# ---- numbers ----
out=dict(first=rm[0],last=rm[-1],n=n,
    ladder=[dict(p=p+1,rv=RVpct[p],rf=RF[p]*100,oro=ORO[p]*100,volobj=VOLOBJ[p]*100,cisne=VOLOBJ[p]*300) for p in range(10)],
    sweep=sw,
    p6=dict(onp=r6["onp"],w1=r6["w1"],maxrv=r6["maxrv"],maximpl=r6["maximpl"]),
    sectores=SEC)
json.dump(out,open(os.path.join(OUT,"numbers_sectorial.json"),"w"),indent=1)
print("\nnumbers_sectorial.json + 4 sfigs generados")
