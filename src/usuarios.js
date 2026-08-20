import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { enRaiz } from "./rutas.js";
import { clave } from "./letterboxd.js";
import { traerDiario, traerVistas, traerWatchlist } from "./perfil.js";
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

/* trae todo el perfil publico. anios: cuantos anios de diario bajar hacia
   atras (el diario se pagina por anio). el resto sale de /films/. */
export const bajarPerfil = async (usuario, { anios = 1, onPaso = () => {} } = {}) => {
    const hoy = new Date();
    const diario = [];
    for (let i = 0; i < anios; i++) {
        const a = hoy.getFullYear() - i;
        onPaso(`diario ${a}`);
        diario.push(...(await traerDiario(usuario, a)));
    }

    onPaso("vistas");
    const vistas = await traerVistas(usuario);

    onPaso("watchlist");
    const watchlist = (await traerWatchlist(usuario)).map((f, i) => ({ ...f, orden: i }));

    return guardarPerfil(usuario, { usuario, diario, vistas, watchlist, actualizado: new Date().toISOString() });
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
