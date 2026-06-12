/* ============================================================
   Cartera Core – El Proyecto K
   Datos: catálogos de productos + tablas de pesos por perfil
   Extraído del Excel "Cartera Core El Proyecto K v3"
   ============================================================ */

/* ---------- BROKERS ---------- */
const BROKERS = [
  { id: 'myinvestor',    nombre: 'MyInvestor',         tiposPermitidos: ['fondo', 'etf'], nota: 'Marketplace amplio de fondos y ETFs UCITS.' },
  { id: 'renta4',        nombre: 'Renta 4',            tiposPermitidos: ['fondo', 'etf'], nota: 'Banco con catálogo amplio de fondos UCITS y acceso a ETFs en bolsas europeas.' },
  { id: 'ibkr',          nombre: 'Interactive Brokers',tiposPermitidos: ['etf'],         nota: 'Broker bursátil global. Solo ETFs UCITS para residentes UE.' },
  { id: 'degiro',        nombre: 'DeGiro',             tiposPermitidos: ['etf'],         nota: 'Solo ETFs. Tiene Core Selection con condiciones más ventajosas.' },
  { id: 'traderepublic', nombre: 'Trade Republic',     tiposPermitidos: ['etf'],         nota: 'Solo ETFs cotizados, principalmente Xetra. Catálogo más limitado.' }
];

// Disponibilidad por defecto: todos los fondos en MyInvestor+Renta4; todos los ETFs en los 5
const BROKERS_FONDOS = ['myinvestor', 'renta4'];
const BROKERS_ETFS   = ['myinvestor', 'renta4', 'ibkr', 'degiro', 'traderepublic'];

