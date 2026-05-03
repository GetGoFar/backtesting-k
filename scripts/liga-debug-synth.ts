// Debug: verifica que crearSerieSintetica funciona con datos reales de EODHD.
import { fetchNavsEODHD, crearSerieSintetica } from "../src/lib/liga-engine";

(async () => {
  const token = process.env.EODHD_API_TOKEN || "";
  console.log("token present:", !!token);
  const [iwda, vgea] = await Promise.all([
    fetchNavsEODHD("IWDA.AS", token),
    fetchNavsEODHD("VGEA.AS", token),
  ]);
  console.log("IWDA.AS:", iwda.length, "NAVs");
  console.log("VGEA.AS:", vgea.length, "NAVs");
  if (iwda.length > 0) console.log("IWDA first:", iwda[0], "last:", iwda[iwda.length - 1]);
  if (vgea.length > 0) console.log("VGEA first:", vgea[0], "last:", vgea[vgea.length - 1]);

  const synth = crearSerieSintetica(iwda, vgea, 0.8);
  console.log("synth 80/20 length:", synth.length);
  if (synth.length > 0) {
    console.log("synth first:", synth[0]);
    console.log("synth last:", synth[synth.length - 1]);
  } else {
    console.log("EMPTY synth - bug somewhere");
  }
})();
