"use client";

// Componente de disclaimer legal requerido

export function Disclaimer() {
  return (
    <footer className="mt-12 border-t border-gray-200 pt-6 pb-8">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-500 text-xl flex-shrink-0">⚠️</span>
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>Aviso legal:</strong> Esta herramienta tiene fines
            exclusivamente educativos. Las rentabilidades pasadas no garantizan
            resultados futuros. Los datos de fondos bancarios pueden no reflejar
            valores liquidativos exactos. Consulta siempre el folleto informativo
            de cada fondo. El Proyecto K no es una entidad de asesoramiento
            financiero regulada.
          </p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} El Proyecto K — Educación Financiera
      </p>
    </footer>
  );
}
