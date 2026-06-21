"use client";

import { useState, useEffect } from "react";

// =============================================================================
// NumberInput — input numérico que SÍ se puede editar/vaciar con comodidad
// =============================================================================
//
// Problema que resuelve: un `<input type="number" value={num}
// onChange={e => setNum(parseFloat(e.target.value) || 0)} />` controlado por un
// número NO deja borrar el primer dígito ni dejar la casilla vacía: en cuanto el
// valor parsea a vacío/NaN, el `|| 0` lo fuerza a 0 y el input vuelve a "0".
//
// Aquí mantenemos un "borrador" de TEXTO mientras se edita:
//   - permite vacío y estados intermedios ("", "-", "1.", "0.0")
//   - solo confirma (onChange) cuando el texto es un número válido
//   - al perder el foco, normaliza: vacío/incompleto → emptyValue, y aplica
//     min/max si se han indicado
//   - se resincroniza si el valor llega DESDE FUERA (cargar cartera, preset,
//     equiponderar, copiar A→B, etc.) sin pisar lo que el usuario teclea.
//
// Usamos type="text" + inputMode para tener control total del borrador (los
// inputs type="number" rechazan estados intermedios) manteniendo el teclado
// numérico en móvil. Se pierden las flechitas spinner (que nadie usa aquí).

interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "min" | "max"
  > {
  value: number;
  onChange: (value: number) => void;
  /** Valor al que se normaliza si la casilla queda vacía al perder el foco. */
  emptyValue?: number;
  /** Permitir decimales (por defecto sí). Si false, solo enteros. */
  allowDecimal?: boolean;
  /** Mínimo / máximo: se aplican al perder el foco (clamp). */
  min?: number;
  max?: number;
}

export function NumberInput({
  value,
  onChange,
  emptyValue = 0,
  allowDecimal = true,
  min,
  max,
  onBlur,
  inputMode,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(() => String(value));

  const parseNum = (s: string): number | null => {
    const t = s.trim();
    if (t === "" || t === "-" || t === "." || t === "-.") return null;
    const n = allowDecimal ? parseFloat(t) : parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };

  // Resincronizar el borrador SOLO cuando el valor cambia desde fuera y no
  // coincide con lo que hay escrito (evita pisar la edición en curso).
  useEffect(() => {
    if (parseNum(draft) !== value) {
      setDraft(Number.isFinite(value) ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  return (
    <input
      type="text"
      inputMode={inputMode ?? (allowDecimal ? "decimal" : "numeric")}
      value={draft}
      onChange={(e) => {
        const s = e.target.value.replace(",", "."); // coma decimal española → punto
        if (!pattern.test(s)) return; // ignora caracteres no válidos (letras, etc.)
        setDraft(s);
        const n = parseNum(s);
        if (n !== null) onChange(n); // vacío/parcial NO fuerza un valor
      }}
      onBlur={(e) => {
        let n = parseNum(draft);
        if (n === null) n = emptyValue;
        if (typeof min === "number" && n < min) n = min;
        if (typeof max === "number" && n > max) n = max;
        setDraft(String(n));
        if (n !== value) onChange(n);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}
