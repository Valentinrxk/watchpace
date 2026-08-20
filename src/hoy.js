import { cargarExport, clave } from "./letterboxd.js";
import { calcularRitmo, ritmoPorDia } from "./pace.js";
import { prerankear, rankearFinal } from "./rank.js";
import { dondeVer, pad } from "./fmt.js";
import { leerCache } from "./enrich.js";
import { generarRetos } from "./retos.js";
import { CONFIG } from "./config.js";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valor = (n, def) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};

const linea = (c = "─") => console.log(c.repeat(58));
const fecha = (d) => d?.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
const cada = (r) => (r > 0 ? `1 cada ${(1 / r).toFixed(1)} dias` : "—");

const hoy = new Date();
const { diario, watchlist } = cargarExport(CONFIG.dirDatos);
const r = calcularRitmo({ diario, meta: CONFIG.meta, contarRewatches: CONFIG.contarRewatches, hoy });

linea();
console.log(`  WATCHPACE · ${r.anio} · @${CONFIG.usuario}`);
linea();
console.log(`  ${r.vistas} / ${r.meta}${" ".repeat(12)}${r.alDia ? `${-r.deficit} adelantado` : `${r.deficit} atrasado`}`);
console.log(`  faltan ${r.faltan} en ${r.restantes} dias   (${r.rewatches} rewatches incluidos)`);
console.log("");
console.log(`  tu ritmo      ${r.ritmoActual.toFixed(2)}/dia   ${cada(r.ritmoActual)}`);
console.log(`  necesario     ${r.ritmoNecesario.toFixed(2)}/dia   ${cada(r.ritmoNecesario)}`);
console.log(`  proyeccion    ${r.proyeccion} peliculas a fin de año`);
if (r.fechaMeta) console.log(`  tocas la meta el ${fecha(r.fechaMeta)}`);
console.log("");
const porDia = ritmoPorDia(diario, r.anio);
const top3 = Object.entries(porDia).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(`  tus dias      ${top3.map(([d, n]) => `${d} ${n}`).join("  ")}`);
console.log(`  watchlist     ${watchlist.length} pendientes`);
linea();

if (flag("solo-estado")) process.exit(0);

const n = valor("n", 6);
const minutos = valor("minutos", null);

const cache = leerCache();
const conDatos = watchlist.map((f) => ({ ...f, tmdb: cache[clave(f.nombre, f.anio)] ?? null }));
const candidatas = prerankear({ watchlist: conDatos, hoy }).slice(0, n);

let verificadas = candidatas;
if (flag("verificar")) {
    console.log(`\n  verificando ${n} contra Google...\n`);
    const { verificar } = await import("./verify.js");
    verificadas = await verificar(candidatas, { headless: !flag("ver") });
}

const [elegida, ...resto] = rankearFinal({ candidatas: verificadas, minutosDisponibles: minutos });

if (r.vioHoy) console.log("\n  (hoy ya viste una, esto es de yapa)");
console.log("\n  HOY\n");
console.log(`    ${elegida.nombre} (${elegida.anio})`);
const min = elegida.minutos ?? elegida.tmdb?.minutos;
const gen = elegida.generos ?? elegida.tmdb?.generos ?? [];
const dir = elegida.tmdb?.director;
console.log(`    ${min ? `${min} min` : "?"} · ${gen.join("/") || "?"}${dir ? ` · ${dir}` : ""}`);
console.log(`    ${dondeVer(elegida)}`);
console.log(`    en tu watchlist hace ${elegida.diasEnLista} dias`);

console.log("\n  si no\n");
for (const f of resto) console.log(`    ${pad(`${f.nombre} (${f.anio})`, 38)}${dondeVer(f)}`);

const retos = generarRetos({ diario, watchlist, cache, ritmo: r, hoy });
if (retos.length) {
    console.log("\n  RETO ABIERTO\n");
    console.log(`    ${retos[0].titulo}`);
    console.log(`    ${retos[0].detalle}`);
    console.log(`\n    (${retos.length - 1} retos mas · npm run retos)`);
}
console.log("");
