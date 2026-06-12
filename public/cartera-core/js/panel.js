/* Panel / Dashboard del Campus K
   Se muestra embebido en elproyectok.com/campus (modo ?solo=panel).
   Lee el mismo localStorage que el resto de la app (ck-perfil, ck-broker,
   ck-cartera, ck-disciplina, ck-simulador) y resume el estado del alumno.
   No depende de los demás módulos: parsea el storage directamente. */

const Panel = {

  CAMPUS: 'https://elproyectok.com/campus',

  init() {
    const cont = document.getElementById('seccion-panel');
    if (!cont) return;
    cont.innerHTML = this.render();
  },

  /* ---------- lectura defensiva de storage ---------- */
  read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return {}; }
  },

  fmt(v) {
    return (Math.round(v) || 0).toLocaleString('es-ES') + ' €';
  },

  hoyYM() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  nombreMes(m) {
    return ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
            'septiembre','octubre','noviembre','diciembre'][m - 1];
  },

  /* ---------- cálculos ---------- */
  estadoPlan() {
    const perfil = this.read('ck-perfil');
    const broker = this.read('ck-broker');
    const cartera = this.read('ck-cartera');
    const disc = this.read('ck-disciplina');

    const perfilOk = (perfil.capacidad && perfil.capacidad.length > 0) &&
                     (perfil.actitud && perfil.actitud.length > 0);
    const brokerOk = !!broker.seleccionado;
    const carteraOk = Array.isArray(cartera.lineas) && cartera.lineas.some(l => +l.valor > 0);
    const aportOk = disc.mesesAportados && Object.keys(disc.mesesAportados).length > 0;

    const pasos = [
      { id: 'perfil',     label: 'Perfil de riesgo', ok: perfilOk,  href: this.CAMPUS + '/cartera/' },
      { id: 'broker',     label: 'Tu broker',        ok: brokerOk,  href: this.CAMPUS + '/cartera/' },
      { id: 'cartera',    label: 'Tu cartera',       ok: carteraOk, href: this.CAMPUS + '/cartera/' },
      { id: 'aportacion', label: 'Primera aportación', ok: aportOk, href: this.CAMPUS + '/disciplina/' },
    ];
    const hechos = pasos.filter(p => p.ok).length;
    return { pasos, hechos, pct: Math.round((hechos / pasos.length) * 100) };
  },

  rachaSinMirar() {
    const disc = this.read('ck-disciplina');
    const dias = disc.diasNoMire || {};
    const d = new Date();
    let racha = 0;
    for (let i = 0; i < 366; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dias[iso]) { racha++; d.setDate(d.getDate() - 1); } else break;
    }
    return racha;
  },

  aportacionEsteMes() {
    const disc = this.read('ck-disciplina');
    return !!(disc.mesesAportados && disc.mesesAportados[this.hoyYM()]);
  },

  futuro() {
    const s = this.read('ck-simulador');
    const capital = +s.capital || 0;
    const aport = +s.aportacion || 0;
    const anos = +s.anos || 0;
    const r = (typeof s.rentabilidad === 'number') ? s.rentabilidad : 0.07;
    if (!anos || (!capital && !aport)) return null;
    let valor;
    if (r === 0) valor = capital + aport * 12 * anos;
    else valor = capital * Math.pow(1 + r, anos) +
                 aport * 12 * (Math.pow(1 + r, anos) - 1) / r;
    return { valor, aport, anos, year: new Date().getFullYear() + anos };
  },

  valorCartera() {
    const cartera = this.read('ck-cartera');
    if (!Array.isArray(cartera.lineas)) return { total: 0, posiciones: 0 };
    let total = 0, posiciones = 0;
    cartera.lineas.forEach(l => { const v = +l.valor || 0; if (v > 0) { total += v; posiciones++; } });
    return { total, posiciones };
  },

  /* ---------- render ---------- */
  render() {
    const plan = this.estadoPlan();
    const racha = this.rachaSinMirar();
    const aport = this.aportacionEsteMes();
    const fut = this.futuro();
    const cart = this.valorCartera();
    const mesNombre = this.nombreMes(new Date().getMonth() + 1);
    const A = (href, txt, cls) => `<a class="pa-btn ${cls || ''}" target="_top" href="${href}">${txt}</a>`;

    return `
    <style>
      body.solo .app{grid-template-columns:1fr!important}
      body.solo .main{max-width:100%!important;width:auto!important}
      #seccion-panel .pa-wrap{max-width:1140px;margin:0 auto;padding:8px 4px 40px}
      #seccion-panel .pa-hero{margin:6px 0 22px}
      #seccion-panel .pa-hero h1{font-family:var(--serif);font-size:2rem;margin:0 0 .3rem}
      #seccion-panel .pa-hero p{color:var(--texto-suave);margin:0}
      #seccion-panel .pa-progress-card{background:#fff;border:1px solid var(--borde);border-radius:14px;box-shadow:var(--sombra);padding:22px 24px;margin-bottom:18px}
      #seccion-panel .pa-progress-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:6px}
      #seccion-panel .pa-progress-top strong{font-size:1.05rem}
      #seccion-panel .pa-progress-top span{color:var(--rojo);font-weight:700}
      #seccion-panel .pa-bar{height:9px;background:var(--beige-osc);border-radius:999px;overflow:hidden;margin-bottom:16px}
      #seccion-panel .pa-bar > i{display:block;height:100%;background:var(--rojo);border-radius:999px;transition:width .5s}
      #seccion-panel .pa-steps{display:flex;gap:10px;flex-wrap:wrap}
      #seccion-panel .pa-step{display:flex;align-items:center;gap:7px;font-size:.86rem;font-weight:600;color:var(--texto-suave);text-decoration:none;padding:6px 12px;border:1px solid var(--borde);border-radius:999px;transition:all .15s}
      #seccion-panel .pa-step:hover{border-color:var(--rojo);color:var(--rojo)}
      #seccion-panel .pa-step .dot{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;background:var(--beige-osc);color:var(--texto-suave)}
      #seccion-panel .pa-step.ok{color:var(--texto)}
      #seccion-panel .pa-step.ok .dot{background:var(--verde);color:#fff}
      #seccion-panel .pa-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px}
      #seccion-panel .pa-tile{background:#fff;border:1px solid var(--borde);border-radius:14px;box-shadow:var(--sombra);padding:20px 22px;display:flex;flex-direction:column}
      #seccion-panel .pa-tile .pa-label{font-size:.78rem;text-transform:uppercase;letter-spacing:.5px;color:var(--texto-suave);font-weight:600;margin-bottom:8px}
      #seccion-panel .pa-tile .pa-big{font-family:var(--serif);font-size:2.3rem;font-weight:700;line-height:1.05;color:var(--texto)}
      #seccion-panel .pa-tile .pa-sub{color:var(--texto-suave);font-size:.86rem;margin-top:6px;flex:1}
      #seccion-panel .pa-tile.verde{background:var(--verde-bg);border-color:#cfe6d6}
      #seccion-panel .pa-tile.verde .pa-big{color:var(--verde)}
      #seccion-panel .pa-tile.rojo .pa-big{color:var(--rojo)}
      #seccion-panel .pa-btn{display:inline-block;margin-top:14px;align-self:flex-start;font-size:.85rem;font-weight:600;text-decoration:none;padding:8px 16px;border-radius:999px;background:var(--rojo);color:#fff}
      #seccion-panel .pa-btn:hover{background:var(--rojo-osc)}
      #seccion-panel .pa-btn.ghost{background:transparent;color:var(--rojo);border:1px solid var(--borde)}
      #seccion-panel .pa-btn.ghost:hover{border-color:var(--rojo)}
      #seccion-panel .pa-estado{display:inline-flex;align-items:center;gap:8px;font-family:var(--serif);font-size:1.5rem;font-weight:700}
      #seccion-panel .pa-cartera-card{background:#fff;border:1px solid var(--borde);border-radius:14px;box-shadow:var(--sombra);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      #seccion-panel .pa-cartera-card .pa-big{font-family:var(--serif);font-size:1.8rem;font-weight:700}
      #seccion-panel .pa-soon{font-size:.74rem;color:var(--texto-suave);background:var(--beige-osc);padding:3px 9px;border-radius:999px;font-weight:600}
      #seccion-panel .pa-quick{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
      #seccion-panel .pa-quick a{flex:1;min-width:150px;text-align:center;background:#fff;border:1px solid var(--borde);border-radius:12px;padding:14px;font-weight:600;color:var(--texto);text-decoration:none;transition:all .15s}
      #seccion-panel .pa-quick a:hover{border-color:var(--rojo);color:var(--rojo)}
      @media(max-width:760px){#seccion-panel .pa-grid{grid-template-columns:1fr}}
    </style>

    <div class="pa-wrap">
      <div class="pa-hero">
        <h1>Tu Campus K</h1>
        <p>Todo tu plan de inversor, en un vistazo. ${plan.hechos === 4
            ? 'Plan completo: ahora toca lo más difícil, no tocarlo.'
            : 'Completa los pasos que te faltan y deja que el tiempo trabaje.'}</p>
      </div>

      <div class="pa-progress-card">
        <div class="pa-progress-top">
          <strong>Tu plan está configurado</strong>
          <span>${plan.pct}%</span>
        </div>
        <div class="pa-bar"><i style="width:${plan.pct}%"></i></div>
        <div class="pa-steps">
          ${plan.pasos.map(p => `
            <a class="pa-step ${p.ok ? 'ok' : ''}" target="_top" href="${p.href}">
              <span class="dot">${p.ok ? '✓' : '○'}</span>${p.label}
            </a>`).join('')}
        </div>
      </div>

      <div class="pa-grid">
        <div class="pa-tile verde">
          <div class="pa-label">Racha de disciplina</div>
          <div class="pa-big">${racha} ${racha === 1 ? 'día' : 'días'}</div>
          <div class="pa-sub">${racha > 0
            ? 'Días seguidos sin mirar tu cartera. Tu mejor inversión es no hacer nada.'
            : 'Empieza tu racha: marca hoy como un día sin mirar tu cartera.'}</div>
          ${A(this.CAMPUS + '/disciplina/', racha > 0 ? 'Mantener la racha' : 'Empezar')}
        </div>

        <div class="pa-tile">
          <div class="pa-label">Aportación de ${mesNombre}</div>
          <div class="pa-estado" style="color:${aport ? 'var(--verde)' : 'var(--rojo)'}">
            ${aport ? '✓ Cumplida' : '○ Pendiente'}
          </div>
          <div class="pa-sub">${aport
            ? 'Bien hecho. La constancia es lo que construye el patrimonio.'
            : 'La única acción que de verdad importa este mes. Hazla y márcala.'}</div>
          ${A(this.CAMPUS + '/disciplina/', aport ? 'Ver calendario' : 'Marcar aportación', aport ? 'ghost' : '')}
        </div>

        <div class="pa-tile rojo">
          <div class="pa-label">Tu yo del futuro</div>
          ${fut
            ? `<div class="pa-big">${this.fmt(fut.valor)}</div>
               <div class="pa-sub">En ${fut.year}, si mantienes ${this.fmt(fut.aport)}/mes durante ${fut.anos} años. El interés compuesto hace el resto.</div>`
            : `<div class="pa-big" style="font-size:1.4rem">Configúralo</div>
               <div class="pa-sub">Proyecta cuánto tendrás si mantienes tu plan de aportaciones.</div>`}
          ${A(this.CAMPUS + '/herramientas/', 'Abrir simulador', 'ghost')}
        </div>
      </div>

      <div class="pa-cartera-card">
        <div>
          <div class="pa-label" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.5px;color:var(--texto-suave);font-weight:600;margin-bottom:6px">Valor de tu cartera</div>
          ${cart.total > 0
            ? `<div class="pa-big">${this.fmt(cart.total)} <span style="font-size:.95rem;color:var(--texto-suave);font-weight:400">· ${cart.posiciones} ${cart.posiciones === 1 ? 'posición' : 'posiciones'}</span></div>`
            : `<div class="pa-big" style="font-size:1.3rem;color:var(--texto-suave)">Aún sin configurar</div>`}
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="pa-soon" title="Próximamente: el valor se actualizará solo con los precios del mercado">⟳ Auto-valoración próximamente</span>
          ${A(this.CAMPUS + '/cartera/', cart.total > 0 ? 'Ver mi cartera' : 'Configurar cartera')}
        </div>
      </div>

      <div class="pa-quick">
        <a target="_top" href="https://hub.elproyectok.com/">📚 Mi Curso</a>
        <a target="_top" href="${this.CAMPUS + '/cartera/'}">📊 Mi Cartera</a>
        <a target="_top" href="${this.CAMPUS + '/herramientas/'}">🛠️ Mis Herramientas</a>
        <a target="_top" href="${this.CAMPUS + '/disciplina/'}">🧘 Mi Disciplina</a>
      </div>
    </div>`;
  }
};
