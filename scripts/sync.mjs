import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cargarExport, claveEntrada, clave } from "../src/letterboxd.js";
import { sincronizar, sincronizarWatchlist } from "../src/sync.js";
import { CONFIG } from "../src/config.js";
import { enRaiz } from "../src/rutas.js";

const correr = promisify(execFile);
const sello = () => new Date().toLocaleString("es-AR");
const log = (t) => console.log(`[${sello()}] ${t}`);

const { diario, watchlist } = cargarExport(CONFIG.dirDatos);

const r = await sincronizar({ yaConocidas: new Set(diario.map(claveEntrada)) });
log(`diario: ${r.ok ? `${r.nuevas.length} nuevas${r.nuevas.length ? " — " + r.nuevas.map((f) => f.nombre).join(", ") : ""}` : `fallo: ${r.error}`}`);

const w = await sincronizarWatchlist({
    fechasConocidas: new Map(watchlist.map((f) => [clave(f.nombre, f.anio), f.agregada])),
});
log(`watchlist: ${w.ok ? `${w.total} total, ${w.agregadas.length} agregadas, ${w.sacadas.length} sacadas${w.agregadas.length ? " — " + w.agregadas.map((f) => f.nombre).join(", ") : ""}` : `fallo: ${w.error}`}`);

/* redeploy solo si algo cambio de verdad: no tiene sentido publicar
   una copia identica cada 6 horas. se apaga con WATCHPACE_DEPLOY=0 */
const cambios = (r.nuevas?.length ?? 0) + (w.agregadas?.length ?? 0) + (w.sacadas?.length ?? 0);
if (!cambios) {
    log("sin cambios, no redeployo");
    process.exit(0);
}
if (process.env.WATCHPACE_DEPLOY === "0") {
    log(`${cambios} cambios, pero el redeploy esta apagado`);
    process.exit(0);
}

try {
    const { stdout } = await correr("vercel", ["--prod", "--yes", "--cwd", enRaiz()], { shell: true, timeout: 300000 });
    log(`redeploy ok: ${(stdout.match(/https:\/\/\S+/g) ?? []).pop() ?? "(sin url)"}`);
} catch (e) {
    log(`redeploy fallo: ${String(e.stderr || e.message).split("\n")[0]}`);
}