const DATA = {

  BROKERS,

  /* ---------- CONFIG: Pesos por clase y perfil de riesgo (1-10) ---------- */

  // Volatilidad objetivo (1 desviación estándar) por nivel de riesgo
  volatilidad: [0.05, 0.055, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13],

  // Rentabilidad esperada (referencia Indexa Capital)
  rentabilidad: [0.030, 0.033, 0.036, 0.038, 0.041, 0.044, 0.046, 0.049, 0.052, 0.056],

  // Pesos por clase de activo (riesgo 1..10)
  pesosClase: {
    rentaVariable: [0.10, 0.15, 0.25, 0.35, 0.45, 0.60, 0.65, 0.70, 0.75, 0.80],
    rentaFija:     [0.75, 0.70, 0.60, 0.50, 0.35, 0.20, 0.15, 0.10, 0.05, 0.00],
    oro:           [0.15, 0.15, 0.15, 0.15, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20]
  },

  // Sub-distribución renta variable: GEO (MSCI ACWI)
  pesosGeo: {
    global: 0.93,
    emergente: 0.07
  },

  // Sub-distribución renta variable: SECTOR v1 (5 sectores)
  pesosSectorV1: {
    'MSCI Staple':       0.250,
    'MSCI Health Care':  0.250,
    'MSCI Technology':   0.250,
    'MSCI Energy':       0.125,
    'Global Real Estate':0.125
  },

  // Sub-distribución renta variable: SECTOR v2 (6 sectores)
  pesosSectorV2: {
    'MSCI Staple':       0.125,
    'MSCI Utilities':    0.125,
    'MSCI Health Care':  0.250,
    'MSCI Technology':   0.250,
    'MSCI Energy':       0.125,
    'Global Real Estate':0.125
  },

  // Sub-distribución renta fija (riesgo 1..10)
  pesosRentaFija: {
    gubernamental: [0.65, 0.55, 0.45, 0.35, 0.25, 0.20, 0.15, 0.10, 0.05, 0.00],
    corporativa:   [0.08, 0.11, 0.10, 0.09, 0.06, 0.00, 0.00, 0.00, 0.00, 0.00],
    highYield:     [0.02, 0.04, 0.05, 0.06, 0.04, 0.00, 0.00, 0.00, 0.00, 0.00]
  },

  /* ---------- TEST DE PERFIL DE RIESGO ---------- */

  preguntasCapacidad: [
    {
      pregunta: '1. ¿Cuándo necesitarás retirar el 50% o más de este dinero?',
      opciones: [
        { texto: 'Menos de 3 años', puntos: 0 },
        { texto: '3-7 años', puntos: 8 },
        { texto: '8-15 años', puntos: 20 },
        { texto: '16-25 años', puntos: 30 },
        { texto: 'Más de 25 años', puntos: 40 }
      ]
    },
    {
      pregunta: '2. Describe tu situación laboral/ingresos:',
      opciones: [
        { texto: 'Ingresos variables, autónomo sin colchón', puntos: 0 },
        { texto: 'Empleado con contrato temporal', puntos: 3 },
        { texto: 'Empleado fijo, sector estable', puntos: 7 },
        { texto: 'Funcionario o ingresos pasivos recurrentes', puntos: 12 }
      ]
    },
    {
      pregunta: '3. Fuera de esta inversión, ¿cuántos meses de gastos tienes en liquidez?',
      opciones: [
        { texto: 'Menos de 3 meses', puntos: 0 },
        { texto: '3-6 meses', puntos: 6 },
        { texto: '6-12 meses', puntos: 11 },
        { texto: 'Más de 12 meses', puntos: 16 }
      ]
    },
    {
      pregunta: '4. ¿Qué % de tu patrimonio líquido total representa esta inversión?',
      opciones: [
        { texto: 'Más del 80%', puntos: 0 },
        { texto: '60-80%', puntos: 4 },
        { texto: '40-60%', puntos: 9 },
        { texto: '20-40%', puntos: 14 },
        { texto: 'Menos del 20%', puntos: 20 }
      ]
    },
    {
      pregunta: '5. ¿Tienes deudas significativas?',
      opciones: [
        { texto: 'Sí, deudas >50% de ingresos mensuales netos', puntos: 0 },
        { texto: 'Sí, deudas entre 30-50% de ingresos', puntos: 4 },
        { texto: 'Sí, solo hipoteca razonable (<30% ingresos)', puntos: 8 },
        { texto: 'No, sin deudas', puntos: 12 }
      ]
    }
  ],

  preguntasActitud: [
    {
      pregunta: '6. ¿Has vivido una caída del mercado >20% con dinero invertido?',
      opciones: [
        { texto: 'Nunca he invertido (aún no tengo experiencia)', puntos: 10 },
        { texto: 'Sí, y vendí en pánico', puntos: 0 },
        { texto: 'Sí, y aguanté con mucho estrés', puntos: 8 },
        { texto: 'Sí, y aguanté sin problema', puntos: 15 },
        { texto: 'Sí, y compré más aprovechando', puntos: 20 }
      ]
    },
    {
      pregunta: '7. Tienes 100.000€ invertidos. En 6 meses, el mercado cae 40% y tu cartera vale 60.000€. ¿Qué haces?',
      opciones: [
        { texto: 'Vendo todo inmediatamente', puntos: 0 },
        { texto: 'Vendo la mitad para "asegurar"', puntos: 6 },
        { texto: 'Me estreso pero aguanto sin vender', puntos: 13 },
        { texto: 'No me preocupa, mantengo según plan', puntos: 20 },
        { texto: 'Aprovecho para aportar más', puntos: 25 }
      ]
    },
    {
      pregunta: '8. ¿Cada cuánto revisas el valor de tu cartera?',
      opciones: [
        { texto: 'Diariamente', puntos: 0 },
        { texto: 'Semanalmente', puntos: 3 },
        { texto: 'Mensualmente', puntos: 6 },
        { texto: 'Trimestralmente', puntos: 9 },
        { texto: 'Anualmente o menos', puntos: 12 }
      ]
    },
    {
      pregunta: '9. Tu cartera lleva 2 años rindiendo -5% anual mientras el plazo fijo da +2%. ¿Cómo te sientes?',
      opciones: [
        { texto: 'Muy mal, fue un error invertir', puntos: 0 },
        { texto: 'Mal, considero seriamente cambiar de estrategia', puntos: 5 },
        { texto: 'Incómodo pero entiendo que es volatilidad normal', puntos: 11 },
        { texto: 'Tranquilo, son solo 2 años en un horizonte largo', puntos: 18 }
      ]
    },
    {
      pregunta: '10. ¿Qué priorizas en tu inversión?',
      opciones: [
        { texto: 'Tranquilidad total, prefiero dormir bien aunque gane menos', puntos: 0 },
        { texto: 'Balance entre rentabilidad y paz mental', puntos: 10 },
        { texto: 'Rentabilidad esperada, acepto volatilidad como parte del juego', puntos: 18 },
        { texto: 'Máxima rentabilidad esperada, la volatilidad no me afecta emocionalmente', puntos: 25 }
      ]
    }
  ],

  perfiles: [
    {
      rango: [0, 20], titulo: 'Conservador (0-20 puntos)',
      objetivo: 'IPC + 1 a 2% durante un periodo móvil de tres años. Objetivo de Rendimiento: 1-2.',
      descripcion: 'Un inversor conservador busca preservar su capital de inversión y es en gran medida adverso al riesgo. Requiere consistencia y baja variabilidad en los rendimientos, así como acceso al capital dentro de los primeros tres años.'
    },
    {
      rango: [21, 40], titulo: 'Moderadamente Conservador (21-40 puntos)',
      objetivo: 'IPC + 2 a 3% en un periodo de tres años. Objetivo de Rendimiento: 3-4.',
      descripcion: 'Busca preservar su capital de inversión mientras logra un crecimiento estable. Requiere consistencia en los rendimientos y puede necesitar ingresos regulares y acceso al capital dentro de un periodo de tres años.'
    },
    {
      rango: [41, 60], titulo: 'Moderado (41-60 puntos)',
      objetivo: 'IPC + 3 a 4% durante cinco años. Objetivo de Rendimiento: 5-6.',
      descripcion: 'Prefiere el crecimiento de capital sobre la preservación. Está dispuesto a tolerar fluctuaciones moderadas en los rendimientos, puede necesitar ingresos regulares y está preparado para invertir por un periodo mínimo de cinco años.'
    },
    {
      rango: [61, 80], titulo: 'Moderadamente Agresivo (61-80 puntos)',
      objetivo: 'IPC + 4 a 5% durante siete años. Objetivo de Rendimiento: 7-8.',
      descripcion: 'Busca el crecimiento del capital y está dispuesto a tolerar fluctuaciones similares a las de los mercados de renta variable. Puede requerir un pequeño ingreso y está preparado para invertir por un periodo mínimo de siete años.'
    },
    {
      rango: [81, 100], titulo: 'Agresivo (81-100 puntos)',
      objetivo: 'IPC + 5 a 6% durante diez años. Objetivo de Rendimiento: 9-10.',
      descripcion: 'Busca el máximo crecimiento del capital. Tolera fluctuaciones similares a las observadas en los mercados de renta variable, puede requerir un pequeño ingreso y está preparado para invertir por un periodo mínimo de diez años.'
    }
  ],

  /* ---------- CATÁLOGO DE FONDOS DE INVERSIÓN INDEXADA ---------- */

  fondos: {
    'Renta Variable': [
      { nombre:'Vanguard U.S. 500 Stock Index Fund Investor EUR Accumulation', isin:'IE0032126645', ter:0.0010, gestora:'Vanguard', mercado:'USA', categoria:'Renta Variable', broker:'' },
      { nombre:'Fidelity S&P 500 Index Fund P-ACC-EUR', isin:'IE00BYX5MX67', ter:0.0006, gestora:'Fidelity', mercado:'USA', categoria:'Renta Variable', broker:'' },
      { nombre:'Vanguard European Stock Index Fund Investor EUR Accumulation', isin:'IE0007987690', ter:0.0012, gestora:'Vanguard', mercado:'Europa', categoria:'Renta Variable', broker:'' },
      { nombre:'Fidelity MSCI Europe Index Fund EUR P Acc', isin:'IE00BYX5MD61', ter:0.0010, gestora:'Fidelity', mercado:'Europa', categoria:'Renta Variable', broker:'' },
      { nombre:'Vanguard Japan Stock Index Inv EUR Acc', isin:'IE0007281425', ter:0.0016, gestora:'Vanguard', mercado:'Japón', categoria:'Renta Variable', broker:'' },
      { nombre:'Fidelity MSCI Japan Index Fund EUR P Acc', isin:'IE00BYX5N771', ter:0.0010, gestora:'Fidelity', mercado:'Japón', categoria:'Renta Variable', broker:'' },
      { nombre:'Vanguard Pacific ex-Japan Stock Index Fund EUR Acc', isin:'IE0007201266', ter:0.0016, gestora:'Vanguard', mercado:'Asia ExJapón', categoria:'Renta Variable', broker:'' },
      { nombre:'iShares Emerging Markets Index Fund (IE) D Acc EUR', isin:'IE00BYWYCC39', ter:0.0020, gestora:'Blackrock', mercado:'Emergentes', categoria:'Renta Variable', broker:'' },
      { nombre:'Vanguard Emerging Markets Stock Index Fund EUR Acc', isin:'IE0031786696', ter:0.0023, gestora:'Vanguard', mercado:'Emergentes', categoria:'Renta Variable', broker:'' },
      { nombre:'iShares Emerging Markets Index Fund (IE) Acc EUR clase S', isin:'IE000QAZP7L2', ter:0.0016, gestora:'Blackrock', mercado:'Emergentes', categoria:'Renta Variable', broker:'MyInvestor' },
      { nombre:'Vanguard Global Small-Cap Index Fund Investor EUR Accumulation', isin:'IE00B42W3S00', ter:0.0030, gestora:'Vanguard', mercado:'Small Caps', categoria:'Renta Variable', broker:'' },
      { nombre:'Vanguard Global Stock Index Fund EUR Acc', isin:'IE00B03HD191', ter:0.0018, gestora:'Vanguard', mercado:'Global Desarrollado', categoria:'Renta Variable', broker:'' },
      { nombre:'Fidelity MSCI World Index Fund P-ACC-EUR', isin:'IE00BYX5NX33', ter:0.0012, gestora:'Fidelity', mercado:'Global Desarrollado', categoria:'Renta Variable', broker:'MyInvestor' },
      { nombre:'iShares Dev Wld Idx (IE) S Acc EUR', isin:'IE000ZYRH0Q7', ter:0.0006, gestora:'Blackrock', mercado:'Global Desarrollado', categoria:'Renta Variable', broker:'MyInvestor' },
      { nombre:'iShares Developed World ESG Screened Index Fund (IE) D Acc EUR', isin:'IE000N51F726', ter:0.0015, gestora:'Blackrock', mercado:'Global Desarrollado', categoria:'Renta Variable', broker:'MyInvestor', notas:'ESG' }
    ],
    'Renta Fija – Largo Plazo (Duración > 10 años)': [
      { nombre:'Vanguard 20+ Year Euro Treasury Index Fund', isin:'IE00B246KL88', ter:0.0016, gestora:'Vanguard', mercado:'Europa', plazo:'Largo Plazo', duracion:19.9, categoria:'Pública' }
    ],
    'Renta Fija – Medio Plazo (Duración 4-10 años)': [
      { nombre:'Vanguard US Government Bond Index Fund EUR Hedged', isin:'IE0007471471', ter:0.0012, gestora:'Vanguard', mercado:'USA', plazo:'Medio Plazo', duracion:5.79, categoria:'Pública' },
      { nombre:'Vanguard Euro Government Bond Index Fund EUR Acc', isin:'IE0007472990', ter:0.0012, gestora:'Vanguard', mercado:'Europa', plazo:'Medio Plazo', duracion:7, categoria:'Pública' },
      { nombre:'iShares Ultra High Quality Euro Government Bond Index Fund (IE) Institutional Acc EUR', isin:'IE00B4XCK338', ter:0.0013, gestora:'Blackrock', mercado:'Europa', plazo:'Medio Plazo', duracion:7.58, categoria:'Pública' },
      { nombre:'Vanguard Eurozone Inflation-Linked Bond Idx Inv EUR Acc', isin:'IE00B04GQQ17', ter:0.0012, gestora:'Vanguard', mercado:'Europa', plazo:'TIPS/Medio Plazo', duracion:7.11, categoria:'Pública' },
      { nombre:'Vanguard Global Corporate Bond Index Fund EUR Hedged Accumulation', isin:'IE00BDFB5N63', ter:0.0018, gestora:'Vanguard', mercado:'Global', plazo:'Medio Plazo', duracion:6, categoria:'Corporativa' }
    ],
    'Renta Fija – Corto Plazo (Duración < 4 años)': [
      { nombre:'Vanguard Global Short Term Bond Ix Inv EURH Acc', isin:'IE00BH65QK91', ter:0.0015, gestora:'Vanguard', mercado:'Global', plazo:'Corto Plazo', duracion:2.69, categoria:'Mixto' },
      { nombre:'iShares Euro Investment Grade Corporate Bond Index Fund (IE) D Acc EUR', isin:'IE00BDRK7J14', ter:0.0012, gestora:'Blackrock', mercado:'Global', plazo:'Corto Plazo', duracion:4.42, categoria:'Corporativa' }
    ],
    'Renta Fija – High Yield / Emergentes': [
      { nombre:'Vanguard Emerging Markets Bond Fund Investor EUR Hedged Accumulation', isin:'IE00BKLWXS37', ter:0.0061, gestora:'Vanguard', mercado:'Emergentes', plazo:'Medio Plazo', duracion:6, categoria:'High Yield' },
      { nombre:'iShares Emerging Markets Government Bond Index Fund (LU) A2 EUR Hedged', isin:'LU1373035580', ter:0.0052, gestora:'Blackrock', mercado:'Emergentes', plazo:'Medio Plazo', duracion:6.66, categoria:'High Yield' }
    ]
  },

  /* ---------- CATÁLOGO DE ETFs ---------- */

  etfs: {
    'Renta Variable – Geográfica': [
      { ticker:'VUAA', nombre:'Vanguard S&P 500 UCITS ETF (USD) Accumulating', isin:'IE00BFMXXD54', ter:0.0007, gestora:'Vanguard', mercado:'USA', categoria:'Renta Variable', broker:'' },
      { ticker:'EUNK', nombre:'iShares Core MSCI Europe UCITS ETF EUR (Acc)', isin:'IE00B4K48X80', ter:0.0012, gestora:'Blackrock', mercado:'Europa', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'VJPA', nombre:'Vanguard FTSE Japan UCITS ETF Accumulating', isin:'IE00BFMXYX26', ter:0.0015, gestora:'Vanguard', mercado:'Japón', categoria:'Renta Variable', broker:'' },
      { ticker:'SXR1', nombre:'iShares Core MSCI Pacific ex Japan UCITS ETF (Acc)', isin:'IE00B52MJY50', ter:0.0020, gestora:'Blackrock', mercado:'Asia ExJapón', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'IS3N', nombre:'iShares Core MSCI Emerging Markets IMI UCITS ETF (Acc)', isin:'IE00BKM4GZ66', ter:0.0023, gestora:'Blackrock', mercado:'Emergentes', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'ZPRS', nombre:'SPDR MSCI World Small Cap UCITS ETF', isin:'IE00BCBJG560', ter:0.0045, gestora:'SPDR', mercado:'Small Caps', categoria:'Renta Variable', broker:'MyInvestor' }
    ],
    'Renta Variable – Global': [
      { ticker:'EUNL', nombre:'iShares Core MSCI World UCITS ETF USD (Acc)', isin:'IE00B4L5Y983', ter:0.0020, gestora:'Blackrock', mercado:'Global Desarrollado', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'SPPW', nombre:'SPDR MSCI World UCITS ETF', isin:'IE00BFY0GT14', ter:0.0012, gestora:'SPDR', mercado:'Global Desarrollado', categoria:'Renta Variable', broker:'' },
      { ticker:'SPYY', nombre:'SPDR MSCI ACWI UCITS ETF', isin:'IE00B44Z5B48', ter:0.0012, gestora:'SPDR', mercado:'Global con Emergentes', categoria:'Renta Variable', broker:'' },
      { ticker:'IUSQ', nombre:'iShares MSCI ACWI UCITS ETF USD (Acc)', isin:'IE00B6R52259', ter:0.0020, gestora:'Blackrock', mercado:'Global con Emergentes', categoria:'Renta Variable', broker:'MyInvestor' }
    ],
    'Renta Variable – Sectorial': [
      { ticker:'XDWS', nombre:'Xtrackers MSCI World Consumer Staples UCITS ETF 1C', isin:'IE00BM67HN09', ter:0.0025, gestora:'Xtrackers', mercado:'Consumo básico', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'XDWH', nombre:'Xtrackers MSCI World Health Care UCITS ETF 1C', isin:'IE00BM67HK77', ter:0.0025, gestora:'Xtrackers', mercado:'Salud', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'LYPE', nombre:'Amundi MSCI World Health Care UCITS ETF EUR Acc', isin:'LU0533033238', ter:0.0030, gestora:'Amundi/Lyxor', mercado:'Salud', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'XDWT', nombre:'Xtrackers MSCI World Information Technology UCITS ETF 1C', isin:'IE00BM67HT60', ter:0.0025, gestora:'Xtrackers', mercado:'Tecnología', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'XDW0', nombre:'Xtrackers MSCI World Energy UCITS ETF 1C', isin:'IE00BM67HM91', ter:0.0025, gestora:'Xtrackers', mercado:'Energía', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'A4H5', nombre:'Amundi Index FTSE EPRA NAREIT Global UCITS ETF DR', isin:'LU1437018838', ter:0.0024, gestora:'Amundi', mercado:'Real Estate', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'XDWU', nombre:'Xtrackers MSCI World Utilities UCITS ETF 1C', isin:'IE00BM67HQ30', ter:0.0025, gestora:'Xtrackers', mercado:'Utilities', categoria:'Renta Variable', broker:'MyInvestor' },
      { ticker:'H4Z7', nombre:'HSBC FTSE EPRA NAREIT Developed UCITS ETF USD (Acc)', isin:'IE000G6GSP88', ter:0.0024, gestora:'HSBC', mercado:'Real Estate', categoria:'Renta Variable', broker:'' }
    ],
    'Renta Fija – Deuda Pública Largo Plazo (>10 años)': [
      { ticker:'LMTH', nombre:'Amundi Euro Government Bond 25+Y UCITS ETF Acc', isin:'LU1686832194', ter:0.0007, gestora:'Amundi', mercado:'Europa', plazo:'Largo Plazo', duracion:22, categoria:'Pública', broker:'' },
      { ticker:'LYQ6', nombre:'Amundi Euro Government Bond 10-15Y UCITS ETF Acc', isin:'LU1650489385', ter:0.0015, gestora:'Amundi', mercado:'Europa', plazo:'Largo Plazo', duracion:10.25, categoria:'Pública', broker:'MyInvestor' }
    ],
    'Renta Fija – Deuda Pública Medio Plazo (4-10 años)': [
      { ticker:'DBZB', nombre:'Xtrackers II Global Government Bond UCITS ETF 1C EUR Hedged', isin:'LU0378818131', ter:0.0025, gestora:'Xtrackers', mercado:'Global', plazo:'Mixto', duracion:6.84, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'LYXD', nombre:'Amundi Euro Government Bond 7-10Y UCITS ETF Acc', isin:'LU1287023185', ter:0.0015, gestora:'Amundi', mercado:'Europa', plazo:'Medio Plazo', duracion:7.31, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'X57E', nombre:'Xtrackers Eurozone Government Bond 5-7 UCITS ETF 1C', isin:'LU0290357176', ter:0.0015, gestora:'Xtrackers', mercado:'Europa', plazo:'Medio Plazo', duracion:5.6, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'SXRP', nombre:'iShares Euro Government Bond 3-7yr UCITS ETF (Acc)', isin:'IE00B3VTML14', ter:0.0015, gestora:'Blackrock', mercado:'Europa', plazo:'Medio Plazo', duracion:4.44, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'7USH', nombre:'Amundi US Treasury Bond 7-10Y UCITS ETF EUR Hedged Acc', isin:'LU1407888137', ter:0.0006, gestora:'Amundi', mercado:'USA', plazo:'Medio Plazo', duracion:7.24, categoria:'Pública', broker:'' },
      { ticker:'VDTE', nombre:'Vanguard USD Treasury Bond UCITS ETF EUR Hedged Accumulating', isin:'IE00BMX0B631', ter:0.0012, gestora:'Vanguard', mercado:'USA', plazo:'Mixto', duracion:6.01, categoria:'Pública', broker:'MyInvestor' }
    ],
    'Renta Fija – Deuda Pública Corto Plazo (<4 años)': [
      { ticker:'LYQ3', nombre:'Amundi Euro Government Bond 3-5Y UCITS ETF Acc', isin:'LU1650488494', ter:0.0015, gestora:'Amundi', mercado:'Europa', plazo:'Corto Plazo', duracion:3.73, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'LYQ2', nombre:'Amundi Euro Government Bond 1-3Y UCITS ETF Acc', isin:'LU1650487413', ter:0.0015, gestora:'Amundi', mercado:'Europa', plazo:'Corto Plazo', duracion:1.31, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'2B7S', nombre:'iShares USD Treasury Bond 1-3yr UCITS ETF EUR Hedged (Acc)', isin:'IE00BDFK1573', ter:0.0010, gestora:'Blackrock', mercado:'USA', plazo:'Corto Plazo', duracion:1.88, categoria:'Pública', broker:'MyInvestor' }
    ],
    'Renta Fija – Deuda Corporativa': [
      { ticker:'VECA', nombre:'Vanguard EUR Corporate Bond UCITS ETF Accumulating', isin:'IE00BGYWT403', ter:0.0009, gestora:'Vanguard', mercado:'Global', plazo:'Mixto', duracion:4.48, categoria:'Corporativa', broker:'MyInvestor' },
      { ticker:'D5BG', nombre:'Xtrackers II EUR Corporate Bond UCITS ETF 1C', isin:'LU0478205379', ter:0.0012, gestora:'Xtrackers', mercado:'Europa', plazo:'Mixto', duracion:4.51, categoria:'Corporativa', broker:'MyInvestor' },
      { ticker:'XZE5', nombre:'Xtrackers II EUR Corporate Bond Short Duration SRI PAB UCITS ETF 1C', isin:'LU2178481649', ter:0.0016, gestora:'Xtrackers', mercado:'Europa', plazo:'Corto Plazo', duracion:2.38, categoria:'Corporativa', broker:'MyInvestor' },
      { ticker:'A4H8', nombre:'Amundi Index Euro Corporate SRI UCITS ETF DR (C)', isin:'LU1437018168', ter:0.0014, gestora:'Amundi', mercado:'Europa', plazo:'Mixto', duracion:4.44, categoria:'Corporativa', broker:'MyInvestor' },
      { ticker:'UEF8', nombre:'UBS ETF (LU) Bloomberg US Liquid Corporates 1-5 Year UCITS ETF (hedged to EUR) A-acc', isin:'LU1048315243', ter:0.0019, gestora:'UBS', mercado:'USA', plazo:'Corto Plazo', duracion:3.3, categoria:'Corporativa', broker:'MyInvestor' }
    ],
    'Renta Fija – High Yield': [
      { ticker:'SXRI', nombre:'iShares EUR High Yield Corporate Bond UCITS ETF EUR (Acc)', isin:'IE00BF3N7094', ter:0.0050, gestora:'Blackrock', mercado:'Europa', plazo:'Mixto', duracion:2.32, categoria:'High Yield', broker:'' },
      { ticker:'XHYA', nombre:'Xtrackers EUR High Yield Corporate Bond UCITS ETF 1C', isin:'LU1109943388', ter:0.0020, gestora:'Xtrackers', mercado:'Europa', plazo:'Mixto', duracion:2.28, categoria:'High Yield', broker:'' },
      { ticker:'AYE2', nombre:'iShares EUR High Yield Corporate Bond ESG UCITS ETF EUR (Acc)', isin:'IE00BJK55C48', ter:0.0025, gestora:'Blackrock', mercado:'Europa', plazo:'Mixto', duracion:3.35, categoria:'High Yield', broker:'MyInvestor' }
    ],
    'Renta Fija – Global (Agregado)': [
      { ticker:'EUNA', nombre:'iShares Core Global Aggregate Bond UCITS ETF EUR Hedged (Acc)', isin:'IE00BDBRDM35', ter:0.0010, gestora:'Blackrock', mercado:'Global', plazo:'Mixto', duracion:6.51, categoria:'Mixto', broker:'MyInvestor' },
      { ticker:'VAGF', nombre:'Vanguard Global Aggregate Bond UCITS ETF EUR Hedged Accumulating', isin:'IE00BG47KH54', ter:0.0010, gestora:'Vanguard', mercado:'Global', plazo:'Mixto', duracion:6.55, categoria:'Mixto', broker:'' }
    ],
    'Renta Fija – Bonos Ligados a Inflación (TIPS)': [
      { ticker:'IBCI', nombre:'iShares Euro Inflation Linked Government Bond UCITS ETF', isin:'IE00B0M62X26', ter:0.0009, gestora:'Blackrock', mercado:'Europa', plazo:'TIPS', duracion:7.83, categoria:'Pública', broker:'MyInvestor' },
      { ticker:'LYQ7', nombre:'Amundi Euro Government Inflation-Linked Bond UCITS ETF Acc', isin:'LU1650491282', ter:0.0009, gestora:'Amundi', mercado:'Europa', plazo:'TIPS', duracion:8.2, categoria:'Pública', broker:'MyInvestor' }
    ],
    'Oro': [
      { ticker:'8PSG', nombre:'Invesco Physical Gold A', isin:'IE00B579F325', ter:0.0012, gestora:'Invesco', mercado:'Global', broker:'MyInvestor' },
      { ticker:'PPFB', nombre:'iShares Physical Gold ETC', isin:'IE00B4ND3602', ter:0.0012, gestora:'Blackrock', mercado:'Global', broker:'MyInvestor' }
    ]
  },

  /* ---------- DEFINICIÓN DE LAS 4 HOJAS DE CONTROL ---------- */

  carteras: {
    geoFondos: {
      titulo: 'Geográfica con Fondos de Inversión',
      descripcion: 'Distribución por regiones del mundo (Global Desarrollado + Emergentes) usando fondos indexados.',
      tipo: 'geo',
      rentaVariable: [
        { clave:'Global',     producto:'Fidelity MSCI World Index Fund P-ACC-EUR' },
        { clave:'Emergente',  producto:'Vanguard Emerging Markets Stock Index Fund EUR Acc' }
      ],
      rentaFija: [
        { clave:'Largo Plazo', tipo:'gubernamental', producto:'Vanguard 20+ Year Euro Treasury Index Fund', duracion:19.9 },
        { clave:'Medio Plazo', tipo:'gubernamental', producto:'iShares Ultra High Quality Euro Government Bond Index Fund (IE) Institutional', duracion:7.58 },
        { clave:'Corto Plazo', tipo:'gubernamental', producto:'Vanguard Global Short Term Bond Ix Inv EURH Acc', duracion:2.69 },
        { clave:'Corporativa', tipo:'corporativa',   producto:'iShares Euro Investment Grade Corporate Bond Index Fund', duracion:4.42 },
        { clave:'High Yield',  tipo:'highYield',     producto:'Vanguard Emerging Markets Bond Fund Investor EUR Hedged', duracion:6 }
      ],
      oro: { producto:'AXA Trésor Court Terme C (alternativa monetario)' }
    },
    geoEtfs: {
      titulo: 'Geográfica con ETFs',
      descripcion: 'Distribución por regiones del mundo usando ETFs (con o sin emergentes incluidos).',
      tipo: 'geo',
      rentaVariable: [
        { clave:'Global',     producto:'SPDR MSCI ACWI UCITS ETF (incluye emergentes)' }
      ],
      rentaFija: [
        { clave:'Largo Plazo', tipo:'gubernamental', producto:'Amundi Euro Government Bond 10-15Y UCITS ETF Acc', duracion:10.25 },
        { clave:'Medio Plazo', tipo:'gubernamental', producto:'Xtrackers II Global Government Bond UCITS ETF 1C EUR Hedged', duracion:6.84 },
        { clave:'Corto Plazo', tipo:'gubernamental', producto:'iShares USD Treasury Bond 1-3yr UCITS ETF EUR Hedged (Acc)', duracion:1.88 },
        { clave:'Corporativa', tipo:'corporativa',   producto:'Vanguard EUR Corporate Bond UCITS ETF Accumulating', duracion:4.48 },
        { clave:'High Yield',  tipo:'highYield',     producto:'iShares EUR High Yield Corporate Bond ESG UCITS ETF EUR (Acc)', duracion:3.35 }
      ],
      oro: { producto:'Invesco Physical Gold A' }
    },
    sectorEtfs: {
      titulo: 'Sectorial con ETFs (5 sectores)',
      descripcion: 'Reparte la renta variable por 5 sectores defensivos y de crecimiento (Consumo Básico, Salud, Tecnología, Energía y Real Estate).',
      tipo: 'sector',
      sectores: 'v1',
      rentaVariable: [
        { clave:'MSCI Staple',         producto:'Xtrackers MSCI World Consumer Staples UCITS ETF 1C' },
        { clave:'MSCI Health Care',    producto:'Xtrackers MSCI World Health Care UCITS ETF 1C' },
        { clave:'MSCI Technology',     producto:'Xtrackers MSCI World Information Technology UCITS ETF 1C' },
        { clave:'MSCI Energy',         producto:'Xtrackers MSCI World Energy UCITS ETF 1C' },
        { clave:'Global Real Estate',  producto:'Amundi Index FTSE EPRA NAREIT Global UCITS ETF DR' }
      ],
      rentaFija: [
        { clave:'Largo Plazo', tipo:'gubernamental', producto:'Amundi Euro Government Bond 10-15Y UCITS ETF Acc', duracion:10.25 },
        { clave:'Medio Plazo', tipo:'gubernamental', producto:'Xtrackers II Global Government Bond UCITS ETF 1C EUR Hedged', duracion:6.84 },
        { clave:'Corto Plazo', tipo:'gubernamental', producto:'iShares USD Treasury Bond 1-3yr UCITS ETF EUR Hedged (Acc)', duracion:1.88 },
        { clave:'Corporativa', tipo:'corporativa',   producto:'Vanguard EUR Corporate Bond UCITS ETF Accumulating', duracion:4.44 },
        { clave:'High Yield',  tipo:'highYield',     producto:'iShares EUR High Yield Corporate Bond ESG UCITS ETF EUR (Acc)', duracion:3.38 }
      ],
      oro: { producto:'Invesco Physical Gold A' }
    },
    sectorEtfsV2: {
      titulo: 'Sectorial con ETFs (6 sectores)',
      descripcion: 'Variante de la anterior añadiendo Utilities como sector defensivo.',
      tipo: 'sector',
      sectores: 'v2',
      rentaVariable: [
        { clave:'MSCI Staple',         producto:'Xtrackers MSCI World Consumer Staples UCITS ETF 1C' },
        { clave:'MSCI Utilities',      producto:'Xtrackers MSCI World Utilities UCITS ETF 1C' },
        { clave:'MSCI Health Care',    producto:'Xtrackers MSCI World Health Care UCITS ETF 1C' },
        { clave:'MSCI Technology',     producto:'Xtrackers MSCI World Information Technology UCITS ETF 1C' },
        { clave:'MSCI Energy',         producto:'Xtrackers MSCI World Energy UCITS ETF 1C' },
        { clave:'Global Real Estate',  producto:'Amundi Index FTSE EPRA NAREIT Global UCITS ETF DR' }
      ],
      rentaFija: [
        { clave:'Largo Plazo', tipo:'gubernamental', producto:'Amundi Euro Government Bond 10-15Y UCITS ETF Acc', duracion:10.25 },
        { clave:'Medio Plazo', tipo:'gubernamental', producto:'Xtrackers II Global Government Bond UCITS ETF 1C EUR Hedged', duracion:6.84 },
        { clave:'Corto Plazo', tipo:'gubernamental', producto:'iShares USD Treasury Bond 1-3yr UCITS ETF EUR Hedged (Acc)', duracion:1.88 },
        { clave:'Corporativa', tipo:'corporativa',   producto:'Vanguard EUR Corporate Bond UCITS ETF Accumulating', duracion:4.44 },
        { clave:'High Yield',  tipo:'highYield',     producto:'iShares EUR High Yield Corporate Bond ESG UCITS ETF EUR (Acc)', duracion:3.38 }
      ],
      oro: { producto:'Invesco Physical Gold A' }
    }
  },

  /* ---------- GLOSARIO ---------- */

  glosario: [
    ['TER',              'Total Expense Ratio - Coste anual del fondo (cuanto más bajo, mejor).'],
    ['ISIN',             'Código identificador único de cada fondo o ETF.'],
    ['Renta Variable',   'Acciones - mayor rentabilidad potencial, mayor riesgo.'],
    ['Renta Fija',       'Bonos - menor rentabilidad, menor riesgo, estabiliza la cartera.'],
    ['Cisne Negro',      'Evento extremo de mercado (-3 desviaciones típicas).'],
    ['Rebalanceo',       'Ajustar la cartera para volver a los pesos objetivo comprando/vendiendo.'],
    ['Duración Mod.',    'Sensibilidad del bono a cambios en tipos de interés (mayor duración = más riesgo).'],
    ['DCA',              'Dollar Cost Averaging - Invertir periódicamente para suavizar el precio medio de compra.'],
    ['Tracking Error',   'Diferencia de rentabilidad entre un fondo indexado y su índice (menor = mejor).'],
    ['Cobertura divisa', 'Protección contra el riesgo de tipo de cambio (fondos EUR Hedged).'],
    ['UCITS',            'Normativa europea que garantiza transparencia y protección al inversor en fondos.'],
    ['Acumulación',      'El fondo reinvierte los dividendos automáticamente (Acc en el nombre).'],
    ['Distribución',     'El fondo reparte los dividendos al inversor (Dist/Inc en el nombre).'],
    ['ETF vs Fondo',     'ETF se compra/vende en bolsa al instante; el Fondo se suscribe con el valor liquidativo del día.']
  ]
};

