// Genera el documento CNMV (Word) — Estudio de estabilidad de perfil bajo bandas.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, Header, Footer, TableOfContents,
} = require("docx");

const DIR = __dirname;
const N = JSON.parse(fs.readFileSync(path.join(DIR, "numbers.json"), "utf8"));
const RED = "C81E2E", NAVY = "202020", LIGHT = "F2E9E8", GREYH = "EDEDED";
const CW = 9026; // content width A4 1" margins

const fmt = (x, d = 2) => Number(x).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (x) => Number(x).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";

function H(text, level) {
  return new Paragraph({ heading: level, children: [new TextRun({ text })] });
}
function P(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [new TextRun({ text: runs })];
  return new Paragraph({ children, spacing: { after: 120, line: 276 }, alignment: opts.align, ...opts });
}
function bullet(text) {
  return new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 80 },
    children: Array.isArray(text) ? text : [new TextRun({ text })] });
}
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
function cell(text, w, { head = false, bold = false, fill, align } = {}) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    shading: fill ? { fill, type: ShadingType.CLEAR } : (head ? { fill: NAVY, type: ShadingType.CLEAR } : undefined),
    children: [new Paragraph({ alignment: align ?? (head ? AlignmentType.CENTER : AlignmentType.LEFT),
      children: [new TextRun({ text: String(text), bold: head || bold, color: head ? "FFFFFF" : undefined, size: 18 })] })],
  });
}
function table(widths, rows) {
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows });
}
function img(file, w, h, title) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(DIR, file)),
      transformation: { width: w, height: h }, altText: { title, description: title, name: title } })] });
}
function caption(text) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 },
    children: [new TextRun({ text, italics: true, size: 16, color: "666666" })] });
}

const sw = N.main.sweep;
const get = (lab) => sw.find((s) => s.label === lab);
const r = N.robust.sweep;
const rget = (lab) => r.find((s) => s.label === lab);

const children = [];

