import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv.js";

const leer = (dir, archivo) => parseCsv(readFileSync(join(dir, archivo), "utf8"));

export const clave = (nombre, anio) => `${nombre}::${anio}`;

export const cargarExport = (dir) => {
    const diario = leer(dir, "diary.csv")
        .filter((r) => r["Watched Date"])
        .map((r) => ({
            nombre: r.Name,
            anio: Number(r.Year),
            visto: r["Watched Date"],
            rating: r.Rating ? Number(r.Rating) : null,
            rewatch: Boolean(r.Rewatch?.trim()),
        }))
        .sort((a, b) => b.visto.localeCompare(a.visto));

    const vistasFilas = leer(dir, "watched.csv").map((r) => ({ nombre: r.Name, anio: Number(r.Year), agregada: r.Date }));
    const vistas = new Set(vistasFilas.map((r) => clave(r.nombre, r.anio)));

    const watchlist = leer(dir, "watchlist.csv")
        .map((r) => ({
            nombre: r.Name,
            anio: Number(r.Year),
            agregada: r.Date,
            uri: r["Letterboxd URI"],
        }))
        .filter((f) => !vistas.has(clave(f.nombre, f.anio)));

    return { diario, watchlist, vistas, vistasFilas };
};
