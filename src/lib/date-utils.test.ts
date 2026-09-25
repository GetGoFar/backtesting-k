import { describe, it, expect } from "vitest";
import { primerMesCompletoDesde, formatMesAnio } from "./date-utils";

describe("primerMesCompletoDesde", () => {
  it("descarta el mes cuando el activo empieza a cotizar a mitad de mes", () => {
    // Caso real: el Schroder ISF Global Gold estrenó NAV el 29-jun-2016. Contar
    // junio le habría dado al L&G Gold Mining el mes entero (+22,7 %) contra
    // dos días del Schroders (+2,0 %).
    expect(primerMesCompletoDesde("2016-06-29")).toEqual({
      inicio: "2016-07-01",
      mesDescartado: "2016-06",
    });
  });

  it("descarta el mes aunque el primer dato sea el último día hábil", () => {
    expect(primerMesCompletoDesde("2016-06-30")).toEqual({
      inicio: "2016-07-01",
      mesDescartado: "2016-06",
    });
  });

  it("acepta el mes si el activo cotiza desde el día 1", () => {
    expect(primerMesCompletoDesde("2016-06-01")).toEqual({ inicio: "2016-06-01" });
  });

  it("tolera los festivos de apertura de mes", () => {
    // 1-ene-2016 fue viernes festivo y el 2 y 3 fin de semana: el primer día
    // hábil real fue el lunes 4. Ese mes está completo.
    expect(primerMesCompletoDesde("2016-01-04")).toEqual({ inicio: "2016-01-04" });
    // 1-sep-2019 fue domingo: el lunes 2 es el primer hábil.
    expect(primerMesCompletoDesde("2019-09-02")).toEqual({ inicio: "2019-09-02" });
  });

  it("pasa al año siguiente cuando el mes descartado es diciembre", () => {
    expect(primerMesCompletoDesde("2020-12-15")).toEqual({
      inicio: "2021-01-01",
      mesDescartado: "2020-12",
    });
  });

  it("no toca una fecha que no tiene forma de fecha completa", () => {
    expect(primerMesCompletoDesde("2016-06")).toEqual({ inicio: "2016-06" });
  });
});

describe("formatMesAnio", () => {
  it("escribe el mes en castellano", () => {
    expect(formatMesAnio("2016-07")).toBe("julio de 2016");
    expect(formatMesAnio("2016-06")).toBe("junio de 2016");
  });
});