// ---- PORTADA ----
children.push(
  new Paragraph({ spacing: { before: 1600, after: 80 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "ESTUDIO CUANTITATIVO", color: RED, bold: true, size: 28, font: "Arial" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: "Estabilidad del perfil de riesgo bajo", bold: true, size: 40 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 },
    children: [new TextRun({ text: "rebalanceo por bandas", bold: true, size: 40 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "Evidencia empírica de que las bandas de rebalanceo preservan el riesgo efectivo del cliente", italics: true, size: 22, color: "555555" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400 },
    children: [new TextRun({ text: "El Proyecto K", bold: true, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: "Documento de trabajo · junio de 2026", size: 20, color: "555555" })] }),
  new Paragraph({ children: [new TextRun("")], pageBreakBefore: true }),
);

// ---- RESUMEN EJECUTIVO ----
children.push(H("Resumen ejecutivo", HeadingLevel.HEADING_1));
children.push(P([
  new TextRun("El presente estudio cuantifica, mes a mes y a lo largo de más de dos décadas, el perfil de riesgo que efectivamente soporta un cliente cuya cartera se rebalancea "),
  new TextRun({ text: "por bandas", bold: true }),
  new TextRun(" (esto es, solo cuando la composición se desvía más de un umbral) en lugar de hacerlo de forma continua. El objetivo es determinar si dicha política —incluidas bandas amplias del ±50% relativo— altera el perfil de riesgo del cliente."),
]));
children.push(P([new TextRun({ text: "Conclusión principal. ", bold: true, color: RED }),
  new TextRun("El rebalanceo por bandas amplias NO incrementa el riesgo real asumido por el cliente. La volatilidad realizada y la máxima caída (drawdown) de la cartera permanecen prácticamente inalteradas entre el rebalanceo casi continuo y el de bandas ±50%, mientras que la rentabilidad neta y el coste fiscal mejoran. La eventual subida de la «etiqueta» numérica de perfil es un artefacto de composición —deriva del porcentaje de renta variable— que no se traduce en mayor riesgo experimentado.")]));
children.push(table([3400, 1400, 1400, 1400, 1426], [
  new TableRow({ children: ["Banda de rebalanceo", "CAGR neto", "Vol. realizada", "Máx. drawdown", "IRPF / perfil"].map((t, i) => cell(t, [3400,1400,1400,1400,1426][i], { head: true })) }),
  ...[["±1% (casi continuo)","±1%"],["±25% relativo","±25%"],["±50% relativo","±50%"]].map(([name, lab]) => {
    const s = get(lab); const hi = lab === "±50%";
    return new TableRow({ children: [
      cell(name, 3400, { bold: hi, fill: hi ? LIGHT : undefined }),
      cell(fmt(s.cagr) + " %", 1400, { align: AlignmentType.CENTER, bold: hi, fill: hi ? LIGHT : undefined }),
      cell(fmt(s.vol) + " %", 1400, { align: AlignmentType.CENTER, bold: hi, fill: hi ? LIGHT : undefined }),
      cell(fmt(s.mdd, 1) + " %", 1400, { align: AlignmentType.CENTER, bold: hi, fill: hi ? LIGHT : undefined }),
      cell(eur(s.tax), 1426, { align: AlignmentType.CENTER, bold: hi, fill: hi ? LIGHT : undefined }),
    ] });
  }),
]));
children.push(caption(`Media de los 10 perfiles. Ventana ${N.main.first} – ${N.main.last} (${N.main.n} meses). Capital 100.000 € por perfil.`));

// ---- 1. OBJETO ----
children.push(H("1. Objeto y contexto", HeadingLevel.HEADING_1));
children.push(P("La normativa de idoneidad (MiFID II) exige que la cartera de un cliente se mantenga acorde con su perfil de riesgo. En la gestión real, rebalancear de forma continua para mantener exactamente los pesos objetivo es inviable y, sobre todo, fiscalmente costoso: cada venta de un activo apreciado realiza una plusvalía que tributa de inmediato en el IRPF del ahorro. La práctica habitual es rebalancear por bandas: solo se actúa cuando una clase de activo se aleja más de un umbral de su peso objetivo."));
children.push(P("La cuestión que aborda este estudio es si esa política —y en particular bandas amplias— hace que el cliente «se cambie de perfil». Para responderla con rigor distinguimos dos conceptos que con frecuencia se confunden:"));
children.push(bullet([new TextRun({ text: "Etiqueta de perfil (ex-ante). ", bold: true }), new TextRun("El número de perfil que correspondería a la composición de la cartera en un momento dado, según la volatilidad teórica que implica su mezcla de activos.")]));
children.push(bullet([new TextRun({ text: "Riesgo efectivo (realizado). ", bold: true }), new TextRun("El riesgo que el cliente realmente experimenta: la volatilidad y la máxima caída efectivas de su cartera a lo largo del tiempo.")]));
children.push(P([new TextRun("La tesis del estudio, confirmada por los datos, es que las bandas pueden mover la "), new TextRun({ text: "etiqueta", italics: true }), new TextRun(" sin alterar el "), new TextRun({ text: "riesgo efectivo", italics: true }), new TextRun(" —que es el que la protección del inversor pretende preservar.")]));

// ---- 2. METODOLOGIA ----
children.push(H("2. Metodología", HeadingLevel.HEADING_1));
children.push(H("2.1. Universo y escalera de perfiles", HeadingLevel.HEADING_2));
children.push(P("Se parte de las diez carteras modelo por perfil (1 a 10). Cada cartera se reduce a su mezcla por clase de activo —Renta Variable (RV), Renta Fija (RF) y Oro— que es el determinante del riesgo y el lente que emplea el cuestionario de idoneidad."));
children.push(H("2.2. Calibración perfil ↔ riesgo", HeadingLevel.HEADING_2));
children.push(P("A partir de los retornos mensuales de cada clase de activo se estima una matriz de covarianzas estable y se calcula la volatilidad ex-ante (anualizada) de cada perfil objetivo. Se obtiene así una escala creciente σ₁ < σ₂ < … < σ₁₀; las fronteras entre perfiles son los puntos medios entre volatilidades consecutivas. Esta es la regla, derivada de las propias carteras modelo, que traduce composición en perfil."));
children.push(H("2.3. Simulación con bandas y fiscalidad", HeadingLevel.HEADING_2));
children.push(P("Para cada perfil se simula la cartera mes a mes: las clases derivan con sus retornos y solo se rebalancea cuando una clase supera la banda (p. ej. ±50% relativo de su peso objetivo). En cada rebalanceo de ETFs se realiza la plusvalía y se aplica el IRPF del ahorro por tramos (19 %–28 %). Cada mes se registra (i) la etiqueta de perfil implícita en la composición vigente y (ii) la volatilidad y el drawdown efectivamente realizados."));
children.push(H("2.4. Datos", HeadingLevel.HEADING_2));
children.push(P(`Índices representativos por clase de activo (MSCI World para RV, agregado de renta fija para RF, oro físico para Oro). Ventana principal ${N.main.first} – ${N.main.last} (${N.main.n} meses). El análisis de robustez extiende la serie a ${N.robust.first} – ${N.robust.last} (${N.robust.n} meses) para incluir la crisis financiera de 2008.`));

// ---- 3. RESULTADOS ----
children.push(new Paragraph({ children: [new TextRun("")], pageBreakBefore: true }));
children.push(H("3. Resultados", HeadingLevel.HEADING_1));

children.push(H("3.1. Calibración: la etiqueta es muy sensible", HeadingLevel.HEADING_2));
children.push(P("La volatilidad ex-ante crece de forma suave con el perfil, y los perfiles superiores están separados por apenas ~0,5 puntos de volatilidad cada uno. En consecuencia, un movimiento pequeño de la volatilidad de la cartera basta para cambiar la etiqueta numérica: la etiqueta es hipersensible por construcción."));
children.push(img("fig1_calibracion.png", 540, 284, "Calibración perfil-volatilidad"));
children.push(caption("Figura 1. Volatilidad ex-ante de cada perfil objetivo y su % de renta variable."));
children.push(table([1600, 2400, 2513, 2513], [
  new TableRow({ children: ["Perfil","% Renta Variable","Vol. ex-ante","Frontera con perfil sup."].map((t,i)=>cell(t,[1600,2400,2513,2513][i],{head:true})) }),
  ...N.main.ladder.map((L,i)=> new TableRow({ children: [
    cell("Perfil "+L.p,1600,{bold:L.p===6,fill:L.p===6?LIGHT:undefined}),
    cell(fmt(L.rv,0)+" %",2400,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined}),
    cell(fmt(L.vol)+" %",2513,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined}),
    cell(i<N.main.ladder.length-1?fmt(N.main.ladder[i].vol/2+N.main.ladder[i+1].vol/2)+" %":"—",2513,{align:AlignmentType.CENTER,fill:L.p===6?LIGHT:undefined}),
  ]})),
]));
children.push(caption("Tabla 1. Escalera de perfiles. Las fronteras entre perfiles distan ~0,5 pp de volatilidad en el tramo alto."));

