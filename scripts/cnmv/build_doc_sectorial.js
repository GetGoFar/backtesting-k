// Documento CNMV — Cartera Core (perfil SECTORIAL), composición y bandas OFICIALES.
const fs=require("fs"),path=require("path");
const { Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun,AlignmentType,
  LevelFormat,HeadingLevel,BorderStyle,WidthType,ShadingType,PageNumber,Footer }=require("docx");
const DIR=__dirname;
const N=JSON.parse(fs.readFileSync(path.join(DIR,"numbers_sectorial.json"),"utf8"));
const RED="C81E2E",NAVY="202020",LIGHT="F2E9E8";
const CW=9026;
const fmt=(x,d=2)=>Number(x).toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=(x)=>Number(x).toLocaleString("es-ES",{maximumFractionDigits:0})+" €";
const H=(t,l)=>new Paragraph({heading:l,children:[new TextRun({text:t})]});
const P=(runs,opts={})=>new Paragraph({children:Array.isArray(runs)?runs:[new TextRun({text:runs})],spacing:{after:120,line:276},...opts});
const bullet=(t)=>new Paragraph({numbering:{reference:"b",level:0},spacing:{after:80},children:Array.isArray(t)?t:[new TextRun({text:t})]});
const bd={style:BorderStyle.SINGLE,size:1,color:"CCCCCC"};const borders={top:bd,bottom:bd,left:bd,right:bd};
function cell(t,w,{head=false,bold=false,fill,align}={}){return new TableCell({borders,width:{size:w,type:WidthType.DXA},
  margins:{top:55,bottom:55,left:100,right:100},shading:fill?{fill,type:ShadingType.CLEAR}:(head?{fill:NAVY,type:ShadingType.CLEAR}:undefined),
  children:[new Paragraph({alignment:align??(head?AlignmentType.CENTER:AlignmentType.LEFT),
    children:[new TextRun({text:String(t),bold:head||bold,color:head?"FFFFFF":undefined,size:17})]})]});}
const table=(w,rows)=>new Table({width:{size:CW,type:WidthType.DXA},columnWidths:w,rows});
const img=(f,w,h,t)=>new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:120,after:50},
  children:[new ImageRun({type:"png",data:fs.readFileSync(path.join(DIR,f)),transformation:{width:w,height:h},altText:{title:t,description:t,name:t}})]});
const cap=(t)=>new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:180},children:[new TextRun({text:t,italics:true,size:16,color:"666666"})]});
const sw=N.sweep,get=(l)=>sw.find(s=>s.label===l);
const c=[];

// PORTADA
c.push(
  new Paragraph({spacing:{before:1500,after:80},alignment:AlignmentType.CENTER,children:[new TextRun({text:"ESTUDIO CUANTITATIVO",color:RED,bold:true,size:28})]}),
  new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:40},children:[new TextRun({text:"Estabilidad del perfil de riesgo bajo",bold:true,size:38})]}),
  new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:240},children:[new TextRun({text:"rebalanceo por bandas",bold:true,size:38})]}),
  new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},children:[new TextRun({text:"Cartera Core El Proyecto K · perfil sectorial",italics:true,size:24,color:"555555"})]}),
  new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:300},children:[new TextRun({text:"Calibración con la volatilidad objetivo y la composición oficiales por perfil",italics:true,size:20,color:"777777"})]}),
  new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:1300},children:[new TextRun({text:"El Proyecto K",bold:true,size:24})]}),
  new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:"Documento de trabajo · junio de 2026",size:20,color:"555555"})]}),
  new Paragraph({children:[new TextRun("")],pageBreakBefore:true}),
);

