import { cargarExport, claveEntrada, clave } from "../src/letterboxd.js";
import { sincronizar, sincronizarWatchlist } from "../src/sync.js";
import { CONFIG } from "../src/config.js";

const sello = () => new Date().toLocaleString("es-AR");

const { diario, watchlist } = cargarExport(CONFIG.dirDatos);
const r = await sincronizar({ yaConocidas: new Set(diario.map(claveEntrada)) });
console.log(`[${sello()}] diario: ${r.ok ? `${r.nuevas.length} nuevas${r.nuevas.length ? " — " + r.nuevas.map((f) => f.nombre).join(", ") : ""}` : `fallo: ${r.error}`}`);

const w = await sincronizarWatchlist({
    fechasConocidas: new Map(watchlist.map((f) => [clave(f.nombre, f.anio), f.agregada])),
});
console.log(`[${sello()}] watchlist: ${w.ok ? `${w.total} total, ${w.agregadas.length} agregadas, ${w.sacadas.length} sacadas${w.agregadas.length ? " — " + w.agregadas.map((f) => f.nombre).join(", ") : ""}` : `fallo: ${w.error}`}`);