children.push(H("3.2. La etiqueta deriva — pero es solo composición", HeadingLevel.HEADING_2));
children.push(P(`Bajo bandas ±50%, la composición deriva con el mercado: en el perfil 6 la renta variable llega a pesar hasta el ${fmt(N.main.p6.maxRV,0)} % (objetivo 60 %) durante los tramos alcistas, lo que hace subir la etiqueta hasta el perfil ${N.main.ladder.find(l=>l.p===6)?6+ (N.main.p6.maxImpl-6):''} de forma transitoria. La volatilidad ex-ante asociada se mueve, sin embargo, en un rango estrecho (${fmt(N.main.p6.volMin)} %–${fmt(N.main.p6.volMax)} %).`));
children.push(img("fig2_deriva_p6.png", 560, 224, "Deriva de la etiqueta de perfil"));
children.push(caption("Figura 2. Perfil 6: la etiqueta implícita oscila con la composición, pero retorna a su objetivo."));

children.push(H("3.3. El riesgo REAL no aumenta (resultado central)", HeadingLevel.HEADING_2));
children.push(P([new TextRun("Este es el resultado decisivo. Al medir el riesgo "), new TextRun({text:"efectivamente realizado",bold:true}), new TextRun(" —volatilidad y máxima caída de la cartera— se observa que apenas varía al ampliar la banda, mientras la rentabilidad mejora. Ampliar la banda hasta ±50% aumenta la rentabilidad neta sin un aumento material del riesgo experimentado.")]));
children.push(img("fig3_rtb_vs_riesgo.png", 560, 308, "Rentabilidad vs riesgo realizado"));
children.push(caption("Figura 3. La rentabilidad sube con la banda; la volatilidad realizada permanece esencialmente plana."));
children.push(table([2100,1380,1380,1380,1380,1406], [
  new TableRow({ children:["Banda","CAGR neto","Vol. realizada","Máx. DD","IRPF/perfil","Meses ±1 perfil"].map((t,i)=>cell(t,[2100,1380,1380,1380,1380,1406][i],{head:true})) }),
  ...sw.map(s=>{ const hi=s.label==="±50%"; return new TableRow({ children:[
    cell(s.label,2100,{bold:hi,fill:hi?LIGHT:undefined}),
    cell(fmt(s.cagr)+" %",1380,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
    cell(fmt(s.vol)+" %",1380,{align:AlignmentType.CENTER,bold:hi,fill:hi?LIGHT:undefined}),
    cell(fmt(s.mdd,1)+" %",1380,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
    cell(eur(s.tax),1380,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
    cell(fmt(s.within1,0)+" %",1406,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
  ]});}),
]));
children.push(caption("Tabla 2. Media de los 10 perfiles. La volatilidad realizada sube solo ~0,2 pp de ±1% a ±50%; el drawdown no empeora."));

children.push(H("3.4. La banda estrecha es más cara y no más segura", HeadingLevel.HEADING_2));
children.push(P("Rebalancear con bandas estrechas obliga a vender los activos apreciados con más frecuencia, realizando plusvalías que tributan: el coste fiscal de ±1% casi triplica el de ±50%. Además, rebalancear durante una caída implica comprar el activo que cae (aumentar exposición al riesgo a la baja), por lo que la banda estrecha no reduce —e incluso empeora ligeramente— la máxima caída."));
children.push(img("fig4_fiscalidad.png", 540, 284, "Coste fiscal por banda"));
children.push(caption("Figura 4. El coste fiscal se satura: una banda del ±50% no paga más IRPF que una del ±25%."));

children.push(H("3.5. Robustez: el resultado se mantiene en 2008", HeadingLevel.HEADING_2));
children.push(P(`Extendiendo la serie a ${N.robust.first} – ${N.robust.last} para incluir la crisis financiera de 2008, la conclusión no cambia: la banda ±50% mejora la rentabilidad con una volatilidad realizada casi idéntica y un drawdown que no empeora.`));
children.push(table([3000,2000,2013,2013], [
  new TableRow({ children:["Banda","CAGR neto","Vol. realizada","Máx. drawdown"].map((t,i)=>cell(t,[3000,2000,2013,2013][i],{head:true})) }),
  ...["±1%","±25%","±50%"].map(lab=>{const s=rget(lab);const hi=lab==="±50%";return new TableRow({children:[
    cell(lab==="±1%"?"±1% (casi continuo)":lab+" relativo",3000,{bold:hi,fill:hi?LIGHT:undefined}),
    cell(fmt(s.cagr)+" %",2000,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
    cell(fmt(s.vol)+" %",2013,{align:AlignmentType.CENTER,bold:hi,fill:hi?LIGHT:undefined}),
    cell(fmt(s.mdd,1)+" %",2013,{align:AlignmentType.CENTER,fill:hi?LIGHT:undefined}),
  ]});}),
]));
children.push(caption(`Tabla 3. Robustez ${N.robust.first} – ${N.robust.last} (${N.robust.n} meses, incluye 2008). Media de los 10 perfiles.`));

// ---- 4. CONCLUSION ----
children.push(new Paragraph({ children: [new TextRun("")], pageBreakBefore: true }));
children.push(H("4. Conclusión", HeadingLevel.HEADING_1));
children.push(P([new TextRun({text:"El rebalanceo por bandas, incluso amplias (±50%), preserva el perfil de riesgo efectivo del cliente.",bold:true})]));
children.push(P("La evidencia empírica sobre más de dos décadas y los diez perfiles sostiene tres afirmaciones:"));
children.push(bullet([new TextRun({text:"El riesgo realizado no aumenta. ",bold:true}),new TextRun("La volatilidad efectiva y la máxima caída de la cartera son prácticamente idénticas entre el rebalanceo casi continuo y el de bandas ±50% (la volatilidad varía ~0,2 pp; el drawdown no empeora), también a través de la crisis de 2008.")]));
children.push(bullet([new TextRun({text:"La etiqueta de perfil es un artefacto de composición. ",bold:true}),new TextRun("Su sensibilidad procede de la fina graduación de la escala (perfiles separados por ~0,5 pp de volatilidad), no de un cambio real en el riesgo asumido. Las excursiones de la etiqueta son transitorias y revierten.")]));
children.push(bullet([new TextRun({text:"Mantener la etiqueta sería perjudicial para el cliente. ",bold:true}),new TextRun("Rebalancear de forma estrecha para fijar la etiqueta multiplica el coste fiscal (IRPF realizado) sin reducir —incluso empeorando— la máxima caída. La banda amplia es, por tanto, en interés del cliente.")]));
children.push(P([new TextRun("En consecuencia, la política de rebalanceo por bandas es consistente con el mantenimiento del perfil de riesgo del cliente a efectos de idoneidad: preserva su riesgo efectivo y optimiza su resultado neto de impuestos.")]));

// ---- 5. LIMITACIONES ----
children.push(H("5. Limitaciones y alcance", HeadingLevel.HEADING_1));
children.push(bullet("El estudio emplea índices representativos por clase de activo; los resultados son cualitativamente robustos a la elección concreta del proxy, pero los niveles absolutos pueden variar."));
children.push(bullet("Las ventanas analizadas (2013–2026 y 2004–2026) incluyen distintos regímenes de mercado (2008, 2020, 2022); resultados pasados no garantizan resultados futuros."));
children.push(bullet("La volatilidad realizada se calcula sobre retornos mensuales; el riesgo de cola se complementa con la máxima caída (drawdown)."));
children.push(bullet("El cálculo fiscal modela el IRPF del ahorro por tramos sobre plusvalías realizadas en cada rebalanceo de ETFs/acciones, sin incluir el impuesto latente diferido a la liquidación final."));
children.push(P([new TextRun({text:"Aviso. ",bold:true}),new TextRun("Documento de trabajo con fines de análisis. No constituye asesoramiento de inversión ni recomendación. El Proyecto K no es una entidad de asesoramiento financiero regulada.")],{spacing:{before:200}}));

const doc = new Document({
  creator: "El Proyecto K",
  title: "Estabilidad del perfil de riesgo bajo rebalanceo por bandas",
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: RED },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 280 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "El Proyecto K · Estudio perfil-bandas · ", size: 16, color: "999999" }),
                 new TextRun({ children: ["Página ", PageNumber.CURRENT], size: 16, color: "999999" })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join("C:\\ClaudeTest", "Estudio_CNMV_perfil_bandas.docx");
  fs.writeFileSync(out, buf);
  console.log("OK ->", out, "(" + buf.length + " bytes)");
});
