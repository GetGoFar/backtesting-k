/* Catálogos REF - Fondos y ETFs */

const Catalogos = {

  init() {
    this.render('fondos', DATA.fondos);
    this.render('etfs',   DATA.etfs);
  },

  render(tipo, data) {
    const cont = document.getElementById('seccion-cat-' + tipo);
    if (!cont) return;

    const titulo = tipo === 'fondos' ? 'Catálogo de Fondos Indexados' : 'Catálogo de ETFs';
    const subt   = tipo === 'fondos'
      ? 'Fondos de inversión indexados para construir tu cartera. Cobertura UCITS y clases en EUR cuando es relevante.'
      : 'ETFs UCITS para construir tu cartera, agrupados por categoría.';

    cont.innerHTML = `
      <div class="hero">
        <h1>${titulo}</h1>
        <p>${subt}</p>
      </div>

      <div class="card">
        <div class="cat-buscador">
          <input type="text" id="buscador-${tipo}" placeholder="Filtrar por nombre, ISIN, gestora, mercado…">
          <span style="color:var(--texto-suave);font-size:.85rem;">${this.contar(data)} productos</span>
        </div>
        <div id="cat-render-${tipo}"></div>
      </div>
    `;

    this.pintar(tipo, data, '');
    document.getElementById('buscador-' + tipo).addEventListener('input', e => {
      this.pintar(tipo, data, e.target.value);
    });
  },

  contar(data) {
    return Object.values(data).reduce((a, arr) => a + arr.length, 0);
  },

  pintar(tipo, data, filtro) {
    const cont = document.getElementById('cat-render-' + tipo);
    const f = (filtro || '').toLowerCase().trim();
    let html = '';

    Object.entries(data).forEach(([grupo, items]) => {
      const filt = items.filter(it => {
        if (!f) return true;
        return Object.values(it).some(v => String(v).toLowerCase().includes(f));
      });
      if (filt.length === 0) return;

      const tieneTicker = filt.some(it => it.ticker);
      const tieneDuracion = filt.some(it => it.duracion);

      html += `<div class="cat-grupo"><h3>${grupo}</h3>
        <table class="catalogo">
          <thead><tr>
            ${tieneTicker ? '<th>Ticker</th>' : ''}
            <th>Nombre</th>
            <th>ISIN</th>
            <th class="num">TER</th>
            <th>Gestora</th>
            <th>Mercado</th>
            ${tieneDuracion ? '<th class="num">Duración</th>' : ''}
            <th>Broker</th>
          </tr></thead>
          <tbody>
            ${filt.map(it => `
              <tr>
                ${tieneTicker ? `<td><strong>${it.ticker || ''}</strong></td>` : ''}
                <td>${it.nombre}${it.notas ? ` <span class="badge">${it.notas}</span>` : ''}</td>
                <td><code style="font-size:.82rem;">${it.isin}</code></td>
                <td class="num">${(it.ter * 100).toFixed(2).replace('.', ',')}%</td>
                <td>${it.gestora || ''}</td>
                <td>${it.mercado || ''}</td>
                ${tieneDuracion ? `<td class="num">${it.duracion || '–'}</td>` : ''}
                <td>${it.broker || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`;
    });

    cont.innerHTML = html || '<p style="color:var(--texto-suave);">No se encontraron productos con ese filtro.</p>';
  }
};
