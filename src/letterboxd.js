import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv.js";

const RUTA_INC = "cache/incremental.json";

const leer = (dir, archivo) => parseCsv(readFileSync(join(dir, archivo), "utf8"));

export const clave = (nombre, anio) => `${nombre}::${anio}`;

/* una entrada de diario es una VISTA, no una pelicula: la misma peli
   vista dos veces son dos entradas. por eso la clave lleva la fecha. */
export const claveEntrada = (f) => `${f.visto}|${clave(f.nombre, f.anio)}`;

export const leerIncremental = () => (existsSync(RUTA_INC) ? JSON.parse(readFileSync(RUTA_INC, "utf8")) : {});

export const guardarIncremental = (obj) => {
    mkdirSync("cache", { recursive: true });
    writeFileSync(RUTA_INC, JSON.stringify(obj, null, 1));
};

export const cargarExport = (dir) => {
    const delCsv = leer(dir, "diary.csv")
        .filter((r) => r["Watched Date"])
        .map((r) => ({
            nombre: r.Name,
            anio: Number(r.Year),
            visto: r["Watched Date"],
            rating: r.Rating ? Number(r.Rating) : null,
            rewatch: Boolean(r.Rewatch?.trim()),
        }));

    const yaEnCsv = new Set(delCsv.map(claveEntrada));
    const extra = Object.values(leerIncremental())
        .filter((f) => f.nombre && f.visto && !yaEnCsv.has(claveEntrada(f)))
        .map((f) => ({ nombre: f.nombre, anio: f.anio, visto: f.visto, rating: f.rating ?? null, rewatch: Boolean(f.rewatch) }));

    const diario = [...delCsv, ...extra].sort((a, b) => b.visto.localeCompare(a.visto));

    const vistasCsv = leer(dir, "watched.csv").map((r) => ({ nombre: r.Name, anio: Number(r.Year), agregada: r.Date }));
    const enVistas = new Set(vistasCsv.map((r) => clave(r.nombre, r.anio)));
    const vistasFilas = [
        ...vistasCsv,
        ...extra.filter((f) => !enVistas.has(clave(f.nombre, f.anio))).map((f) => ({ nombre: f.nombre, anio: f.anio, agregada: f.visto })),
    ];

    const vistas = new Set(vistasFilas.map((r) => clave(r.nombre, r.anio)));

    const watchlist = leer(dir, "watchlist.csv")
        .map((r) => ({
            nombre: r.Name,
            anio: Number(r.Year),
            agregada: r.Date,
            uri: r["Letterboxd URI"],
        }))
        .filter((f) => !vistas.has(clave(f.nombre, f.anio)));

    return { diario, watchlist, vistas, vistasFilas, sincronizadas: extra.length };
};