/* ---------- POST-PROCESADO: enriquece cada producto con tipo + brokers ----------
   Por defecto:
   - Fondos: disponibles en MyInvestor y Renta 4
   - ETFs:   disponibles en los 5 brokers
   Override puntual posible vía campo `brokers` ya presente en el item. */
(function enrichBrokers() {
  const enrich = (grupo, tipo, brokersDefault) => {
    Object.values(grupo).forEach(arr => {
      arr.forEach(item => {
        item.tipo = tipo;
        if (!item.brokers || !Array.isArray(item.brokers)) {
          item.brokers = [...brokersDefault];
        }
        // El campo legacy "broker" del Excel: si dice "MyInvestor" garantiza que esté
        if (item.broker && /myinvestor/i.test(item.broker) && !item.brokers.includes('myinvestor')) {
          item.brokers.push('myinvestor');
        }
      });
    });
  };
  enrich(DATA.fondos, 'fondo', BROKERS_FONDOS);
  enrich(DATA.etfs,   'etf',   BROKERS_ETFS);
})();

/* ---------- BÚSQUEDA UNIFICADA: encontrar producto por nombre ---------- */
function findProducto(nombreOIsin) {
  if (!nombreOIsin) return null;
  const target = nombreOIsin.toLowerCase().trim();
  const todos = [...Object.values(DATA.fondos).flat(), ...Object.values(DATA.etfs).flat()];
  // Match por ISIN exacto
  let m = todos.find(p => p.isin && p.isin.toLowerCase() === target);
  if (m) return m;
  // Match por nombre exacto
  m = todos.find(p => p.nombre && p.nombre.toLowerCase() === target);
  if (m) return m;
  // Match por inclusion (suelen coincidir parcialmente con los productos de las hojas de control)
  m = todos.find(p => p.nombre && (p.nombre.toLowerCase().includes(target) || target.includes(p.nombre.toLowerCase().slice(0, 30))));
  return m || null;
}

