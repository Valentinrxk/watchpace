import { clave } from "./letterboxd.js";

/* lo de cada uno, no lo de los dos: el resumen del año y el material de
   los juegos que se juegan solo (¿cual te gusto mas? y ¿de que año es?) */

const MS_DIA = 86400000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const NOTAS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

let nombrePais = null;
try { nombrePais = new Intl.DisplayNames(["es"], { type: "region" }); } catch { /* sin intl queda el codigo */ }

const contar = (items) => {
    const n = new Map();
    for (const x of items) if (x != null) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]);
};

/* dias seguidos con al menos una. en utc a proposito: las fechas del
   diario no tienen hora y con la hora local un cambio de horario partia
   la racha */
const rachaMasLarga = (fechas) => {
    const dias = [...new Set(fechas)].sort().map((d) => Date.parse(d + "T00:00:00Z") / MS_DIA);
    let mejor = dias.length ? 1 : 0, corrida = 1;
    for (let i = 1; i < dias.length; i++) {
        corrida = dias[i] - dias[i - 1] === 1 ? corrida + 1 : 1;
        mejor = Math.max(mejor, corrida);
    }
    return mejor;
};

const resumenDelAnio = ({ diario, cache, personas, hoy }) => {
    const anio = hoy.getFullYear();
    const delAnio = diario
        .filter((f) => f.visto.startsWith(String(anio)))
        .map((f) => ({ ...f, m: cache[clave(f.nombre, f.anio)] ?? {} }));
    if (!delAnio.length) return null;

    const puntuadas = delAnio.filter((f) => f.rating);
    const minutos = delAnio.reduce((t, f) => t + (f.m.minutos ?? 0), 0);

    /* contra el año pasado a esta misma altura, no contra el año entero */
    const mismoDia = `${anio - 1}${hoy.toISOString().slice(4, 10)}`;
    const anioPasado = diario.filter((f) => f.visto.startsWith(String(anio - 1)) && f.visto <= mismoDia).length;

    const porMes = MESES.map((mes, i) => ({ mes, n: delAnio.filter((f) => Number(f.visto.slice(5, 7)) === i + 1).length }))
        .slice(0, hoy.getMonth() + 1);
    const [diaTop] = contar(delAnio.map((f) => new Date(f.visto + "T12:00:00").getDay()));

    const top = (pares, n = 3) => pares.slice(0, n).map(([nombre, cuantas]) => ({ nombre, cuantas }));
    const conDuracion = delAnio.filter((f) => f.m.minutos);
    const larga = conDuracion.sort((a, b) => b.m.minutos - a.m.minutos)[0];
    const vieja = [...delAnio].sort((a, b) => a.anio - b.anio)[0];
    const aFicha = (f) => ({ nombre: f.nombre, anio: f.anio, visto: f.visto, rating: f.rating ?? null, poster: f.m.poster ?? null });

    return {
        anio,
        vistas: delAnio.length,
        horas: Math.round(minutos / 60),
        anioPasado,
        promedio: puntuadas.length ? +(puntuadas.reduce((t, f) => t + f.rating, 0) / puntuadas.length).toFixed(2) : null,
        estrellas: NOTAS.map((nota) => ({ nota, n: puntuadas.filter((f) => f.rating === nota).length })),
        porMes,
        dia: diaTop ? { nombre: DIAS[diaTop[0]], cuantas: diaTop[1] } : null,
        racha: rachaMasLarga(delAnio.map((f) => f.visto)),
        rewatches: delAnio.filter((f) => f.rewatch).length,
        directores: top(contar(delAnio.map((f) => (f.m.directorId ? personas[f.m.directorId] ?? f.m.director : f.m.director) ?? null)).filter(([, n]) => n > 1)),
        generos: top(contar(delAnio.flatMap((f) => f.m.generos ?? []))),
        paises: top(contar(delAnio.map((f) => f.m.paises?.[0] ?? null)).map(([c, n]) => [nombrePais?.of(c) ?? c, n])),
        decadas: top(contar(delAnio.map((f) => `${Math.floor(f.anio / 10) * 10}s`))),
        larga: larga ? { ...aFicha(larga), minutos: larga.m.minutos } : null,
        vieja: vieja ? aFicha(vieja) : null,
        /* las mejores: las de nota mas alta, las mas recientes primero */
        mejores: [...puntuadas]
            .sort((a, b) => b.rating - a.rating || b.visto.localeCompare(a.visto))
            .filter((f, i, a) => a.findIndex((g) => g.nombre === f.nombre && g.anio === f.anio) === i)
            .slice(0, 8)
            .map(aFicha),
    };
};

/* una fila por pelicula, con la nota mas reciente que le puso */
const pelisDelDiario = ({ diario, cache, personas }) => {
    const vistas = new Map();
    for (const f of diario) {
        const k = clave(f.nombre, f.anio);
        const ya = vistas.get(k);
        if (ya) { if (ya.rating == null && f.rating) ya.rating = f.rating; continue; }
        const m = cache[k] ?? {};
        vistas.set(k, {
            nombre: f.nombre,
            anio: f.anio,
            rating: f.rating ?? null,
            poster: m.poster ?? null,
            director: (m.directorId ? personas[m.directorId] : null) ?? m.director ?? null,
        });
    }
    return [...vistas.values()];
};

export const armarSolo = ({ diario, cache, personas, hoy = new Date() }) => ({
    anio: resumenDelAnio({ diario, cache, personas, hoy }),
    pelis: pelisDelDiario({ diario, cache, personas }),
});
