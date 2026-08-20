import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { bajarPerfil, usuariosConfigurados } from "../src/usuarios.js";
import { parseCsv } from "../src/csv.js";
import { clave } from "../src/letterboxd.js";
import { enRaiz } from "../src/rutas.js";

const pedidos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const usuarios = pedidos.length ? pedidos : usuariosConfigurados().map((u) => u.usuario);
const anios = Number(process.argv.find((a) => a.startsWith("--anios="))?.split("=")[1] ?? 1);

for (const u of usuarios) {
    process.stdout.write(`\n${u}: `);
    const t0 = Date.now();
    const p = await bajarPerfil(u, { anios, onPaso: (s) => process.stdout.write(`${s}… `) });
    console.log(`\n  diario ${p.diario.length} · vistas ${p.vistas.length} · watchlist ${p.watchlist.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    /* si hay un export csv de este usuario, rescatamos las fechas reales de
       watchlist: la pagina publica no las trae */
    const csv = enRaiz("data", "watchlist.csv");
    if (u === "valentinrxk" && existsSync(csv)) {
        const fechas = Object.fromEntries(
            parseCsv(readFileSync(csv, "utf8")).map((r) => [clave(r.Name, Number(r.Year)), r.Date]),
        );
        mkdirSync(enRaiz("usuarios", u), { recursive: true });
        writeFileSync(enRaiz("usuarios", u, "fechas-watchlist.json"), JSON.stringify(fechas, null, 1));
        console.log(`  fechas de watchlist rescatadas del export: ${Object.keys(fechas).length}`);
    }
}
