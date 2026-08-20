import { cargarExport } from "./letterboxd.js";
import { calcularRitmo } from "./pace.js";
import { generarRetos } from "./retos.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { dondeVer, pad } from "./fmt.js";
import { CONFIG } from "./config.js";

const args = process.argv.slice(2);
const cuantos = args.includes("--todos") ? 99 : Number(args[args.indexOf("--n") + 1]) || 3;

const barra = (p, o) => {
    const llenas = Math.max(0, Math.min(10, Math.round((p / o) * 10)));
    return `${"■".repeat(llenas)}${"·".repeat(10 - llenas)} ${p}/${o}`;
};

const hoy = new Date();
const { diario, watchlist, vistasFilas } = cargarExport(CONFIG.dirDatos);
const cache = leerCache();
const ritmo = calcularRitmo({ diario, meta: CONFIG.meta, contarRewatches: CONFIG.contarRewatches, hoy });
const retos = generarRetos({ diario, watchlist, vistasFilas, cache, personas: leerPersonas(), ritmo, hoy });

console.log("");
console.log(`  RETOS · ${retos.length} activos posibles`);
console.log("─".repeat(58));

for (const r of retos.slice(0, cuantos)) {
    console.log("");
    console.log(`  ${r.titulo}`);
    console.log(`  ${r.detalle}`);
    console.log(`  ${barra(r.progreso, r.objetivo)}`);
    for (const c of r.candidatas) console.log(`      ${pad(`${c.nombre} (${c.anio})`, 40)}${dondeVer(c)}`);
}
console.log("");