// RESUMEN
c.push(H("Resumen ejecutivo",HeadingLevel.HEADING_1));
c.push(P([new TextRun("Este estudio cuantifica, mes a mes y sobre más de dos décadas ("),new TextRun({text:`${N.first} – ${N.last}, ${N.n} meses, incluida la crisis de 2008`,bold:true}),new TextRun("), el perfil de riesgo que efectivamente soporta el cliente de la Cartera Core (perfil sectorial) cuando se rebalancea "),new TextRun({text:"por bandas",bold:true}),new TextRun(" en lugar de forma continua. La calibración emplea la "),new TextRun({text:"volatilidad objetivo y la composición oficiales",bold:true}),new TextRun(" de cada perfil (1 a 10).")]));
c.push(P([new TextRun({text:"Conclusión. ",bold:true,color:RED}),new TextRun("Las bandas amplias (±50%) NO aumentan el riesgo real del cliente —la volatilidad realizada y la máxima caída permanecen estables— y, además, mejoran la rentabilidad neta y reducen materialmente el coste fiscal. La subida puntual de la «etiqueta» de perfil es un artefacto de composición que no se traduce en mayor riesgo experimentado.")]));
c.push(table([2700,1300,1480,1300,2246],[
  new TableRow({children:["Banda de rebalanceo","CAGR neto","Vol. realizada","Máx. DD","IRPF medio / perfil"].map((t,i)=>cell(t,[2700,1300,1480,1300,2246][i],{head:true}))}),
  ...[["±1% (casi continuo)","±1%"],["±25% relativo","±25%"],["±50% relativo","±50%"]].map(([nm,l])=>{const s=get(l),hi=l==="±50%";
    return new TableRow({children:[cell(nm,2700,{bold:hi,fill:hi?LIGHT:undefined}),cell(fmt(s.cagr)+" %",1300,{align:AlignmentType.CENTER,bold:hi,fill:hi?LIGHT:undefined}),
      cell(fmt(s.vol)+" %",1480,{align:AlignmentType.CENTER,bold:hi,fill:hi?LIGHT:undefined}),cell(fmt(s.mdd,1)+" %",1300,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
      cell(eur(s.tax),2246,{align:AlignmentType.CENTER,bold:hi,fill:hi?LIGHT:undefined})]});}),
]));
c.push(cap(`Media de los 10 perfiles. ${N.first} – ${N.last}. Capital 100.000 € por perfil. La banda ±50% ahorra ~${eur(get("±25%").tax-get("±50%").tax)} de IRPF frente a ±25% sin aumentar el riesgo real.`));

// 1 OBJETO
c.push(H("1. Objeto y contexto",HeadingLevel.HEADING_1));
c.push(P("La normativa de idoneidad (MiFID II) exige mantener la cartera del cliente acorde con su perfil de riesgo. Rebalancear de forma continua para fijar exactamente los pesos objetivo es, además de inviable, fiscalmente costoso: en instrumentos no traspasables (ETFs/acciones) cada venta de un activo apreciado realiza una plusvalía que tributa de inmediato en el IRPF del ahorro. La práctica habitual es rebalancear por bandas: actuar solo cuando una clase de activo se aleja más de un umbral de su peso objetivo."));
c.push(P("El estudio determina si dicha política —en particular bandas amplias del ±50% relativo— hace que el cliente «se cambie de perfil». Para ello distinguimos dos conceptos:"));
c.push(bullet([new TextRun({text:"Etiqueta de perfil. ",bold:true}),new TextRun("El número de perfil que corresponde a la composición de la cartera, según la volatilidad objetivo que la firma asigna a cada mezcla de activos.")]));
c.push(bullet([new TextRun({text:"Riesgo efectivo. ",bold:true}),new TextRun("El riesgo realmente experimentado: la volatilidad y la máxima caída efectivas de la cartera.")]));
c.push(P([new TextRun("La tesis, confirmada por los datos, es que las bandas pueden mover la "),new TextRun({text:"etiqueta",italics:true}),new TextRun(" sin alterar el "),new TextRun({text:"riesgo efectivo",italics:true}),new TextRun(", que es el que la protección del inversor pretende preservar.")]));

// 2 METODOLOGIA
c.push(H("2. Metodología",HeadingLevel.HEADING_1));
c.push(H("2.1. Composición y volatilidad objetivo oficiales",HeadingLevel.HEADING_2));
c.push(P("Se emplea la composición oficial de la Cartera Core por perfil (1 a 10): una mezcla de Renta Variable (RV), Renta Fija (RF) y Oro, con la RV repartida por sectores globales. A cada perfil la firma le asigna una volatilidad objetivo, que constituye la frontera regulatoria entre perfiles. La tabla siguiente reproduce esa calibración oficial."));
c.push(table([1300,1300,1300,1300,1900,1926],[
  new TableRow({children:["Perfil","% RV","% RF","% Oro","Vol. objetivo","«Cisne negro» (−3σ)"].map((t,i)=>cell(t,[1300,1300,1300,1300,1900,1926][i],{head:true}))}),
  ...N.ladder.map(L=>new TableRow({children:[cell("Perfil "+L.p,1300,{bold:L.p===6,fill:L.p===6?LIGHT:undefined}),
    cell(fmt(L.rv,0)+" %",1300,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined}),cell(fmt(L.rf,0)+" %",1300,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined}),
    cell(fmt(L.oro,0)+" %",1300,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined}),cell(fmt(L.volobj,1)+" %",1900,{align:AlignmentType.CENTER,bold:true,fill:L.p===6?LIGHT:undefined}),
    cell("−"+fmt(L.cisne,0)+" %",1926,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined})]})),
]));
c.push(cap("Tabla 1. Calibración OFICIAL de la Cartera Core. La RV se reparte por sectores: Consumo Básico, Salud y Tecnología (25 % cada uno), Energía e Inmobiliario global (12,5 % cada uno)."));
c.push(P("Las fronteras de perfil distan apenas ~1 punto de volatilidad objetivo (0,5 pp en el tramo bajo); por ello la etiqueta de perfil es muy sensible a pequeños cambios de composición — una propiedad de la escala, no del riesgo."));
c.push(H("2.2. Simulación con bandas y fiscalidad",HeadingLevel.HEADING_2));
c.push(P("Para cada perfil se simula la cartera mes a mes: las clases derivan con sus retornos y solo se rebalancea cuando una clase supera la banda (p. ej. ±50 % relativo de su peso objetivo). En cada rebalanceo se realiza la plusvalía y se aplica el IRPF del ahorro por tramos (19 %–28 %). Cada mes se registra (i) la etiqueta de perfil implícita en la composición y (ii) la volatilidad y la máxima caída efectivamente realizadas."));
c.push(H("2.3. Datos",HeadingLevel.HEADING_2));
c.push(P(`Retornos mensuales por clase de activo: la RV sectorial se construye con índices sectoriales globales (proxy de histórico largo que incluye la crisis de 2008), la RF con un agregado de renta fija y el Oro con oro físico. Ventana ${N.first} – ${N.last} (${N.n} meses).`));

