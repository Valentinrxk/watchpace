import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cargarExport, clave } from "./letterboxd.js";
import { buscar, detalle, nombreLatino } from "./tmdb.js";
import { CONFIG } from "./config.js";
import { enRaiz } from "./rutas.js";

const RUTA = enRaiz("cache/films.json");
const CONCURRENCIA = 8;

export const leerCache = () => (existsSync(RUTA) ? JSON.parse(readFileSync(RUTA, "utf8")) : {});

const guardar = (cache) => {
    mkdirSync(enRaiz("cache"), { recursive: true });
    writeFileSync(RUTA, JSON.stringify(cache, null, 1));
};

const enriquecer = async (f, cache) => {
    const k = clave(f.nombre, f.anio);
    try {
        const id = await buscar(f);
        cache[k] = id
            ? { ...(await detalle(id, CONFIG.region.toUpperCase())), actualizado: new Date().toISOString() }
            : { sinMatch: true };
    } catch (e) {
        cache[k] = { error: e.message };
    }
};

const correr = async () => {
    const { diario, watchlist, vistasFilas } = cargarExport(CONFIG.dirDatos);

    const universo = new Map();
    for (const f of [...watchlist, ...diario, ...vistasFilas]) universo.set(clave(f.nombre, f.anio), f);

    const cache = leerCache();
    const viejo = (k) => cache[k]?.tmdb && cache[k].repartoIds === undefined;
    const faltan = [...universo.entries()].filter(([k]) => !cache[k] || viejo(k)).map(([, f]) => f);

    console.log(`universo ${universo.size} (watchlist ${watchlist.length} + diario + vistas ${vistasFilas.length}) · en cache ${universo.size - faltan.length} · a resolver ${faltan.length}`);
    if (!faltan.length) return resolverNombres(cache);

    for (let i = 0; i < faltan.length; i += CONCURRENCIA) {
        await Promise.all(faltan.slice(i, i + CONCURRENCIA).map((f) => enriquecer(f, cache)));
        const hechas = Math.min(faltan.length, i + CONCURRENCIA);
        process.stdout.write(`\r  ${hechas}/${faltan.length}`);
        if (hechas % 40 === 0) guardar(cache);
    }
    guardar(cache);
    await resolverNombres(cache);

    const vals = Object.values(cache);
    console.log(`\n\nresueltas ${vals.filter((v) => v.tmdb).length} · sin match ${vals.filter((v) => v.sinMatch).length} · errores ${vals.filter((v) => v.error).length}`);
};

const RUTA_PERSONAS = enRaiz("cache/personas.json");

export const leerPersonas = () => (existsSync(RUTA_PERSONAS) ? JSON.parse(readFileSync(RUTA_PERSONAS, "utf8")) : {});

const resolverNombres = async (cache) => {
    const personas = leerPersonas();
    const pendientes = new Map();
    for (const v of Object.values(cache)) {
        if (v.directorId && v.director && !personas[v.directorId]) pendientes.set(v.directorId, v.director);
        (v.repartoIds ?? []).forEach((id, i) => {
            const nom = v.reparto?.[i];
            if (id && nom && !personas[id]) pendientes.set(id, nom);
        });
    }
    if (!pendientes.size) return personas;

    console.log(`

resolviendo ${pendientes.size} nombres de persona...`);
    const entradas = [...pendientes.entries()];
    for (let i = 0; i < entradas.length; i += CONCURRENCIA) {
        await Promise.all(entradas.slice(i, i + CONCURRENCIA).map(async ([id, nom]) => {
            personas[id] = await nombreLatino(id, nom);
        }));
        process.stdout.write(`
  ${Math.min(entradas.length, i + CONCURRENCIA)}/${entradas.length}`);
    }
    writeFileSync(RUTA_PERSONAS, JSON.stringify(personas, null, 1));
    const cambiados = Object.entries(personas).filter(([id, n]) => n !== pendientes.get(Number(id)) && pendientes.has(Number(id)));
    console.log(`
  romanizados: ${cambiados.length}`);
    return personas;
};

if (process.argv[1]?.endsWith("enrich.js")) correr();
