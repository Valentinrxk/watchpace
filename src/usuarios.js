import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { enRaiz } from "./rutas.js";
import { clave } from "./letterboxd.js";
import { traerDiario, traerVistas, traerWatchlist, traerRssDiario, primeraDeWatchlist } from "./perfil.js";
import { CONFIG } from "./config.js";

const carpeta = (usuario) => enRaiz("usuarios", usuario);
const rutaPerfil = (usuario) => enRaiz("usuarios", usuario, "perfil.json");

export const usuariosConfigurados = () => CONFIG.usuarios ?? [{ usuario: CONFIG.usuario, meta: CONFIG.meta }];

export const configDe = (usuario) =>
    usuariosConfigurados().find((u) => u.usuario === usuario) ?? usuariosConfigurados()[0];

export const hayPerfil = (usuario) => existsSync(rutaPerfil(usuario));

export const leerPerfil = (usuario) =>
    hayPerfil(usuario) ? JSON.parse(readFileSync(rutaPerfil(usuario), "utf8")) : null;

export const guardarPerfil = (usuario, perfil) => {
    mkdirSync(carpeta(usuario), { recursive: true });
    writeFileSync(rutaPerfil(usuario), JSON.stringify(perfil, null, 1));
    return perfil;
};

/* un perfil no encoge: si letterboxd nos devolvio basura (un desafio, una
   pagina de mantenimiento) el parser saca listas vacias y las guardariamos
   encima de los datos buenos. mejor abortar y reintentar en la proxima. */
export class PerfilSospechoso extends Error {}

export const verificarPerfil = (usuario, nuevo) => {
    const antes = leerPerfil(usuario);
    if (!antes) return nuevo;

    for (const campo of ["diario", "vistas", "watchlist"]) {
        const a = antes[campo]?.length ?? 0;
        const n = nuevo[campo]?.length ?? 0;
        if (a >= 10 && n < a * 0.75) {
            throw new PerfilSospechoso(
                `${campo} paso de ${a} a ${n}; no lo guardo`,
            );
        }
    }
    return nuevo;
};

/* trae todo el perfil publico. anios: cuantos anios de diario bajar hacia
   atras (el diario se pagina por anio). el resto sale de /films/. */
export const bajarPerfil = async (usuario, { anios = 1, onPaso = () => {} } = {}) => {
    const hoy = new Date();
    const diario = [];
    const bajados = new Set();
    for (let i = 0; i < anios; i++) {
        const a = hoy.getFullYear() - i;
        bajados.add(String(a));
        onPaso(`diario ${a}`);
        diario.push(...(await traerDiario(usuario, a)));
    }

    /* el sync diario solo baja el año en curso, pero el pasado no cambia
       nunca: lo conservo en vez de pisarlo, si no cada sync borraba la
       historia compartida */
    const previo = leerPerfil(usuario);
    if (previo?.diario?.length) {
        diario.push(...previo.diario.filter((f) => !bajados.has(f.visto.slice(0, 4))));
    }

    onPaso("vistas");
    const vistas = await traerVistas(usuario);

    onPaso("watchlist");
    const watchlist = (await traerWatchlist(usuario)).map((f, i) => ({ ...f, orden: i }));

    return guardarPerfil(
        usuario,
        verificarPerfil(usuario, { usuario, diario, vistas, watchlist, actualizado: new Date().toISOString() }),
    );
};

/* actualizacion liviana: en vez de rebajar 30 paginas, lee el rss (que
   trae las ultimas 50 funciones) y lo mezcla con lo que ya teniamos. la
   watchlist solo se rebaja si su primer item cambio.

   dos motivos: las paginas del diario dan 403 fuera de una conexion
   domestica, y aun donde funcionan, 2 pedidos son mas sanos que 30. */
