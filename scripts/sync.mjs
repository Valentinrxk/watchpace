import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bajarPerfil, leerPerfil, usuariosConfigurados } from "../src/usuarios.js";
import { clave } from "../src/letterboxd.js";
import { enRaiz } from "../src/rutas.js";
import { hayKV, leerRemoto, guardarRemoto } from "../src/estado-remoto.js";
import { leerEstado, guardarEstado } from "../src/api.js";

/* si planificaste una peli y despues aparece en tu diario, el plan se
   cierra solo y queda anotado. si no, se vencia a medianoche en silencio */
const cerrarPlanCumplido = async (usuario, perfil) => {
    const estado = hayKV() ? await leerRemoto(usuario) : leerEstado();
    if (!estado?.plan) return null;

    const visto = perfil.diario.find((f) => f.nombre === estado.plan.nombre);
    if (!visto) return null;

    const nuevo = {
        ...estado,
        plan: null,
        historial: [
            ...(estado.historial ?? []).slice(-49),
            { tipo: "cumplido", pelicula: visto.nombre, anio: visto.anio, visto: visto.visto, rating: visto.rating ?? null },
        ],
    };
    if (hayKV()) await guardarRemoto(usuario, nuevo);
    else guardarEstado(nuevo);

    return visto;
};

const correr = promisify(execFile);
const log = (t) => console.log(`[${new Date().toLocaleString("es-AR")}] ${t}`);

const huella = (p) => (p ? `${p.diario.length}/${p.vistas.length}/${p.watchlist.length}` : "vacio");

let cambios = 0;

for (const { usuario } of usuariosConfigurados()) {
    const antes = leerPerfil(usuario);
    const previos = new Set((antes?.watchlist ?? []).map((f) => clave(f.nombre, f.anio)));

    try {
        const ahora = await bajarPerfil(usuario);
        const nuevas = antes ? ahora.watchlist.filter((f) => !previos.has(clave(f.nombre, f.anio))) : [];
        const vistasNuevas = ahora.diario.length - (antes?.diario.length ?? 0);

        const cumplido = await cerrarPlanCumplido(usuario, ahora);
        if (cumplido) log(`${usuario}: cerro el plan — vio ${cumplido.nombre} el ${cumplido.visto}`);

        if (huella(antes) !== huella(ahora)) {
            cambios++;
            const detalle = [
                vistasNuevas > 0 ? `${vistasNuevas} vistas nuevas` : null,
                nuevas.length ? `agrego ${nuevas.slice(0, 5).map((f) => f.nombre).join(", ")}` : null,
            ].filter(Boolean).join(" · ");
            log(`${usuario}: ${huella(antes)} -> ${huella(ahora)}${detalle ? ` · ${detalle}` : ""}`);
        } else {
            log(`${usuario}: sin cambios (${huella(ahora)})`);
        }
    } catch (e) {
        log(`${usuario}: fallo — ${e.message}`);
    }
}

if (!cambios) {
    log("nada que publicar");
    process.exit(0);
}

/* metadata de tmdb para lo que haya aparecido */
try {
    const { stdout } = await correr(process.execPath, [enRaiz("src", "enrich.js")], { cwd: enRaiz(), timeout: 900000 });
    log(`enriquecido: ${stdout.trim().split("\n").at(-1)}`);
} catch (e) {
    log(`enriquecido fallo: ${String(e.message).split("\n")[0]}`);
}

if (process.env.WATCHPACE_DEPLOY === "0") {
    log("deploy apagado, no pusheo");
    process.exit(0);
}

/* el repo esta conectado a vercel: pushear ya deploya */
const git = (...args) => correr("git", args, { cwd: enRaiz(), timeout: 120000 });

/* solo los archivos de datos que este script genera. con `git add -A` un
   job automatico se lleva puesto el codigo que tengas a medio escribir */
const MIOS = ["usuarios", "cache/films.json", "cache/personas.json"];

try {
    await git("add", "--", ...MIOS);
    const { stdout: pendiente } = await git("diff", "--cached", "--name-only");
    if (!pendiente.trim()) {
        log("los datos no cambiaron, no hay que publicar");
        process.exit(0);
    }
    log(`publicando: ${pendiente.trim().split(/\r?\n/).join(", ")}`);
    await git("commit", "-m", `sync ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    await git("push");
    log("pusheado — vercel deploya solo");
} catch (e) {
    log(`git fallo: ${String(e.stderr || e.message).split("\n")[0]}`);
}
