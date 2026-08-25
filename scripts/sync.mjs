import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bajarPerfil, actualizarPerfil, leerPerfil, usuariosConfigurados } from "../src/usuarios.js";
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
const sello = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const log = (t) => console.log(`[${sello()}] ${t}`);

const huella = (p) => (p ? `${p.diario.length}/${p.vistas.length}/${p.watchlist.length}` : "vacio");

let cambios = 0;
let fallos = 0;

/* sin token no se puede enriquecer, y enrich.js escribiria el cache con
   respuestas vacias. mejor no arrancar. */
if (!process.env.TMDB_TOKEN) {
    log("falta TMDB_TOKEN");
    process.exit(1);
}

for (const { usuario } of usuariosConfigurados()) {
    const antes = leerPerfil(usuario);
    const previos = new Set((antes?.watchlist ?? []).map((f) => clave(f.nombre, f.anio)));

    try {
        /* el camino normal es el liviano: el rss trae las ultimas 50
           funciones y la watchlist solo se rebaja si cambio. son 2 pedidos
           en vez de 30, y ademas es el unico que funciona fuera de una
           conexion domestica: /films/diary/ da 403 desde un datacenter. */
        const entero = !antes || process.env.WATCHPACE_FORZAR === "1";

        const ahora = entero
            ? (log(`${usuario}: bajando el perfil entero…`), await bajarPerfil(usuario, { anios: 7 }))
            : (await actualizarPerfil(usuario)).perfil;

        const nuevasEnLista = antes ? ahora.watchlist.filter((f) => !previos.has(clave(f.nombre, f.anio))) : [];
        const vistasNuevas = ahora.diario.length - (antes?.diario.length ?? 0);

        const cumplido = await cerrarPlanCumplido(usuario, ahora);
        if (cumplido) log(`${usuario}: cerro el plan — vio ${cumplido.nombre} el ${cumplido.visto}`);

        if (huella(antes) !== huella(ahora)) {
            cambios++;
            const detalle = [
                vistasNuevas > 0 ? `${vistasNuevas} vistas nuevas` : null,
                nuevasEnLista.length ? `agrego ${nuevasEnLista.slice(0, 5).map((f) => f.nombre).join(", ")}` : null,
            ].filter(Boolean).join(" · ");
            log(`${usuario}: ${huella(antes)} -> ${huella(ahora)}${detalle ? ` · ${detalle}` : ""}`);
        } else {
            log(`${usuario}: sin novedades (${huella(ahora)})`);
        }
    } catch (e) {
        fallos++;
        log(`${usuario}: fallo — ${e.message}`);
    }
}

/* salir en 0 con todo fallando hacia que el job diera verde y nadie se
   enterara de que hacia dias que no se sincronizaba */
const salir = (codigo) => process.exit(fallos ? 1 : codigo);

if (!cambios) {
    log(fallos ? `nada que publicar · ${fallos} fallaron` : "nada que publicar");
    salir(0);
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
    salir(0);
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
        salir(0);
    }
    log(`publicando: ${pendiente.trim().split(/\r?\n/).join(", ")}`);
    await git("commit", "-m", `sync ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    /* explicito: en un runner limpio no hay upstream configurado */
    await git("pull", "--rebase", "--autostash", "origin", "master");
    await git("push", "origin", "HEAD:master");
    log("pusheado — vercel deploya solo");
} catch (e) {
    fallos++;
    log(`git fallo: ${String(e.stderr || e.message).split("\n")[0]}`);
}

salir(0);