/* ---------- PRODUCTOS POR CATEGORÍA DE LA CARTERA ---------- */
/* Cada hoja de control tiene "categorías" (Global, Emergente, MSCI Staple, Largo Plazo, etc.).
   Estas funciones devuelven los productos disponibles para una categoría y broker dados.

   Los matchings son orientativos y se basan en el campo `mercado` del catálogo. */

const CATEGORIA_FILTROS = {
  // Renta Variable - Geográfica
  'Global':              p => /Global Desarrollado|Global con Emergentes/.test(p.mercado || ''),
  'Emergente':           p => p.mercado === 'Emergentes',
  // Renta Variable - Sectorial
  'MSCI Staple':         p => p.mercado === 'Consumo básico',
  'MSCI Utilities':      p => p.mercado === 'Utilities',
  'MSCI Health Care':    p => p.mercado === 'Salud',
  'MSCI Technology':     p => p.mercado === 'Tecnología',
  'MSCI Energy':         p => p.mercado === 'Energía',
  'Global Real Estate':  p => p.mercado === 'Real Estate',
  // Renta Fija - plazo (gubernamental)
  'Largo Plazo':         p => p.plazo === 'Largo Plazo' && p.categoria !== 'Corporativa' && p.categoria !== 'High Yield',
  'Medio Plazo':         p => (p.plazo === 'Medio Plazo' || p.plazo === 'Mixto' || p.plazo === 'TIPS' || p.plazo === 'TIPS/Medio Plazo') && p.categoria !== 'Corporativa' && p.categoria !== 'High Yield',
  'Corto Plazo':         p => p.plazo === 'Corto Plazo' && p.categoria !== 'Corporativa' && p.categoria !== 'High Yield',
  'Corporativa':         p => p.categoria === 'Corporativa',
  'High Yield':          p => p.categoria === 'High Yield',
  // Oro
  'Oro':                 p => /Gold|Oro f[ií]sic/i.test(p.nombre || '')
};

const CATS_RV = ['Global', 'Emergente', 'MSCI Staple', 'MSCI Utilities', 'MSCI Health Care', 'MSCI Technology', 'MSCI Energy', 'Global Real Estate'];
const CATS_RF = ['Largo Plazo', 'Medio Plazo', 'Corto Plazo', 'Corporativa', 'High Yield'];

function productosPorCategoria(categoria, brokerId) {
  const filtro = CATEGORIA_FILTROS[categoria];
  if (!filtro) return [];
  const todos = [...Object.values(DATA.fondos).flat(), ...Object.values(DATA.etfs).flat()];
  return todos.filter(p => {
    if (!p.brokers.includes(brokerId)) return false;
    if (CATS_RV.includes(categoria) && p.categoria !== 'Renta Variable') return false;
    if (CATS_RF.includes(categoria) && p.categoria === 'Renta Variable') return false;
    return filtro(p);
  });
}