// 3 RESULTADOS
c.push(new Paragraph({children:[new TextRun("")],pageBreakBefore:true}));
c.push(H("3. Resultados",HeadingLevel.HEADING_1));
c.push(H("3.1. Calibración oficial por perfil",HeadingLevel.HEADING_2));
c.push(img("sfig1_calibracion.png",520,273,"Calibración oficial"));
c.push(cap("Figura 1. Volatilidad objetivo oficial y % de RV de cada perfil de la Cartera Core."));

c.push(H("3.2. La etiqueta deriva — pero es solo composición",HeadingLevel.HEADING_2));
c.push(P(`Bajo bandas ±50 %, la composición deriva con el mercado: en el perfil 6 la RV llega a pesar hasta el ${fmt(N.p6.maxrv,0)} % (objetivo 55 %) en los tramos alcistas, lo que eleva transitoriamente la etiqueta. La etiqueta coincide con el perfil objetivo el ${fmt(N.p6.onp,0)} % de los meses y se mantiene dentro de ±1 perfil el ${fmt(N.p6.w1,0)} % del tiempo.`));
c.push(img("sfig2_deriva_p6.png",560,224,"Deriva etiqueta P6"));
c.push(cap("Figura 2. Perfil 6: la etiqueta oscila con la composición y revierte hacia su objetivo."));

c.push(H("3.3. El riesgo REAL no aumenta (resultado central)",HeadingLevel.HEADING_2));
c.push(P([new TextRun("Al medir el riesgo "),new TextRun({text:"efectivamente realizado",bold:true}),new TextRun(" —volatilidad y máxima caída— apenas varía al ampliar la banda, mientras la rentabilidad mejora. Ampliar la banda hasta ±50 % "),new TextRun({text:"no incrementa el riesgo experimentado",bold:true}),new TextRun(": la volatilidad realizada sube ~0,2 pp y el drawdown no empeora (incluso mejora ligeramente).")]));
c.push(img("sfig3_rtb_vs_riesgo.png",560,308,"Rentabilidad vs riesgo"));
c.push(cap("Figura 3. La rentabilidad sube con la banda; la volatilidad realizada permanece esencialmente plana."));
c.push(table([1900,1380,1500,1280,1480,1486],[
  new TableRow({children:["Banda","CAGR neto","Vol. realizada","Máx. DD","IRPF/perfil","Meses ±1"].map((t,i)=>cell(t,[1900,1380,1500,1280,1480,1486][i],{head:true}))}),
  ...sw.map(s=>{const hi=s.label==="±50%";return new TableRow({children:[cell(s.label,1900,{bold:hi,fill:hi?LIGHT:undefined}),
    cell(fmt(s.cagr)+" %",1380,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),cell(fmt(s.vol)+" %",1500,{align:AlignmentType.CENTER,bold:hi,fill:hi?LIGHT:undefined}),
    cell(fmt(s.mdd,1)+" %",1280,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),cell(eur(s.tax),1480,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
    cell(fmt(s.w1,0)+" %",1486,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined})]});}),
]));
c.push(cap("Tabla 2. Media de los 10 perfiles. La volatilidad realizada sube ~0,2 pp de ±1 % a ±50 %; el drawdown no empeora."));

