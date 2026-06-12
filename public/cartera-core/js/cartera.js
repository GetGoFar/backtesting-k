/* Mi Cartera - hoja unificada
   Modo "defecto": usa una de las 4 estrategias del Excel + pesos según perfil.
   Modo "libre":   el usuario edita pesos por categoría libremente.
   Líneas dinámicas: añadir/quitar productos por categoría. */

const Cartera = {

  state: {
    modo: 'defecto',                    // 'defecto' | 'libre'
    estrategia: 'geoEtfs',              // 'geoFondos' | 'geoEtfs' | 'sectorEtfs' | 'sectorEtfsV2'
    riesgo: 5,
    capital: 10000,
    aportacion: 0,
    banda: 0.25,
    pesosLibre: {},
    // Líneas: { id, categoria, isin, valor, pesoEnCat, custom?: {nombre, isin, ter, gestora?} }
    lineas: []
  },

  init() {
    this.load();
    if (!this.state.lineas || this.state.lineas.length === 0) {
      this.regenerarLineasDefecto();
    }
    this.render();
  },

  // Estrategias disponibles + sus categorías
  get categoriasDe() {
    return {
      geoFondos: {
        rv:   ['Global', 'Emergente'],
        rf:   ['Largo Plazo', 'Medio Plazo', 'Corto Plazo', 'Corporativa', 'High Yield'],
        oro:  ['Oro']
      },
      geoEtfs: {
        rv:   ['Global', 'Emergente'],
        rf:   ['Largo Plazo', 'Medio Plazo', 'Corto Plazo', 'Corporativa', 'High Yield'],
        oro:  ['Oro']
      },
      sectorEtfs: {
        rv:   ['MSCI Staple', 'MSCI Health Care', 'MSCI Technology', 'MSCI Energy', 'Global Real Estate'],
        rf:   ['Largo Plazo', 'Medio Plazo', 'Corto Plazo', 'Corporativa', 'High Yield'],
        oro:  ['Oro']
      },
      sectorEtfsV2: {
        rv:   ['MSCI Staple', 'MSCI Utilities', 'MSCI Health Care', 'MSCI Technology', 'MSCI Energy', 'Global Real Estate'],
        rf:   ['Largo Plazo', 'Medio Plazo', 'Corto Plazo', 'Corporativa', 'High Yield'],
        oro:  ['Oro']
      }
    };
  },

  estrategiaInfo() {
    return {
      geoFondos:    { titulo: 'Geográfica con Fondos',     subt: 'Distribución por regiones (Global + Emergente).' },
      geoEtfs:      { titulo: 'Geográfica con ETFs',       subt: 'Distribución por regiones, ETFs.' },
      sectorEtfs:   { titulo: 'Sectorial 5 sectores',      subt: 'Reparte la RV en 5 sectores defensivos y de crecimiento.' },
      sectorEtfsV2: { titulo: 'Sectorial 6 sectores',      subt: 'Como la 5 + Utilities.' }
    }[this.state.estrategia];
  },

  // Genera las líneas iniciales según la estrategia + broker activo (1 línea por categoría)
  regenerarLineasDefecto() {
    const cats = this.categoriasDe[this.state.estrategia];
    const broker = (typeof Broker !== 'undefined') ? Broker.brokerActual() : null;
    const lineas = [];
    let id = 0;

    const addCat = (categoria) => {
      // Sugerencia: el producto del Excel; si no, el primero compatible con broker
      let isin = '';
      if (broker) {
        const cands = productosPorCategoria(categoria, broker.id)
          .filter(p => broker.tiposPermitidos.includes(p.tipo));
        if (cands.length) {
          // El más barato (menor TER)
          isin = cands.reduce((m, p) => !m || p.ter < m.ter ? p : m, null).isin;
        }
      }
      lineas.push({ id: ++id, categoria, isin, valor: 0, pesoEnCat: 1 });
    };

    cats.rv.forEach(addCat);
    cats.rf.forEach(addCat);
    cats.oro.forEach(addCat);

    this.state.lineas = lineas;
  },

  // Pesos por categoría según modo + perfil
  pesosPorCategoria() {
    const r = this.state.riesgo - 1;
    const pesosClase = {
      rv:  DATA.pesosClase.rentaVariable[r],
      rf:  DATA.pesosClase.rentaFija[r],
      oro: DATA.pesosClase.oro[r]
    };
    const result = {};

    if (this.state.modo === 'libre') {
      // En modo libre, todos los pesos vienen del estado
      Object.keys(this.state.pesosLibre).forEach(k => result[k] = this.state.pesosLibre[k]);
      // Para categorías sin asignar pero con líneas: peso 0
      const cats = this.categoriasDe[this.state.estrategia];
      [...cats.rv, ...cats.rf, ...cats.oro].forEach(c => {
        if (result[c] === undefined) result[c] = 0;
      });
      return { pesosClase, porCategoria: result };
    }

    // Modo defecto
    const cats = this.categoriasDe[this.state.estrategia];

    // RV
    if (this.state.estrategia === 'geoFondos') {
      result['Global']    = DATA.pesosGeo.global    * pesosClase.rv;
      result['Emergente'] = DATA.pesosGeo.emergente * pesosClase.rv;
    } else if (this.state.estrategia === 'geoEtfs') {
      // ACWI ya incluye emergentes — todo el peso a Global, Emergente queda 0
      result['Global']    = pesosClase.rv;
      result['Emergente'] = 0;
    } else {
      const sectores = this.state.estrategia === 'sectorEtfsV2' ? DATA.pesosSectorV2 : DATA.pesosSectorV1;
      Object.entries(sectores).forEach(([k, w]) => result[k] = w * pesosClase.rv);
    }

    // RF
    result['Largo Plazo']  = 0;
    result['Medio Plazo']  = DATA.pesosRentaFija.gubernamental[r];   // por defecto, todo gubernamental en medio plazo
    result['Corto Plazo']  = 0;
    result['Corporativa']  = DATA.pesosRentaFija.corporativa[r];
    result['High Yield']   = DATA.pesosRentaFija.highYield[r];

    // Oro
    result['Oro'] = pesosClase.oro;

    return { pesosClase, porCategoria: result };
  },

  /* ============== RENDER ============== */

  render() {
    const cont = document.getElementById('seccion-cartera');
    if (!cont) return;

    const broker = (typeof Broker !== 'undefined') ? Broker.brokerActual() : null;
    const calc = this.calcular();

    cont.innerHTML = `
      <div class="hero">
        <h1>Mi Cartera</h1>
        <p>Tu cartera única, con tus productos, tu broker y tus reglas. Edita los valores en amarillo y la herramienta te dirá qué comprar o vender para mantener tu plan.</p>
      </div>

      ${this.renderAvisoBroker(broker)}

      <div class="card">
        <div class="input-row">
          <div class="field">
            <label>Perfil de riesgo (1-10)</label>
            <input type="number" min="1" max="10" step="1" id="cart-riesgo" class="editable" value="${this.state.riesgo}">
          </div>
          <div class="field">
            <label>Capital actual (€)</label>
            <input type="number" step="100" id="cart-capital" class="editable" value="${this.state.capital}">
          </div>
          <div class="field">
            <label>Aportación / retirada (€)</label>
            <input type="number" step="100" id="cart-aportacion" class="editable" value="${this.state.aportacion}">
          </div>
          <div class="field">
            <label>Banda relativa de alarma</label>
            <input type="number" step="0.05" min="0" max="1" id="cart-banda" class="editable" value="${this.state.banda}">
          </div>
          <div class="field" style="align-self:end;">
            <button class="ghost" id="cart-reset">Reiniciar cartera</button>
          </div>
        </div>

        <div class="modo-row">
          <div class="modo-opciones">
            <label class="radio-pill ${this.state.modo === 'defecto' ? 'active' : ''}">
              <input type="radio" name="modo" value="defecto" ${this.state.modo === 'defecto' ? 'checked' : ''}>
              Por defecto <span style="opacity:.7;">— pesos automáticos según perfil</span>
            </label>
            <label class="radio-pill ${this.state.modo === 'libre' ? 'active' : ''}">
              <input type="radio" name="modo" value="libre" ${this.state.modo === 'libre' ? 'checked' : ''}>
              Por libre <span style="opacity:.7;">— tú asignas los pesos</span>
            </label>
          </div>
          ${this.state.modo === 'defecto' ? `
            <div class="estrategia-row">
              <label style="font-size:.82rem;color:var(--texto-suave);font-weight:500;">Estrategia:</label>
              <select id="cart-estrategia">
                <option value="geoFondos"    ${this.state.estrategia === 'geoFondos' ? 'selected' : ''}>Geográfica · Fondos</option>
                <option value="geoEtfs"      ${this.state.estrategia === 'geoEtfs' ? 'selected' : ''}>Geográfica · ETFs</option>
                <option value="sectorEtfs"   ${this.state.estrategia === 'sectorEtfs' ? 'selected' : ''}>Sectorial · 5 sectores</option>
                <option value="sectorEtfsV2" ${this.state.estrategia === 'sectorEtfsV2' ? 'selected' : ''}>Sectorial · 6 sectores</option>
              </select>
            </div>
          ` : `
            <div style="font-size:.82rem;color:var(--texto-suave);">
              Modo libre: edita los pesos objetivo de cada categoría directamente.
            </div>
          `}
        </div>

        <div class="kpi-grid" style="margin-top:1rem;">
          <div class="kpi"><div class="label">Capital final</div><div class="value">${fmtEUR(calc.capitalFinal)}</div></div>
          <div class="kpi rv"><div class="label">Renta Variable</div><div class="value">${fmtPct(calc.totalesClase.rv.objetivoPct)}</div></div>
          <div class="kpi"><div class="label">Renta Fija</div><div class="value">${fmtPct(calc.totalesClase.rf.objetivoPct)}</div></div>
          <div class="kpi"><div class="label">Oro</div><div class="value">${fmtPct(calc.totalesClase.oro.objetivoPct)}</div></div>
        </div>
        <div style="font-size:.82rem;color:var(--texto-suave);margin-top:.4rem;">
          Volatilidad objetivo (1σ): <strong>${fmtPct(DATA.volatilidad[this.state.riesgo-1])}</strong> ·
          Rentabilidad esperada anual: <strong>${fmtPct(DATA.rentabilidad[this.state.riesgo-1])}</strong>
        </div>

        ${this.renderTERCard(calc)}
      </div>

      ${this.renderBloque('Renta Variable', calc, 'rv')}
      ${this.renderBloque('Renta Fija',     calc, 'rf')}
      ${this.renderBloque('Oro',            calc, 'oro')}

      <div class="card">
        <h2>Resumen total</h2>
        <table class="cartera">
          <thead><tr><th>Clase</th><th class="num">Valor actual</th><th class="num">Peso actual</th><th class="num">Peso objetivo</th><th class="num">Valor objetivo</th><th class="num">Comprar / Vender</th></tr></thead>
          <tbody>
            ${['rv','rf','oro'].map(k => {
              const t = calc.totalesClase[k];
              const nombre = {rv:'Renta Variable', rf:'Renta Fija', oro:'Oro'}[k];
              return `<tr><td>${nombre}</td>
                <td class="num">${fmtEUR(t.actual)}</td>
                <td class="num">${fmtPct(t.actual / calc.capitalFinal)}</td>
                <td class="num">${fmtPct(t.objetivoPct)}</td>
                <td class="num">${fmtEUR(t.objetivo)}</td>
                <td class="num ${claseCompra(t.compra)}">${fmtEUR(t.compra)}</td></tr>`;
            }).join('')}
            <tr class="total">
              <td>TOTAL</td>
              <td class="num">${fmtEUR(calc.totalActual)}</td>
              <td class="num">100%</td>
              <td class="num">${fmtPct(calc.totalObjetivoPct)}</td>
              <td class="num">${fmtEUR(calc.capitalFinal * calc.totalObjetivoPct)}</td>
              <td class="num">${fmtEUR(calc.capitalFinal * calc.totalObjetivoPct - calc.totalActual)}</td>
            </tr>
          </tbody>
        </table>
        ${Math.abs(calc.totalObjetivoPct - 1) > 0.001 ? `
          <p style="color:var(--rojo);margin-top:.6rem;font-size:.85rem;">
            ⚠ Los pesos objetivo no suman 100% (suman ${fmtPct(calc.totalObjetivoPct)}). Revisa los pesos editables.
          </p>` : ''}
      </div>
    `;

    this.bindInputs();
  },

  renderTERCard(calc) {
    const ter = calc.terPonderado;
    const costeAnual = ter * calc.totalActual;
    if (calc.totalActual <= 0) {
      return `<div class="ter-total-card">
        <span class="ter-label">TER total ponderado:</span>
        <span class="ter-valor">—</span>
        <span class="ter-detalle">Introduce los valores actuales de tus posiciones para calcular el coste real.</span>
      </div>`;
    }
    return `<div class="ter-total-card">
      <span class="ter-label">TER total ponderado:</span>
      <span class="ter-valor">${(ter * 100).toFixed(2).replace('.', ',')}%</span>
      <span class="ter-detalle">
        coste anual estimado: <span class="ter-coste-anual">${fmtEUR(costeAnual)}</span>
        sobre ${fmtEUR(calc.totalActual)} invertidos
      </span>
    </div>`;
  },

  renderAvisoBroker(broker) {
    if (!broker) return `
      <div class="aviso-broker">
        Aún no has elegido tu broker. <a href="#broker" data-go="broker">Selecciona tu broker</a> para que la herramienta solo te muestre productos que puedes contratar realmente.
      </div>`;
    return `
      <div class="aviso-broker">
        Broker activo: <strong>${broker.nombre}</strong> · ${broker.tiposPermitidos.includes('fondo') && broker.tiposPermitidos.includes('etf') ? 'fondos + ETFs' : (broker.tiposPermitidos.includes('etf') ? 'solo ETFs' : 'solo fondos')} · <a href="#broker" data-go="broker">cambiar broker</a>
      </div>`;
  },

  renderBloque(titulo, calc, claseKey) {
    const cats = claseKey === 'rv' ? this.categoriasDe[this.state.estrategia].rv
              : claseKey === 'rf' ? this.categoriasDe[this.state.estrategia].rf
              : this.categoriasDe[this.state.estrategia].oro;

    const totalClase = calc.totalesClase[claseKey];
    const fueraSuma = cats.some(c => Math.abs(calc.porCategoria[c]?.fueraSumaCat) > 0.001);

    return `
      <div class="card">
        <h2 style="display:flex;justify-content:space-between;align-items:baseline;">
          <span>${titulo}</span>
          <span style="font-size:.85rem;color:var(--texto-suave);font-weight:500;">
            objetivo total: ${fmtPct(totalClase.objetivoPct)} · actual: ${fmtPct(totalClase.actual / calc.capitalFinal)}
          </span>
        </h2>
        ${cats.map(cat => this.renderCategoria(cat, calc)).join('')}
      </div>
    `;
  },

  renderCategoria(categoria, calc) {
    const info = calc.porCategoria[categoria];
    const lineas = this.state.lineas.filter(l => l.categoria === categoria);
    const broker = (typeof Broker !== 'undefined') ? Broker.brokerActual() : null;

    const candidatos = broker
      ? productosPorCategoria(categoria, broker.id).filter(p => broker.tiposPermitidos.includes(p.tipo))
      : [];

    const sumaPesoEnCat = lineas.reduce((a, l) => a + (l.pesoEnCat || 0), 0);
    const fueraSuma = lineas.length > 0 && Math.abs(sumaPesoEnCat - 1) > 0.001;
    const fueraCatBanda = info.banda > 0 && info.objetivoPct > 0 &&
      (info.actual / info.capitalFinal < info.objetivoPct * (1 - info.banda) ||
       info.actual / info.capitalFinal > info.objetivoPct * (1 + info.banda));

    return `
      <div class="categoria-bloque">
        <div class="categoria-cabecera">
          <div>
            <strong>${categoria}</strong>
            <span class="cat-meta">
              objetivo:
              ${this.state.modo === 'libre'
                ? `<input type="number" step="0.005" min="0" max="1" class="cat-peso-edit" data-cat="${categoria}" value="${(info.objetivoPct || 0).toFixed(4)}" style="width:80px;" />`
                : `<strong>${fmtPct(info.objetivoPct)}</strong>`}
              · actual: <strong class="${fueraCatBanda ? 'fuera-banda-text' : ''}">${fmtPct(info.actual / info.capitalFinal)}</strong>
            </span>
          </div>
          <button class="btn-add-linea" data-cat="${categoria}">+ Añadir línea</button>
        </div>

        ${lineas.length === 0 ? `
          <p class="categoria-vacia">Sin productos en esta categoría todavía.</p>
        ` : `
          <table class="cartera lineas-tabla">
            <thead><tr>
              <th>Producto</th>
              <th class="num" style="width:80px;">% en cat.</th>
              <th class="num" style="width:120px;">Valor actual</th>
              <th class="num" style="width:80px;">Peso actual</th>
              <th class="num" style="width:120px;">Valor objetivo</th>
              <th class="num" style="width:120px;">Comprar / Vender</th>
              <th style="width:30px;"></th>
            </tr></thead>
            <tbody>
              ${lineas.map(l => this.renderLinea(l, info, candidatos)).join('')}
            </tbody>
          </table>
          ${fueraSuma ? `
            <p style="color:var(--rojo);font-size:.82rem;margin:.4rem .4rem 0;">
              ⚠ Los % en categoría suman ${(sumaPesoEnCat * 100).toFixed(1)}% (debería ser 100%).
            </p>` : ''}
        `}
      </div>
    `;
  },

  renderLinea(linea, infoCat, candidatos) {
    const broker = (typeof Broker !== 'undefined') ? Broker.brokerActual() : null;
    const producto = this.productoDeLinea(linea);

    const pesoLinea = (infoCat.objetivoPct || 0) * (linea.pesoEnCat || 0);
    const valorObjetivo = pesoLinea * infoCat.capitalFinal;
    const compra = valorObjetivo - (linea.valor || 0);
    const pesoActual = infoCat.capitalFinal > 0 ? (linea.valor || 0) / infoCat.capitalFinal : 0;
    const fueraBanda = infoCat.banda > 0 && pesoLinea > 0 &&
      (pesoActual < pesoLinea * (1 - infoCat.banda) || pesoActual > pesoLinea * (1 + infoCat.banda));

    let select = '';
    const esCustom = !!linea.custom;
    const valorActual = esCustom ? `__custom__${linea.id}` : (linea.isin || '');

    const opts = (candidatos || []).sort((a,b) => (a.ter||0)-(b.ter||0)).map(p => {
      const label = `${p.ticker ? '['+p.ticker+'] ' : ''}${p.nombre} — TER ${(p.ter*100).toFixed(2).replace('.', ',')}%`;
      return `<option value="${p.isin}" ${(!esCustom && p.isin === linea.isin) ? 'selected' : ''}>${label}</option>`;
    }).join('');
    const customOpt = esCustom
      ? `<option value="${valorActual}" selected>${linea.custom.nombre} (mi producto)</option>`
      : '';

    select = `<select class="producto-select linea-producto" data-id="${linea.id}">
      <option value="">— Elegir producto —</option>
      ${customOpt}
      ${opts}
      <option value="__nuevo__">+ Añadir otro producto (no está en la lista)…</option>
    </select>`;

    let info = '';
    if (producto) {
      info = `<div class="producto-info">
        <code>${producto.isin || '–'}</code>
        ${producto.gestora ? ' · ' + producto.gestora : ''}
        · <span class="ter-badge">TER ${(producto.ter*100).toFixed(2).replace('.', ',')}%</span>
        ${producto.duracion ? ' · Dur. ' + producto.duracion : ''}
        ${esCustom ? ` · <a href="#" class="edit-custom" data-id="${linea.id}">editar</a>` : ''}
      </div>`;
    }

    return `
      <tr>
        <td>${select}${info}</td>
        <td class="num"><input type="number" step="0.05" min="0" max="1" class="editable linea-peso" data-id="${linea.id}" value="${(linea.pesoEnCat || 0).toFixed(2)}" style="max-width:75px;"></td>
        <td class="num"><input type="number" step="100" class="editable linea-valor" data-id="${linea.id}" value="${linea.valor || 0}"></td>
        <td class="num ${fueraBanda ? 'fuera-banda' : ''}">${fmtPct(pesoActual)}</td>
        <td class="num">${fmtEUR(valorObjetivo)}</td>
        <td class="num ${claseCompra(compra)}">${fmtEUR(compra)}</td>
        <td><button class="btn-x-linea" data-id="${linea.id}" title="Eliminar línea">×</button></td>
      </tr>
    `;
  },

  productoDeLinea(linea) {
    if (linea.custom) {
      return { nombre: linea.custom.nombre, isin: linea.custom.isin, ter: linea.custom.ter,
               gestora: linea.custom.gestora || 'Personalizado', tipo: linea.custom.tipo || 'fondo' };
    }
    if (!linea.isin) return null;
    const todos = [...Object.values(DATA.fondos).flat(), ...Object.values(DATA.etfs).flat()];
    return todos.find(p => p.isin === linea.isin) || null;
  },

  bindInputs() {
    const root = document.getElementById('seccion-cartera');
    if (!root) return;

    const num = (id, key, parser = parseFloat) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        let v = parser(el.value);
        if (Number.isNaN(v)) v = 0;
        if (key === 'riesgo') v = Math.max(1, Math.min(10, Math.round(v)));
        if (key === 'banda')  v = Math.max(0, Math.min(2, v));
        this.state[key] = v;
        this.save();
        this.render();
      });
    };
    num('cart-riesgo', 'riesgo'); num('cart-capital', 'capital');
    num('cart-aportacion', 'aportacion'); num('cart-banda', 'banda');

    document.getElementById('cart-reset')?.addEventListener('click', () => {
      if (!confirm('¿Reiniciar la cartera con los productos por defecto de la estrategia? Se perderán los valores y líneas añadidas.')) return;
      this.regenerarLineasDefecto();
      this.state.pesosLibre = {};
      this.save(); this.render();
    });

    root.querySelectorAll('input[name="modo"]').forEach(r => {
      r.addEventListener('change', () => {
        const nuevo = r.value;
        if (nuevo === 'libre' && Object.keys(this.state.pesosLibre).length === 0) {
          // copiar pesos actuales del modo defecto a libre
          const calc = this.pesosPorCategoria();
          this.state.pesosLibre = { ...calc.porCategoria };
        }
        this.state.modo = nuevo;
        this.save(); this.render();
      });
    });

    document.getElementById('cart-estrategia')?.addEventListener('change', e => {
      this.state.estrategia = e.target.value;
      // regenerar líneas con la nueva estrategia
      this.regenerarLineasDefecto();
      this.save(); this.render();
    });

    root.querySelectorAll('.cat-peso-edit').forEach(inp => {
      inp.addEventListener('change', () => {
        const cat = inp.dataset.cat;
        const v = Math.max(0, Math.min(1, parseFloat(inp.value) || 0));
        this.state.pesosLibre[cat] = v;
        this.save(); this.render();
      });
    });

    root.querySelectorAll('.linea-producto').forEach(sel => {
      sel.addEventListener('change', () => {
        const id = +sel.dataset.id;
        const linea = this.state.lineas.find(l => l.id === id);
        if (!linea) return;
        if (sel.value === '__nuevo__') {
          // Abrir modal para introducir producto manual
          this.abrirModalCustom(linea, sel);
          return;
        }
        // Producto normal del catálogo: limpiar custom si existía
        delete linea.custom;
        linea.isin = sel.value;
        this.save(); this.render();
      });
    });
    root.querySelectorAll('.edit-custom').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const id = +a.dataset.id;
        const linea = this.state.lineas.find(l => l.id === id);
        if (linea && linea.custom) this.abrirModalCustom(linea, null);
      });
    });
    root.querySelectorAll('.linea-valor').forEach(inp => {
      inp.addEventListener('change', () => {
        const id = +inp.dataset.id;
        const linea = this.state.lineas.find(l => l.id === id);
        if (linea) { linea.valor = parseFloat(inp.value) || 0; this.save(); this.render(); }
      });
    });
    root.querySelectorAll('.linea-peso').forEach(inp => {
      inp.addEventListener('change', () => {
        const id = +inp.dataset.id;
        const linea = this.state.lineas.find(l => l.id === id);
        if (linea) {
          linea.pesoEnCat = Math.max(0, Math.min(1, parseFloat(inp.value) || 0));
          this.save(); this.render();
        }
      });
    });
    root.querySelectorAll('.btn-add-linea').forEach(btn => {
      btn.addEventListener('click', () => this.addLinea(btn.dataset.cat));
    });
    root.querySelectorAll('.btn-x-linea').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = +btn.dataset.id;
        this.state.lineas = this.state.lineas.filter(l => l.id !== id);
        // reajustar pesoEnCat de las restantes en esa categoría a partes iguales
        const linea = this.state.lineas.filter(l => l.id !== id);
        this.save(); this.render();
      });
    });
    root.querySelectorAll('[data-go]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); App.go(el.dataset.go); });
    });
  },

  abrirModalCustom(linea, selectOriginal) {
    // Cierra modales previas
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());

    const c = linea.custom || {};
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog">
        <h3>${linea.custom ? 'Editar mi producto' : 'Añadir otro producto'}</h3>
        <p style="font-size:.85rem;color:var(--texto-suave);margin:.2rem 0 1rem;">
          Si tu fondo o ETF no aparece en la lista de tu broker, añádelo aquí. Solo lo necesitas para registrarlo en tu cartera.
        </p>
        <div class="field">
          <label>Nombre completo del fondo / ETF *</label>
          <input type="text" id="cust-nombre" class="editable" value="${(c.nombre || '').replace(/"/g, '&quot;')}" placeholder="ej. Vanguard FTSE Developed World UCITS ETF">
        </div>
        <div class="field">
          <label>ISIN</label>
          <input type="text" id="cust-isin" value="${(c.isin || '').replace(/"/g, '&quot;')}" placeholder="ej. IE00BKX55T58">
        </div>
        <div class="field">
          <label>TER (%) *</label>
          <input type="number" id="cust-ter" step="0.01" min="0" max="5" value="${c.ter !== undefined ? (c.ter*100).toFixed(2) : ''}" placeholder="ej. 0.12">
        </div>
        <div class="field">
          <label>Gestora (opcional)</label>
          <input type="text" id="cust-gestora" value="${(c.gestora || '').replace(/"/g, '&quot;')}" placeholder="ej. Vanguard">
        </div>
        <div class="modal-actions">
          <button class="ghost" id="cust-cancelar">Cancelar</button>
          <button id="cust-guardar">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('cust-nombre').focus();

    const cerrar = (revertir = false) => {
      if (revertir && selectOriginal) {
        // Restaurar la opción que estaba seleccionada antes (sin custom)
        selectOriginal.value = linea.isin || '';
      }
      overlay.remove();
    };

    document.getElementById('cust-cancelar').addEventListener('click', () => cerrar(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(true); });

    document.getElementById('cust-guardar').addEventListener('click', () => {
      const nombre  = document.getElementById('cust-nombre').value.trim();
      const isin    = document.getElementById('cust-isin').value.trim();
      const terPct  = parseFloat(document.getElementById('cust-ter').value);
      const gestora = document.getElementById('cust-gestora').value.trim();

      if (!nombre) { alert('El nombre es obligatorio.'); return; }
      if (!Number.isFinite(terPct) || terPct < 0) { alert('El TER es obligatorio y debe ser un número válido (en %).'); return; }

      linea.custom = {
        nombre,
        isin: isin || `CUSTOM-${linea.id}`,
        ter: terPct / 100,
        gestora: gestora || ''
      };
      linea.isin = linea.custom.isin;
      cerrar(false);
      this.save();
      this.render();
    });
  },

  addLinea(categoria) {
    const broker = (typeof Broker !== 'undefined') ? Broker.brokerActual() : null;
    const cands = broker ? productosPorCategoria(categoria, broker.id).filter(p => broker.tiposPermitidos.includes(p.tipo)) : [];
    const masBarato = cands.length ? cands.reduce((m, p) => !m || p.ter < m.ter ? p : m, null) : null;

    // pesoEnCat se reparte entre todas las líneas de la categoría a partes iguales
    const yaExistentes = this.state.lineas.filter(l => l.categoria === categoria);
    const nuevoTotal = yaExistentes.length + 1;
    const nuevoPeso = 1 / nuevoTotal;
    yaExistentes.forEach(l => l.pesoEnCat = nuevoPeso);

    const nextId = (this.state.lineas.reduce((m, l) => Math.max(m, l.id), 0) || 0) + 1;
    this.state.lineas.push({ id: nextId, categoria, isin: masBarato ? masBarato.isin : '', valor: 0, pesoEnCat: nuevoPeso });
    this.save(); this.render();
  },

  /* ============== CÁLCULO ============== */

  calcular() {
    const capitalFinal = this.state.capital + this.state.aportacion;
    const banda = this.state.banda;

    const pesos = this.pesosPorCategoria();
    const cats = this.categoriasDe[this.state.estrategia];
    const allCats = [...cats.rv, ...cats.rf, ...cats.oro];

    const porCategoria = {};
    let totalActual = 0, totalObjetivoPct = 0;
    const totalesClase = {
      rv:  { actual: 0, objetivoPct: 0, objetivo: 0, compra: 0 },
      rf:  { actual: 0, objetivoPct: 0, objetivo: 0, compra: 0 },
      oro: { actual: 0, objetivoPct: 0, objetivo: 0, compra: 0 }
    };

    allCats.forEach(cat => {
      const objetivoPct = pesos.porCategoria[cat] || 0;
      const objetivo = objetivoPct * capitalFinal;
      const lineas = this.state.lineas.filter(l => l.categoria === cat);
      const actual = lineas.reduce((a, l) => a + (l.valor || 0), 0);
      const sumaPesoEnCat = lineas.reduce((a, l) => a + (l.pesoEnCat || 0), 0);
      const fueraSumaCat = lineas.length > 0 ? sumaPesoEnCat - 1 : 0;

      porCategoria[cat] = {
        objetivoPct, objetivo, actual, capitalFinal, banda,
        fueraSumaCat
      };

      totalActual += actual;
      totalObjetivoPct += objetivoPct;

      const claseKey = cats.rv.includes(cat) ? 'rv' : (cats.rf.includes(cat) ? 'rf' : 'oro');
      totalesClase[claseKey].actual      += actual;
      totalesClase[claseKey].objetivoPct += objetivoPct;
    });

    Object.keys(totalesClase).forEach(k => {
      totalesClase[k].objetivo = totalesClase[k].objetivoPct * capitalFinal;
      totalesClase[k].compra   = totalesClase[k].objetivo - totalesClase[k].actual;
    });

    // TER ponderado: por valor actual si hay (real); si no, por valor objetivo (estimación)
    let terAcumActual = 0, valorAcum = 0;
    let terAcumObj = 0, objAcum = 0;
    this.state.lineas.forEach(l => {
      const p = this.productoDeLinea(l);
      if (!p || !Number.isFinite(p.ter)) return;
      const valor = l.valor || 0;
      const cat = porCategoria[l.categoria];
      const objLinea = cat ? (cat.objetivoPct || 0) * (l.pesoEnCat || 0) * capitalFinal : 0;
      terAcumActual += p.ter * valor;
      valorAcum     += valor;
      terAcumObj    += p.ter * objLinea;
      objAcum       += objLinea;
    });
    const terPonderado = valorAcum > 0
      ? terAcumActual / valorAcum
      : (objAcum > 0 ? terAcumObj / objAcum : 0);

    return { capitalFinal, porCategoria, totalActual, totalObjetivoPct, totalesClase, terPonderado };
  },

  save() { localStorage.setItem('ck-cartera', JSON.stringify(this.state)); },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('ck-cartera') || '{}');
      Object.assign(this.state, s);
    } catch (_) {}
  },

  // hook llamado por broker.js cuando cambia broker
  renderTodas() { this.render(); }
};

/* ---- helpers ---- */

function fmtEUR(v) {
  if (!Number.isFinite(v)) v = 0;
  return new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR', maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v) {
  if (!Number.isFinite(v)) v = 0;
  return (v * 100).toFixed(1).replace('.', ',') + '%';
}
function claseCompra(v) {
  if (Math.abs(v) < 1) return '';
  return v > 0 ? 'compra-positiva' : 'compra-negativa';
}