export const actualizarPerfil = async (usuario, { onPaso = () => {} } = {}) => {
    const antes = leerPerfil(usuario);
    if (!antes) throw new Error(`no tengo el perfil de ${usuario}; bajalo entero primero`);

    onPaso("rss");
    const rss = await traerRssDiario(usuario);
    if (!rss.length) throw new Error("el rss vino vacio");

    /* la clave es el id de la funcion, unico por registro: sirve para no
       duplicar un rewatch de la misma pelicula */
    const porClave = new Map(antes.diario.filter((f) => f.clave).map((f) => [f.clave, f]));
    const porFechaTitulo = new Set(antes.diario.map((f) => `${f.visto}|${f.nombre}`));

    const nuevas = rss.filter((f) =>
        !(f.clave && porClave.has(f.clave)) && !porFechaTitulo.has(`${f.visto}|${f.nombre}`));

    /* el rss tambien corrige: si le cambiaste la nota a algo ya anotado */
    const diario = antes.diario.map((f) => {
        const r = f.clave ? rss.find((x) => x.clave === f.clave) : null;
        return r && r.rating !== f.rating ? { ...f, rating: r.rating } : f;
    });

    for (const f of nuevas) {
        diario.push({ nombre: f.nombre, anio: f.anio, visto: f.visto, rating: f.rating, rewatch: f.rewatch, clave: f.clave });
    }
    diario.sort((a, b) => b.visto.localeCompare(a.visto));

    /* lo que se vio por primera vez entra tambien al historial completo */
    const enVistas = new Set(antes.vistas.map((f) => clave(f.nombre, f.anio)));
    const vistas = [...antes.vistas];
    for (const f of nuevas) {
        const k = clave(f.nombre, f.anio);
        if (enVistas.has(k)) continue;
        enVistas.add(k);
        vistas.unshift({
            nombre: f.nombre, anio: f.anio,
            slug: f.slug ?? null, clave: f.slug ?? k,
            uri: f.slug ? `https://letterboxd.com/film/${f.slug}/` : null,
        });
    }

    onPaso("watchlist");
    let watchlist = antes.watchlist;
    let watchlistTocada = false;
    try {
        const primera = await primeraDeWatchlist(usuario);
        if (primera && primera !== antes.watchlist[0]?.slug) {
            onPaso("watchlist completa");
            watchlist = (await traerWatchlist(usuario)).map((f, i) => ({ ...f, orden: i }));
            watchlistTocada = true;
        }
    } catch (e) {
        /* que la watchlist falle no puede tirar abajo lo que ya conseguimos */
        onPaso(`watchlist fallo (${e.message})`);
    }

    const perfil = {
        ...antes,
        diario,
        vistas,
        watchlist,
        actualizado: new Date().toISOString(),
    };
    guardarPerfil(usuario, verificarPerfil(usuario, perfil));
    return { perfil, nuevas, watchlistTocada };
};

/* misma forma que devolvia cargarExport, para que nada aguas abajo cambie */
export const cargarUsuario = (usuario, { fechasWatchlist = {} } = {}) => {
    const p = leerPerfil(usuario);
    if (!p) throw new Error(`no tengo el perfil de ${usuario}. corre: npm run bajar ${usuario}`);

    const diario = [...p.diario].sort((a, b) => b.visto.localeCompare(a.visto));

    const enVistas = new Set(p.vistas.map((f) => clave(f.nombre, f.anio)));
    const vistasFilas = [
        ...p.vistas.map((f) => ({ nombre: f.nombre, anio: f.anio, agregada: null })),
        ...diario.filter((f) => !enVistas.has(clave(f.nombre, f.anio))).map((f) => ({ nombre: f.nombre, anio: f.anio, agregada: f.visto })),
    ];
    const vistas = new Set(vistasFilas.map((f) => clave(f.nombre, f.anio)));

    /* la pagina no publica cuando agregaste cada cosa: si tenemos la fecha
       de un export la usamos, y si no queda el orden (0 = la mas nueva) */
    const watchlist = p.watchlist
        .filter((f) => !vistas.has(clave(f.nombre, f.anio)))
        .map((f) => ({ ...f, agregada: fechasWatchlist[clave(f.nombre, f.anio)] ?? null }));

    return {
        diario, watchlist, vistas, vistasFilas,
        sincronizadas: 0,
        watchlistEnVivo: true,
        watchlistActualizada: p.actualizado,
        perfilActualizado: p.actualizado,
    };
};