c.push(H("3.4. La banda estrecha es más cara y no más segura",HeadingLevel.HEADING_2));
c.push(P([new TextRun("Rebalancear con bandas estrechas obliga a vender los activos apreciados con frecuencia, realizando plusvalías que tributan: el IRPF de ±1 % ("),new TextRun({text:eur(get("±1%").tax),bold:true}),new TextRun(" por perfil) más que duplica el de ±50 % ("),new TextRun({text:eur(get("±50%").tax),bold:true}),new TextRun("). Además, rebalancear durante una caída implica comprar el activo que cae, por lo que la banda estrecha no reduce —e incluso empeora— la máxima caída. La banda estrecha es, por tanto, simultáneamente más cara y no más segura.")]));
c.push(img("sfig4_fiscalidad.png",520,273,"Fiscalidad"));
c.push(cap("Figura 4. Coste fiscal medio por perfil según la banda: a mayor banda, menor IRPF realizado."));

// 4 CONCLUSION
c.push(new Paragraph({children:[new TextRun("")],pageBreakBefore:true}));
c.push(H("4. Conclusión",HeadingLevel.HEADING_1));
c.push(P([new TextRun({text:"El rebalanceo por bandas, incluso amplias (±50 %), preserva el perfil de riesgo efectivo del cliente y es en su interés.",bold:true})]));
c.push(P("La evidencia empírica sobre más de dos décadas, los diez perfiles y la composición y calibración oficiales sostiene tres afirmaciones:"));
c.push(bullet([new TextRun({text:"El riesgo realizado no aumenta. ",bold:true}),new TextRun("La volatilidad efectiva sube apenas ~0,2 pp y la máxima caída no empeora entre el rebalanceo casi continuo y el de bandas ±50 %, también a través de la crisis de 2008.")]));
c.push(bullet([new TextRun({text:"La etiqueta de perfil es un artefacto de composición. ",bold:true}),new TextRun("Su sensibilidad procede de la fina graduación de la volatilidad objetivo (~1 pp entre perfiles), no de un cambio real del riesgo. Las excursiones son transitorias y revierten.")]));
c.push(bullet([new TextRun({text:"La banda amplia beneficia al cliente. ",bold:true}),new TextRun("Reduce materialmente el IRPF realizado y mejora la rentabilidad neta, sin reducir la seguridad. Forzar la etiqueta con rebalanceo estrecho perjudicaría al cliente sin disminuir su riesgo.")]));
c.push(P("En consecuencia, la política de rebalanceo por bandas —incluido el ±50 %— es consistente con el mantenimiento del perfil de riesgo del cliente a efectos de idoneidad: preserva su riesgo efectivo y optimiza su resultado neto de impuestos."));

// 5 LIMITACIONES
c.push(H("5. Limitaciones y alcance",HeadingLevel.HEADING_1));
c.push(bullet("La RV sectorial se modela con índices sectoriales globales representativos; los resultados son cualitativamente robustos a la elección concreta del proxy."));
c.push(bullet("La ventana (2004–2026) incluye distintos regímenes de mercado (2008, 2020, 2022); resultados pasados no garantizan resultados futuros."));
c.push(bullet("La volatilidad realizada se calcula sobre retornos mensuales y se complementa con la máxima caída (riesgo de cola)."));
c.push(bullet("El cálculo fiscal modela el IRPF del ahorro por tramos sobre plusvalías realizadas en cada rebalanceo, sin incluir el impuesto latente diferido a la liquidación final."));
c.push(P([new TextRun({text:"Aviso. ",bold:true}),new TextRun("Documento de trabajo con fines de análisis. No constituye asesoramiento de inversión ni recomendación.")],{spacing:{before:200}}));

const doc=new Document({creator:"El Proyecto K",title:"Estabilidad del perfil de riesgo bajo rebalanceo por bandas — Cartera Core sectorial",
  styles:{default:{document:{run:{font:"Arial",size:22,color:"222222"}}},paragraphStyles:[
    {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:30,bold:true,font:"Arial",color:RED},paragraph:{spacing:{before:280,after:160},outlineLevel:0}},
    {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,run:{size:24,bold:true,font:"Arial",color:NAVY},paragraph:{spacing:{before:200,after:120},outlineLevel:1}}]},
  numbering:{config:[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:540,hanging:280}}}}]}]},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1440,right:1440,bottom:1440,left:1440}}},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:"El Proyecto K · Estudio Cartera Core — perfil-bandas · ",size:16,color:"999999"}),new TextRun({children:["Página ",PageNumber.CURRENT],size:16,color:"999999"})]})]})},
    children:c}]});
Packer.toBuffer(doc).then(b=>{const o=path.join("C:\\ClaudeTest","Estudio_CNMV_Cartera_Core_perfil_bandas.docx");fs.writeFileSync(o,b);console.log("OK ->",o,"("+b.length+" bytes)");});
