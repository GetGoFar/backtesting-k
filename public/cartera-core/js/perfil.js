/* Test de Perfil de Riesgo */

const Perfil = {

  state: {
    capacidad: [],   // respuestas (índices) preguntas 1-5
    actitud: [],     // respuestas (índices) preguntas 6-10
  },

  init() {
    this.load();
    this.render();
  },

  render() {
    const cont = document.getElementById('seccion-perfil');
    cont.innerHTML = `
      <div class="hero">
        <h1>Evalúa tu Perfil de Riesgo</h1>
        <p>Cada persona tiene una actitud y una capacidad diferentes para asumir riesgos con su dinero. Responde estas 10 preguntas para conocer el tuyo.</p>
      </div>

      <div class="card">
        <h2>Capacidad para asumir riesgos</h2>
        <p>Tu situación financiera y horizonte temporal.</p>
        <div id="bloque-capacidad"></div>
        <div style="margin-top:.5rem;text-align:right;color:var(--texto-suave);font-weight:600;">
          Subtotal capacidad: <span id="subtotal-capacidad">0</span> / 100
        </div>
      </div>

      <div class="card">
        <h2>Actitud hacia el riesgo</h2>
        <p>Tu tolerancia emocional ante la volatilidad.</p>
        <div id="bloque-actitud"></div>
        <div style="margin-top:.5rem;text-align:right;color:var(--texto-suave);font-weight:600;">
          Subtotal actitud: <span id="subtotal-actitud">0</span> / 100
        </div>
      </div>

      <div class="card">
        <div class="toolbar">
          <button id="btn-reset-perfil" class="ghost">Reiniciar test</button>
          <div class="spacer"></div>
          <button id="btn-aplicar-perfil">Usar este perfil en mi cartera →</button>
        </div>
        <div id="resultado-perfil"></div>
      </div>
    `;

    this.renderPreguntas('bloque-capacidad', DATA.preguntasCapacidad, 'capacidad');
    this.renderPreguntas('bloque-actitud',  DATA.preguntasActitud,   'actitud');

    document.getElementById('btn-reset-perfil').onclick = () => this.reset();
    document.getElementById('btn-aplicar-perfil').onclick = () => this.aplicar();

    this.calcular();
  },

  renderPreguntas(contId, preguntas, grupo) {
    const cont = document.getElementById(contId);
    cont.innerHTML = preguntas.map((p, qi) => {
      const sel = this.state[grupo][qi];
      return `
        <div class="pregunta">
          <div class="titulo">${p.pregunta}</div>
          ${p.opciones.map((opt, oi) => `
            <label class="${sel === oi ? 'selected' : ''}">
              <input type="radio" name="${grupo}-${qi}" value="${oi}" ${sel === oi ? 'checked' : ''}
                     data-grupo="${grupo}" data-q="${qi}" data-o="${oi}">
              ${opt.texto}
              <span style="float:right;color:var(--texto-suave);font-size:.85rem;">+${opt.puntos} pts</span>
            </label>
          `).join('')}
        </div>
      `;
    }).join('');

    cont.querySelectorAll('input[type="radio"]').forEach(input => {
      input.addEventListener('change', e => {
        const g = e.target.dataset.grupo;
        const q = +e.target.dataset.q;
        const o = +e.target.dataset.o;
        this.state[g][q] = o;
        this.save();
        this.renderPreguntas(contId === 'bloque-capacidad' ? 'bloque-capacidad' : 'bloque-actitud',
                             grupo === 'capacidad' ? DATA.preguntasCapacidad : DATA.preguntasActitud,
                             grupo);
        this.calcular();
      });
    });
  },

  puntuacionGrupo(preguntas, respuestas) {
    return respuestas.reduce((acc, oi, qi) => {
      if (oi === undefined || oi === null) return acc;
      return acc + (preguntas[qi].opciones[oi]?.puntos || 0);
    }, 0);
  },

  calcular() {
    const cap = this.puntuacionGrupo(DATA.preguntasCapacidad, this.state.capacidad);
    const act = this.puntuacionGrupo(DATA.preguntasActitud,  this.state.actitud);
    document.getElementById('subtotal-capacidad').textContent = cap;
    document.getElementById('subtotal-actitud').textContent  = act;

    const completo = this.state.capacidad.length === 5 && this.state.actitud.length === 5
                  && this.state.capacidad.every(x => x !== undefined && x !== null)
                  && this.state.actitud.every(x => x !== undefined && x !== null);

    const cont = document.getElementById('resultado-perfil');
    if (!completo) {
      cont.innerHTML = `<p style="color:var(--texto-suave);">Completa todas las preguntas para conocer tu perfil de riesgo.</p>`;
      return;
    }

    const total = Math.min(cap, act);
    const perfil = DATA.perfiles.find(p => total >= p.rango[0] && total <= p.rango[1]);
    const nivel  = this.puntuacionToNivel(total);

    cont.innerHTML = `
      <div class="resultado-perfil">
        <div style="margin-bottom:.5rem;">
          <span class="puntos">${total} pts</span>
          <strong style="font-size:1.2rem;">${perfil.titulo}</strong>
        </div>
        <p>${perfil.descripcion}</p>
        <p><strong>Objetivo de rendimiento:</strong> ${perfil.objetivo}</p>
        <p style="margin-top:.6rem;">
          Nivel de riesgo numérico (1-10) para tu cartera: <strong style="color:var(--rojo);font-size:1.3rem;">${nivel}</strong>
        </p>
        <p style="font-size:.85rem;color:var(--texto-suave);margin:0;">
          Se toma el menor de tus dos subtotales (capacidad: ${cap}, actitud: ${act}). El perfil más prudente prevalece.
        </p>
      </div>
    `;
  },

  // Conversión 0-100 puntos → nivel 1-10
  puntuacionToNivel(p) {
    if (p <= 10) return 1;
    if (p <= 20) return 2;
    if (p <= 30) return 3;
    if (p <= 40) return 4;
    if (p <= 50) return 5;
    if (p <= 60) return 6;
    if (p <= 70) return 7;
    if (p <= 80) return 8;
    if (p <= 90) return 9;
    return 10;
  },

  reset() {
    this.state = { capacidad: [], actitud: [] };
    this.save();
    this.render();
  },

  aplicar() {
    const cap = this.puntuacionGrupo(DATA.preguntasCapacidad, this.state.capacidad);
    const act = this.puntuacionGrupo(DATA.preguntasActitud,  this.state.actitud);
    const completo = this.state.capacidad.length === 5 && this.state.actitud.length === 5
                  && this.state.capacidad.every(x => x !== undefined && x !== null)
                  && this.state.actitud.every(x => x !== undefined && x !== null);
    if (!completo) {
      alert('Completa antes las 10 preguntas.');
      return;
    }
    const nivel = this.puntuacionToNivel(Math.min(cap, act));
    Cartera.state.riesgo = nivel;
    Cartera.save();
    Cartera.render();
    App.go('cartera');
  },

  save() {
    localStorage.setItem('ck-perfil', JSON.stringify(this.state));
  },

  load() {
    try {
      const s = JSON.parse(localStorage.getItem('ck-perfil') || '{}');
      this.state.capacidad = s.capacidad || [];
      this.state.actitud   = s.actitud   || [];
    } catch (_) {}
  }
};
