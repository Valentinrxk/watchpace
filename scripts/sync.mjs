import { writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bajarPerfil, actualizarPerfil, leerPerfil, usuariosConfigurados } from "../src/usuarios.js";
import { clave } from "../src/letterboxd.js";
import { enRaiz } from "../src/rutas.js";
import { hayKV, leerRemoto, guardarRemoto, leerSyncRemoto, guardarSyncRemoto } from "../src/estado-remoto.js";
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
let motivo = null;

/* el header muestra "sincronizado hace X" y estaba clavado en el 20/08:
   ese dato lo escribia el sync viejo, el que corria en la notebook y
   guardaba cache/estado.json. desde que el sync vive en github actions no
   lo tocaba nadie, asi que la fecha era la del ultimo commit de ese
   archivo y solo envejecia. ahora cada corrida deja su marca, haya
   novedades o no: lo que se muestra es cuando miramos letterboxd, no
   cuando cambio algo. */
const arranque = new Date().toISOString();

const anotarCorrida = async () => {
    const previa = (hayKV() ? await leerSyncRemoto() : null) ?? {};
    const marca = {
        ultimoIntento: arranque,
        ultima: fallos ? (previa.ultima ?? null) : new Date().toISOString(),
        error: fallos ? motivo : null,
    };
    /* sin kv (local) queda en disco, que es de donde lo lee el server */
    if (!(await guardarSyncRemoto(marca))) {
        try { writeFileSync(enRaiz("cache", "sync.json"), JSON.stringify(marca, null, 1)); }
        catch { /* no vale la pena romper el sync por la marca */ }
    }
};

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
        motivo = e.message;
        log(`${usuario}: fallo — ${e.message}`);
    }
}

/* salir en 0 con todo fallando hacia que el job diera verde y nadie se
   enterara de que hacia dias que no se sincronizaba */
const salir = async (codigo) => {
    await anotarCorrida();
    process.exit(fallos ? 1 : codigo);
};

if (!cambios) {
    log(fallos ? `nada que publicar · ${fallos} fallaron` : "nada que publicar");
    await salir(0);
}

/* metadata de tmdb para lo que haya aparecido */
try {
    const { stdout } = await correr(process.execPath, [enRaiz("src", "enrich.js")], { cwd: enRaiz(), timeout: 900000 });
    log(`enriquecido: ${stdout.trim().split("\n").at(-1)}`);
} catch (e) {
    /* los perfiles igual vale la pena publicarlos, pero que quede en rojo
       para enterarse */
    fallos++;
    motivo = String(e.message).split("\n")[0];
    log(`enriquecido fallo: ${motivo}`);
}

if (process.env.WATCHPACE_DEPLOY === "0") {
    log("deploy apagado, no pusheo");
    await salir(0);
}

const git = (...args) => correr("git", args, { cwd: enRaiz(), timeout: 120000 });

/* pushear ya no alcanza para deployar: quien pushea desde el runner es
   github-actions[bot], y el plan hobby de vercel solo construye commits de
   alguien con acceso al proyecto ("the deployment was blocked because the
   commit author did not have contributing access"). o sea que los commits
   de sync llegaban a github y ahi se quedaban: produccion solo se movia
   cuando pusheabas vos a mano.
   el deploy hook es una url que dispara el build igual, sin mirar quien
   firmo el commit. se crea en vercel > settings > git > deploy hooks. */
const avisarAVercel = async () => {
    const hook = process.env.VERCEL_DEPLOY_HOOK;
    /* si llegamos aca es porque hay datos nuevos pusheados. sin el hook se
       quedan en github y la app sigue mostrando lo viejo: eso es un fallo,
       no un aviso, o volvemos a tener un job en verde que no publica nada. */
    if (!hook) {
        fallos++;
        motivo = "falta VERCEL_DEPLOY_HOOK: pushee, pero vercel no deploya el commit del bot";
        return log(motivo);
    }
    try {
        const r = await fetch(hook, { method: "POST" });
        if (!r.ok) throw new Error(`hook ${r.status}`);
        log("deploy disparado");
    } catch (e) {
        fallos++;
        motivo = `no pude disparar el deploy: ${e.message}`;
        log(motivo);
    }
};

/* solo los archivos de datos que este script genera. con `git add -A` un
   job automatico se lleva puesto el codigo que tengas a medio escribir */
const MIOS = ["usuarios", "cache/films.json", "cache/personas.json"];

let publicado = false;

try {
    await git("add", "--", ...MIOS);
    const { stdout: pendiente } = await git("diff", "--cached", "--name-only");
    if (!pendiente.trim()) {
        log("los datos no cambiaron, no hay que publicar");
        await salir(0);
    }
    log(`publicando: ${pendiente.trim().split(/\r?\n/).join(", ")}`);
    await git("commit", "-m", `sync ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    /* explicito: en un runner limpio no hay upstream configurado */
    await git("pull", "--rebase", "--autostash", "origin", "master");
    await git("push", "origin", "HEAD:master");
    publicado = true;
    log("pusheado");
} catch (e) {
    fallos++;
    motivo = String(e.stderr || e.message).split("\n")[0];
    log(`git fallo: ${motivo}`);
}

if (publicado) await avisarAVercel();

await salir(0);
