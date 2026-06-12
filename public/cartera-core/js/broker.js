/* Sección "Mi Broker": elige broker → lista productos disponibles + filtro */

const Broker = {

  state: {
    seleccionado: null,   // id de BROKERS
    elegidos: {}          // { categoria: ISIN } - producto preferido por categoría (compartido entre carteras)
  },

  init() {
    this.load();
    this.render();
  },

  brokerActual() {
    return DATA.BROKERS.find(b => b.id === this.state.seleccionado) || null;
  },

  render() {
    const cont = document.getElementById('seccion-broker');
    if (!cont) return;

    const b = this.brokerActual();

    cont.innerHTML = `
      <div class="hero">
        <h1>Mi Broker</h1>
        <p>Elige tu broker y verás solo los fondos o ETFs que puedes contratar a través de él. La elección se aplicará automáticamente a las hojas de control.</p>
      </div>

      <div class="card">
        <h2>Selecciona tu broker</h2>
        <div class="broker-grid">
          ${DATA.BROKERS.map(br => `
            <button class="broker-card ${this.state.seleccionado === br.id ? 'active' : ''}" data-broker="${br.id}">
              <div class="broker-nombre">${br.nombre}</div>
              <div class="broker-tipos">
                ${br.tiposPermitidos.map(t => `<span class="tag">${t === 'fondo' ? 'Fondos' : 'ETFs'}</span>`).join('')}
              </div>
              <div class="broker-nota">${br.nota}</div>
            </button>
          `).join('')}
        </div>
        <p style="margin-top:.8rem;font-size:.82rem;color:var(--texto-suave);">
          La disponibilidad de productos por broker es <strong>orientativa</strong> — está basada en la oferta general de cada plataforma. <strong>Verifica siempre en la web del broker</strong> que el producto exacto que buscas está disponible antes de contratarlo.
        </p>
      </div>

      ${b ? this.renderListado(b) : ''}
    `;

    cont.querySelectorAll('.broker-card').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.seleccionado = btn.dataset.broker;
        this.save();
        this.render();
        if (typeof Cartera !== 'undefined') Cartera.renderTodas();
      });
    });

    const buscador = document.getElementById('broker-buscador');
    if (buscador) {
      buscador.addEventListener('input', e => this.pintarListado(e.target.value));
      // Pintar listado inicial inmediatamente
      this.pintarListado('');
    }
  },

  renderListado(broker) {
    const todos = [...Object.values(DATA.fondos).flat(), ...Object.values(DATA.etfs).flat()];
    const compatibles = todos.filter(p => p.brokers.includes(broker.id));

    return `
      <div class="card">
        <h2>Productos disponibles en ${broker.nombre}</h2>
        <div class="cat-buscador">
          <input type="text" id="broker-buscador" placeholder="Filtrar por nombre, ISIN, gestora, mercado…">
          <span style="color:var(--texto-suave);font-size:.85rem;" id="broker-count">${compatibles.length} productos</span>
        </div>
        <div id="broker-listado"></div>
      </div>
    `;
  },

  pintarListado(filtro = '') {
    const broker = this.brokerActual();
    if (!broker) return;
    const cont = document.getElementById('broker-listado');
    if (!cont) return;

    const f = (filtro || '').toLowerCase().trim();
    const grupos = { fondo: {}, etf: {} };

    // Recorre fondos y etfs y agrupa por (tipo, grupo)
    Object.entries(DATA.fondos).forEach(([grupo, items]) => {
      const filt = items.filter(p => p.brokers.includes(broker.id) && this.matchFiltro(p, f));
      if (filt.length) grupos.fondo[grupo] = filt;
    });
    Object.entries(DATA.etfs).forEach(([grupo, items]) => {
      const filt = items.filter(p => p.brokers.includes(broker.id) && this.matchFiltro(p, f));
      if (filt.length) grupos.etf[grupo] = filt;
    });

    let html = '';
    if (broker.tiposPermitidos.includes('fondo') && Object.keys(grupos.fondo).length) {
      html += `<h3 style="color:var(--rojo);margin-top:1rem;">Fondos de Inversión</h3>`;
      Object.entries(grupos.fondo).forEach(([grupo, items]) => {
        html += this.tablaProductos(grupo, items, true);
      });
    }
    if (broker.tiposPermitidos.includes('etf') && Object.keys(grupos.etf).length) {
      html += `<h3 style="color:var(--rojo);margin-top:1rem;">ETFs</h3>`;
      Object.entries(grupos.etf).forEach(([grupo, items]) => {
        html += this.tablaProductos(grupo, items, false);
      });
    }

    cont.innerHTML = html || '<p style="color:var(--texto-suave);">Sin resultados con ese filtro.</p>';

    // Recuento
    const total = (Object.values(grupos.fondo).reduce((a, x) => a + x.length, 0)
                 + Object.values(grupos.etf).reduce((a, x) => a + x.length, 0));
    const cnt = document.getElementById('broker-count');
    if (cnt) cnt.textContent = `${total} productos`;
  },

  tablaProductos(grupo, items, esFondo) {
    const tieneTicker   = items.some(p => p.ticker);
    const tieneDuracion = items.some(p => p.duracion);
    return `
      <div class="cat-grupo">
        <h3>${grupo}</h3>
        <table class="catalogo">
          <thead><tr>
            ${tieneTicker ? '<th>Ticker</th>' : ''}
            <th>Nombre</th>
            <th>ISIN</th>
            <th class="num">TER</th>
            <th>Gestora</th>
            <th>Mercado</th>
            ${tieneDuracion ? '<th class="num">Duración</th>' : ''}
          </tr></thead>
          <tbody>
            ${items.map(p => `
              <tr>
                ${tieneTicker ? `<td><strong>${p.ticker || ''}</strong></td>` : ''}
                <td>${p.nombre}${p.notas ? ` <span class="badge">${p.notas}</span>` : ''}</td>
                <td><code style="font-size:.82rem;">${p.isin}</code></td>
                <td class="num">${(p.ter * 100).toFixed(2).replace('.', ',')}%</td>
                <td>${p.gestora || ''}</td>
                <td>${p.mercado || ''}</td>
                ${tieneDuracion ? `<td class="num">${p.duracion || '–'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  matchFiltro(p, f) {
    if (!f) return true;
    return Object.values(p).some(v => String(v).toLowerCase().includes(f));
  },

  save() {
    localStorage.setItem('ck-broker', JSON.stringify(this.state));
  },

  load() {
    try {
      Object.assign(this.state, JSON.parse(localStorage.getItem('ck-broker') || '{}'));
    } catch (_) {}
  }
};

