/* Orquestación general y navegación */

const App = {

  rutas: [
    { id: 'inicio',       label: 'Inicio',                    grupo: '' },
    { id: 'perfil',       label: '1. Tu Perfil',              grupo: 'Tu Plan' },
    { id: 'broker',       label: '2. Mi Broker',              grupo: 'Tu Plan' },
    { id: 'cartera',      label: '3. Mi Cartera',             grupo: 'Tu Plan' },
    { id: 'disciplina',   label: '4. Mi Disciplina',          grupo: 'Tu Plan' },
    { id: 'simulador',    label: 'Simulador DCA',             grupo: 'Herramientas' }
  ],

  init() {
    // Modos de incrustación (campus): ?hide=a,b oculta secciones; ?solo=x muestra solo una
    const params = new URLSearchParams(location.search);
    this.hidden = new Set((params.get('hide') || '').split(',').filter(Boolean));
    this.solo = params.get('solo') || null;
    if (this.solo) document.body.classList.add('solo');
    this.rutas = this.rutas.filter(r => !this.hidden.has(r.id));

    this.renderNav();
    this.renderInicio();
    Perfil.init();
    Broker.init();
    Cartera.init();
    Disciplina.init();
    Simulador.init();
    this.bindGlobal();

    // Retirar de Inicio los accesos a secciones ocultas (y tarjetas que queden vacías)
    this.hidden.forEach(id => {
      document.querySelectorAll('#seccion-inicio [data-go="' + id + '"]').forEach(el => el.remove());
    });
    document.querySelectorAll('#seccion-inicio .card').forEach(c => {
      const grid = c.querySelector('div[style*="display:grid"]');
      if (grid && !grid.querySelector('button')) c.remove();
    });
    // Renumerar "Tu Plan en N pasos" según las secciones visibles
    if (this.hidden.size) {
      document.querySelectorAll('#seccion-inicio h2').forEach(h => {
        if (h.textContent.trim() === 'Tu Plan en 4 pasos') {
          const nBtn = h.parentElement.querySelectorAll('button').length;
          h.textContent = 'Tu Plan en ' + nBtn + ' pasos';
        }
      });
    }

    const hash = location.hash.replace('#', '') || 'inicio';
    this.go(this.solo || hash);
  },

  renderNav() {
    const nav = document.getElementById('nav');
    let lastGrupo = null, html = '';
    this.rutas.forEach(r => {
      if (r.grupo !== lastGrupo && r.grupo) {
        html += `<div class="nav-group">${r.grupo}</div>`;
        lastGrupo = r.grupo;
      }
      html += `<button data-go="${r.id}">${r.label}</button>`;
    });
    nav.innerHTML = html;
    nav.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => this.go(b.dataset.go));
    });
  },

  go(id) {
    if (this.solo && id !== this.solo) id = this.solo;
    if (this.hidden && this.hidden.has(id)) id = 'inicio';
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('seccion-' + id);
    if (!target) { this.go('inicio'); return; }
    target.classList.add('active');

    document.querySelectorAll('#nav button').forEach(b => {
      b.classList.toggle('active', b.dataset.go === id);
    });

    history.replaceState(null, '', '#' + id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  bindGlobal() {
    document.querySelectorAll('[data-go]').forEach(el => {
      if (el.tagName === 'BUTTON' && el.parentElement.id === 'nav') return;
      el.addEventListener('click', e => { e.preventDefault(); this.go(el.dataset.go); });
    });
    document.getElementById('btn-reset-todo')?.addEventListener('click', () => {
      if (!confirm('Esto borrará todos tus datos guardados (perfil, broker, carteras, simulador). ¿Continuar?')) return;
      ['ck-perfil', 'ck-cartera', 'ck-simulador', 'ck-broker', 'ck-disciplina'].forEach(k => localStorage.removeItem(k));
      location.reload();
    });
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportar());
    document.getElementById('btn-import')?.addEventListener('click', () => document.getElementById('file-import').click());
    document.getElementById('file-import')?.addEventListener('change', e => this.importar(e));
  },

  renderInicio() {
    const cont = document.getElementById('seccion-inicio');
    cont.innerHTML = `
      <div class="hero">
        <h1>Cartera Core · El Proyecto K</h1>
        <p>Tu herramienta de gestión de cartera indexada. Versión web del Excel oficial.</p>
      </div>

      <div class="card">
        <h2>Cómo empezar</h2>
        <div class="steps">
          <div class="step">
            <div class="num">PASO 1</div>
            <div>
              <strong>Descubre tu perfil de riesgo</strong>
              <p>Responde 10 preguntas para conocer tu tolerancia al riesgo (1-10).</p>
              <button class="secondary" data-go="perfil">→ Ir al Test de Perfil de Riesgo</button>
            </div>
          </div>
          <div class="step">
            <div class="num">PASO 2</div>
            <div>
              <strong>Elige tu estrategia de inversión</strong>
              <p><strong>Geográfica:</strong> reparte por regiones del mundo (Global + Emergentes).<br>
                 <strong>Sectorial:</strong> reparte por sectores defensivos y de crecimiento.</p>
            </div>
          </div>
          <div class="step">
            <div class="num">PASO 3</div>
            <div>
              <strong>Introduce tus datos en la hoja de Control</strong>
              <p>Rellena solo las celdas amarillas: tu capital, aportaciones y valor actual de cada posición.
                 La hoja calculará automáticamente qué comprar o vender para rebalancear.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>Tu Plan en 4 pasos</h2>
          <div style="display:grid;gap:.5rem;">
            <button class="secondary" data-go="perfil">→ 1. Tu Perfil de Riesgo</button>
            <button class="secondary" data-go="broker">→ 2. Tu Broker</button>
            <button class="secondary" data-go="cartera">→ 3. Tu Cartera</button>
            <button class="secondary" data-go="disciplina">→ 4. Tu Disciplina</button>
          </div>
        </div>
        <div class="card">
          <h2>Herramientas</h2>
          <div style="display:grid;gap:.5rem;">
            <button class="secondary" data-go="simulador">→ Simulador DCA</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Glosario rápido</h2>
        <dl class="glosario">
          ${DATA.glosario.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}
        </dl>
      </div>

      <div class="card">
        <h2>Leyenda de colores</h2>
        <div class="legend-row"><span class="legend-pill amarillo"></span> Celda editable - Introduce tus datos aquí</div>
        <div class="legend-row"><span class="legend-pill gris"></span> Celda automática - Calculada con fórmulas</div>
        <div class="legend-row"><span class="legend-pill verde">+</span> Comprar - Debes comprar esta cantidad para rebalancear</div>
        <div class="legend-row"><span class="legend-pill rojo">-</span> Vender - Debes vender esta cantidad para rebalancear</div>
      </div>

      <div class="card">
        <h2>Tus datos</h2>
        <p>La aplicación guarda automáticamente todo en tu navegador (localStorage). Nadie más ve tus números.</p>
        <div class="toolbar">
          <button class="secondary" id="btn-export">⤓ Exportar mis datos (JSON)</button>
          <button class="secondary" id="btn-import">⤒ Importar datos</button>
          <input type="file" id="file-import" accept=".json" style="display:none;">
          <div class="spacer"></div>
          <button class="ghost" id="btn-reset-todo">Borrar todos mis datos</button>
        </div>
      </div>
    `;
    cont.querySelectorAll('[data-go]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); this.go(el.dataset.go); });
    });
    cont.querySelector('#btn-reset-todo').addEventListener('click', () => {
      if (!confirm('Esto borrará todos tus datos guardados (perfil, broker, carteras, simulador). ¿Continuar?')) return;
      ['ck-perfil', 'ck-cartera', 'ck-simulador', 'ck-broker', 'ck-disciplina'].forEach(k => localStorage.removeItem(k));
      location.reload();
    });
    cont.querySelector('#btn-export').addEventListener('click', () => this.exportar());
    cont.querySelector('#btn-import').addEventListener('click', () => document.getElementById('file-import').click());
    cont.querySelector('#file-import').addEventListener('change', e => this.importar(e));
  },

  exportar() {
    const data = {
      perfil:     JSON.parse(localStorage.getItem('ck-perfil') || '{}'),
      cartera:    JSON.parse(localStorage.getItem('ck-cartera') || '{}'),
      simulador:  JSON.parse(localStorage.getItem('ck-simulador') || '{}'),
      broker:     JSON.parse(localStorage.getItem('ck-broker') || '{}'),
      disciplina: JSON.parse(localStorage.getItem('ck-disciplina') || '{}'),
      fecha:      new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cartera-core-k_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  },

  importar(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.perfil)     localStorage.setItem('ck-perfil',     JSON.stringify(data.perfil));
        if (data.cartera)    localStorage.setItem('ck-cartera',    JSON.stringify(data.cartera));
        if (data.simulador)  localStorage.setItem('ck-simulador',  JSON.stringify(data.simulador));
        if (data.broker)     localStorage.setItem('ck-broker',     JSON.stringify(data.broker));
        if (data.disciplina) localStorage.setItem('ck-disciplina', JSON.stringify(data.disciplina));
        alert('Datos importados correctamente.');
        location.reload();
      } catch (err) {
        alert('No se pudo leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
