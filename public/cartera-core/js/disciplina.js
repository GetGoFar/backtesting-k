/* Mi Disciplina - calendario mes a mes
   - X verde en cada día = "ese día NO he mirado mi cartera" (logro de disciplina)
   - Cabecera del mes con check para "aportación cumplida este mes"
   - KPIs: días sin mirar este mes / año, racha actual, aportaciones cumplidas */

const Disciplina = {

  state: {
    diasNoMire: {},        // { 'YYYY-MM-DD': true }
    mesesAportados: {},    // { 'YYYY-MM': true }
    vista: null,           // 'YYYY-MM' actualmente en pantalla
  },

  init() {
    this.load();
    if (!this.state.vista) {
      const d = new Date();
      this.state.vista = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    this.render();
  },

  hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  parseVista() {
    const [y, m] = this.state.vista.split('-').map(n => parseInt(n));
    return { y, m };
  },

  cambiarMes(delta) {
    const { y, m } = this.parseVista();
    const d = new Date(y, m - 1 + delta, 1);
    this.state.vista = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this.save(); this.render();
  },

  toggleDia(iso) {
    if (this.state.diasNoMire[iso]) delete this.state.diasNoMire[iso];
    else this.state.diasNoMire[iso] = true;
    this.save(); this.render();
  },

  toggleMesAportacion(ymKey) {
    if (this.state.mesesAportados[ymKey]) delete this.state.mesesAportados[ymKey];
    else this.state.mesesAportados[ymKey] = true;
    this.save(); this.render();
  },

  /* ============== STATS ============== */

  diasDelMes(y, m) {  // m = 1..12
    return new Date(y, m, 0).getDate();
  },

  statsMes(y, m) {
    const total = this.diasDelMes(y, m);
    let marcados = 0;
    for (let d = 1; d <= total; d++) {
      const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (this.state.diasNoMire[iso]) marcados++;
    }
    return { total, marcados };
  },

  statsAno(y) {
    let totalDias = 0, marcadosDias = 0;
    let aportaciones = 0;
    for (let m = 1; m <= 12; m++) {
      const s = this.statsMes(y, m);
      totalDias    += s.total;
      marcadosDias += s.marcados;
      const ym = `${y}-${String(m).padStart(2,'0')}`;
      if (this.state.mesesAportados[ym]) aportaciones++;
    }
    return { totalDias, marcadosDias, aportaciones };
  },

  rachaActual() {
    // Cuenta retrocediendo desde hoy hasta encontrar un día sin marcar (o hoy si no marcado)
    const d = new Date();
    let racha = 0;
    for (let i = 0; i < 366; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (this.state.diasNoMire[iso]) { racha++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return racha;
  },

  /* ============== RENDER ============== */

  render() {
    const cont = document.getElementById('seccion-disciplina');
    if (!cont) return;

    const { y, m } = this.parseVista();
    const sMes = this.statsMes(y, m);
    const sAno = this.statsAno(y);
    const racha = this.rachaActual();
    const ymKey = `${y}-${String(m).padStart(2,'0')}`;
    const aportEsteMes = !!this.state.mesesAportados[ymKey];

    cont.innerHTML = `
      <div class="hero">
        <h1>Mi Disciplina</h1>
        <p>Tu plan de inversión funciona si tú no lo saboteas. Marca los días que <strong>no</strong> has mirado tu cartera y los meses en los que cumples con tu aportación. Registrar la conducta es ya parte del éxito.</p>
      </div>

      <div class="kpi-grid" style="margin-bottom:1rem;">
        <div class="kpi" style="background:var(--verde-bg);">
          <div class="label">Racha actual sin mirar</div>
          <div class="value" style="color:var(--verde);">${racha} ${racha === 1 ? 'día' : 'días'}</div>
        </div>
        <div class="kpi">
          <div class="label">Este mes</div>
          <div class="value">${sMes.marcados} / ${sMes.total} días</div>
        </div>
        <div class="kpi">
          <div class="label">Año ${y}</div>
          <div class="value">${sAno.marcadosDias} / ${sAno.totalDias} (${((sAno.marcadosDias/sAno.totalDias)*100).toFixed(0)}%)</div>
        </div>
        <div class="kpi rv">
          <div class="label">Aportaciones ${y}</div>
          <div class="value">${sAno.aportaciones} / 12</div>
        </div>
      </div>

      <div class="card">
        <div class="cal-toolbar">
          <button class="ghost" id="cal-prev">‹ Mes anterior</button>
          <h2 class="cal-titulo">${this.nombreMes(m)} ${y}</h2>
          <button class="ghost" id="cal-next">Mes siguiente ›</button>
        </div>

        <div class="cal-aport-row">
          <label class="cal-aport-toggle ${aportEsteMes ? 'cumplido' : ''}">
            <input type="checkbox" id="cal-aport" ${aportEsteMes ? 'checked' : ''}>
            <span>${aportEsteMes ? '✓ Aportación cumplida' : 'Marcar aportación cumplida este mes'}</span>
          </label>
          <button class="secondary" id="cal-marcar-hoy">Marcar hoy ✗</button>
        </div>

        ${this.renderRejilla(y, m)}

        <div class="cal-leyenda">
          <span><span class="cal-leg-dia disc-marcado">✗</span> No miré mi cartera</span>
          <span><span class="cal-leg-dia disc-hoy"></span> Hoy</span>
          <span><span class="cal-leg-dia disc-vacio"></span> Sin marcar</span>
        </div>
      </div>

      <div class="card">
        <h2>Cinta del año</h2>
        <p style="color:var(--texto-suave);font-size:.85rem;">Vista rápida del año entero. Cada cuadradito es un día. Click para alternar. Los meses con aportación tienen un sello ✓.</p>
        ${this.renderTiraAno(y)}
        <div class="anos-row">
          <button class="ghost" data-ano="${y-1}">‹ ${y-1}</button>
          <button class="ghost" data-ano="${y+1}">${y+1} ›</button>
        </div>
      </div>
    `;

    this.bind();
  },

  renderRejilla(y, m) {
    const totalDias = this.diasDelMes(y, m);
    // L M X J V S D — la semana en España empieza en lunes
    const primerDia = new Date(y, m - 1, 1);
    let primerDow = primerDia.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
    const offset = (primerDow + 6) % 7; // Mover lunes a posición 0

    const hoyIso = this.hoyISO();
    let html = `<div class="cal-rejilla">
      <div class="cal-dow">L</div><div class="cal-dow">M</div><div class="cal-dow">X</div>
      <div class="cal-dow">J</div><div class="cal-dow">V</div><div class="cal-dow">S</div><div class="cal-dow">D</div>`;

    for (let i = 0; i < offset; i++) html += `<div class="cal-dia disc-fuera"></div>`;

    for (let d = 1; d <= totalDias; d++) {
      const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const marcado = !!this.state.diasNoMire[iso];
      const esHoy = iso === hoyIso;
      const cls = ['cal-dia'];
      if (marcado) cls.push('disc-marcado');
      if (esHoy)   cls.push('disc-hoy');
      if (!marcado && !esHoy) cls.push('disc-vacio');
      html += `<button class="${cls.join(' ')}" data-iso="${iso}">
        <span class="cal-dia-num">${d}</span>
        ${marcado ? '<span class="cal-dia-marca">✗</span>' : ''}
      </button>`;
    }

    html += '</div>';
    return html;
  },

  renderTiraAno(y) {
    // 12 filas de meses, cada una con sus días
    let html = '<div class="cal-tira">';
    for (let m = 1; m <= 12; m++) {
      const total = this.diasDelMes(y, m);
      const ym = `${y}-${String(m).padStart(2,'0')}`;
      const aport = this.state.mesesAportados[ym];
      html += `<div class="tira-mes">
        <div class="tira-label">
          <span class="tira-mes-nombre">${this.nombreMes(m).slice(0,3)}</span>
          <button class="tira-aport ${aport ? 'cumplido' : ''}" data-ym="${ym}" title="Aportación cumplida en ${this.nombreMes(m)}">
            ${aport ? '✓' : '○'}
          </button>
        </div>
        <div class="tira-dias">`;
      for (let d = 1; d <= total; d++) {
        const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const marc = !!this.state.diasNoMire[iso];
        html += `<button class="tira-celda ${marc ? 'tira-marc' : ''}" data-iso="${iso}" title="${iso}"></button>`;
      }
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  },

  nombreMes(m) {
    return ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1];
  },

  bind() {
    const root = document.getElementById('seccion-disciplina');
    if (!root) return;

    document.getElementById('cal-prev').addEventListener('click', () => this.cambiarMes(-1));
    document.getElementById('cal-next').addEventListener('click', () => this.cambiarMes(+1));
    document.getElementById('cal-aport').addEventListener('change', () => {
      const { y, m } = this.parseVista();
      this.toggleMesAportacion(`${y}-${String(m).padStart(2,'0')}`);
    });
    document.getElementById('cal-marcar-hoy').addEventListener('click', () => {
      this.toggleDia(this.hoyISO());
    });

    root.querySelectorAll('.cal-dia[data-iso]').forEach(b => {
      b.addEventListener('click', () => this.toggleDia(b.dataset.iso));
    });
    root.querySelectorAll('.tira-celda[data-iso]').forEach(b => {
      b.addEventListener('click', () => this.toggleDia(b.dataset.iso));
    });
    root.querySelectorAll('.tira-aport[data-ym]').forEach(b => {
      b.addEventListener('click', () => this.toggleMesAportacion(b.dataset.ym));
    });
    root.querySelectorAll('[data-ano]').forEach(b => {
      b.addEventListener('click', () => {
        const ano = +b.dataset.ano;
        const { m } = this.parseVista();
        this.state.vista = `${ano}-${String(m).padStart(2,'0')}`;
        this.save(); this.render();
      });
    });
  },

  save() { localStorage.setItem('ck-disciplina', JSON.stringify(this.state)); },
  load() {
    try { Object.assign(this.state, JSON.parse(localStorage.getItem('ck-disciplina') || '{}')); } catch (_) {}
  }
};
