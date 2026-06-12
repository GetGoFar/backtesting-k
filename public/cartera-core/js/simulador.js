/* Simulador de Aportaciones Periódicas (DCA) */

const Simulador = {

  state: {
    capital: 10000,
    aportacion: 500,
    anos: 20,
    rentabilidad: 0.07,
    inflacion: 0.03
  },

  chart: null,

  init() {
    this.load();
    this.render();
  },

  render() {
    const cont = document.getElementById('seccion-simulador');
    cont.innerHTML = `
      <div class="hero">
        <h1>Simulador DCA</h1>
        <p>Proyecta el crecimiento de tu cartera con aportaciones mensuales (Dollar Cost Averaging) e interés compuesto.</p>
      </div>

      <div class="sim-grid">
        <div class="card">
          <h2>Datos de entrada</h2>
          <div style="display:grid;gap:.7rem;">
            <div class="field">
              <label>Capital inicial (€)</label>
              <input type="number" step="100" id="sim-capital" class="editable" value="${this.state.capital}">
            </div>
            <div class="field">
              <label>Aportación mensual (€)</label>
              <input type="number" step="50" id="sim-aportacion" class="editable" value="${this.state.aportacion}">
            </div>
            <div class="field">
              <label>Años de inversión</label>
              <input type="number" step="1" min="1" max="60" id="sim-anos" class="editable" value="${this.state.anos}">
            </div>
            <div class="field">
              <label>Rentabilidad anual esperada (%)</label>
              <input type="number" step="0.01" id="sim-rent" class="editable" value="${(this.state.rentabilidad * 100).toFixed(2)}">
            </div>
            <div class="field">
              <label>Inflación anual esperada (%)</label>
              <input type="number" step="0.01" id="sim-infla" class="editable" value="${(this.state.inflacion * 100).toFixed(2)}">
            </div>
          </div>

          <div class="sim-resultados" id="sim-resultados"></div>
        </div>

        <div class="card">
          <h2>Proyección</h2>
          <div id="chart-container"><canvas id="chart-sim"></canvas></div>
        </div>
      </div>

      <div class="card">
        <h2>Tabla anual</h2>
        <div style="overflow-x:auto;">
          <table class="cartera proyeccion" id="tabla-proyeccion">
            <thead><tr><th>Año</th><th class="num">Aportado acumulado</th><th class="num">Valor cartera (nominal)</th><th class="num">Beneficio</th><th class="num">Valor real (ajustado inflación)</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    this.bind();
    this.recalcular();
  },

  bind() {
    const handle = (id, key, parser, scale = 1) => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => {
        const v = parser(el.value);
        this.state[key] = Number.isNaN(v) ? 0 : v / scale;
        this.save();
        this.recalcular();
      });
    };
    handle('sim-capital', 'capital', parseFloat);
    handle('sim-aportacion', 'aportacion', parseFloat);
    handle('sim-anos', 'anos', v => Math.max(1, Math.min(60, parseInt(v))));
    handle('sim-rent', 'rentabilidad', parseFloat, 100);
    handle('sim-infla', 'inflacion', parseFloat, 100);
  },

  recalcular() {
    const { capital, aportacion, anos, rentabilidad, inflacion } = this.state;

    // Datos por año
    const labels = [], aportadoArr = [], valorArr = [], realArr = [];
    for (let y = 0; y <= anos; y++) {
      const aportado = capital + aportacion * 12 * y;
      let valor;
      if (rentabilidad === 0) {
        valor = capital + aportacion * 12 * y;
      } else {
        valor = capital * Math.pow(1 + rentabilidad, y)
              + aportacion * 12 * (Math.pow(1 + rentabilidad, y) - 1) / rentabilidad;
      }
      const real = valor / Math.pow(1 + inflacion, y);
      labels.push(y);
      aportadoArr.push(aportado);
      valorArr.push(valor);
      realArr.push(real);
    }

    const totalAportado = aportadoArr[anos];
    const valorFinal    = valorArr[anos];
    const valorReal     = realArr[anos];
    const beneficio     = valorFinal - totalAportado;
    const rentTotal     = totalAportado > 0 ? beneficio / totalAportado : 0;

    document.getElementById('sim-resultados').innerHTML = `
      <div class="kpi"><div class="label">Total aportado</div><div class="value">${fmtEUR(totalAportado)}</div></div>
      <div class="kpi"><div class="label">Valor final nominal</div><div class="value">${fmtEUR(valorFinal)}</div></div>
      <div class="kpi"><div class="label">Valor final real (post inflación)</div><div class="value">${fmtEUR(valorReal)}</div></div>
      <div class="kpi"><div class="label">Beneficio</div><div class="value" style="color:var(--verde);">${fmtEUR(beneficio)}</div></div>
      <div class="kpi full"><div class="label">Rentabilidad total acumulada</div><div class="value" style="color:var(--rojo);">${(rentTotal*100).toFixed(1).replace('.', ',')}%</div></div>
    `;

    // Tabla
    const tbody = document.querySelector('#tabla-proyeccion tbody');
    tbody.innerHTML = labels.slice(1).map((y, i) => {
      const idx = i + 1;
      return `<tr>
        <td>${y}</td>
        <td class="num">${fmtEUR(aportadoArr[idx])}</td>
        <td class="num">${fmtEUR(valorArr[idx])}</td>
        <td class="num" style="color:${valorArr[idx]-aportadoArr[idx] >= 0 ? 'var(--verde)' : 'var(--rojo)'};">${fmtEUR(valorArr[idx]-aportadoArr[idx])}</td>
        <td class="num">${fmtEUR(realArr[idx])}</td>
      </tr>`;
    }).join('');

    // Gráfico
    this.renderChart(labels, aportadoArr, valorArr, realArr);
  },

  renderChart(labels, aportado, valor, real) {
    const ctx = document.getElementById('chart-sim').getContext('2d');
    if (this.chart) this.chart.destroy();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(y => `Año ${y}`),
        datasets: [
          { label: 'Aportado acumulado', data: aportado, borderColor: '#666', backgroundColor: 'rgba(120,120,120,.1)', tension: .25, fill: false, borderDash: [6,4] },
          { label: 'Valor cartera (nominal)', data: valor, borderColor: '#C81E2E', backgroundColor: 'rgba(200,30,46,.15)', tension: .25, fill: true },
          { label: 'Valor real (post inflación)', data: real, borderColor: '#2f855a', backgroundColor: 'rgba(47,133,90,.10)', tension: .25, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: ${fmtEUR(c.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            ticks: { callback: v => fmtEUR(v) }
          }
        }
      }
    });
  },

  save() { localStorage.setItem('ck-simulador', JSON.stringify(this.state)); },
  load() {
    try { Object.assign(this.state, JSON.parse(localStorage.getItem('ck-simulador') || '{}')); } catch (_) {}
  }
};
