import { mkdirSync, writeFileSync } from "node:fs";
import { clave, claveEntrada, leerIncremental, guardarIncremental } from "./letterboxd.js";
import { detalle, nombreLatino } from "./tmdb.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { leerEstado, guardarEstado } from "./api.js";
import { CONFIG } from "./config.js";

const RUTA_FILMS = "cache/films.json";
const RUTA_PERSONAS = "cache/personas.json";

const guardarJson = (ruta, obj) => {
    mkdirSync("cache", { recursive: true });
    writeFileSync(ruta, JSON.stringify(obj, null, 1));
};

/* el rss escapa entidades, y a veces las escapa dos veces:
   "Bram Stoker&#039;s Dracula" no matchea con el csv si no se decodifica */
const desescapar = (t) => {
    let s = String(t ?? "");
    for (let i = 0; i < 2 && /&[#\w]+;/.test(s); i++) {
        s = s
            .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
            .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
    }
    return s;
};

const campo = (xml, tag) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? desescapar(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")).trim() : null;
};

const parsearRss = (xml) =>
    xml.split("<item>").slice(1)
        .map((trozo) => trozo.split("</item>")[0])
        .map((it) => ({
            nombre: campo(it, "letterboxd:filmTitle"),
            anio: Number(campo(it, "letterboxd:filmYear")),
            visto: campo(it, "letterboxd:watchedDate"),
            rating: campo(it, "letterboxd:memberRating") ? Number(campo(it, "letterboxd:memberRating")) : null,
            rewatch: campo(it, "letterboxd:rewatch") === "Yes",
            tmdb: campo(it, "tmdb:movieId") ? Number(campo(it, "tmdb:movieId")) : null,
            uri: campo(it, "link"),
        }))
        .filter((f) => f.nombre && f.visto && Number.isFinite(f.anio));

export const sincronizar = async ({ yaConocidas = new Set() } = {}) => {
    const estado = leerEstado();

    let xml;
    try {
        const r = await fetch(`https://letterboxd.com/${CONFIG.usuario}/rss/`, {
            headers: { "user-agent": "watchpace/0.1 (personal use)" },
        });
        if (!r.ok) throw new Error(`letterboxd respondio ${r.status}`);
        xml = await r.text();
    } catch (e) {
        guardarEstado({ ...estado, ultimoIntento: new Date().toISOString(), ultimoError: e.message });
        return { ok: false, error: e.message, nuevas: [] };
    }

    const entradas = parsearRss(xml);
    const inc = leerIncremental();
    const nuevas = entradas.filter((f) => !yaConocidas.has(claveEntrada(f)) && !inc[claveEntrada(f)]);

    for (const f of nuevas) inc[claveEntrada(f)] = f;
    if (nuevas.length) guardarIncremental(inc);

    const films = leerCache();
    const personas = leerPersonas();
    const aEnriquecer = nuevas.filter((f) => f.tmdb && !films[clave(f.nombre, f.anio)]?.tmdb);

    for (const f of aEnriquecer) {
        try {
            films[clave(f.nombre, f.anio)] = { ...(await detalle(f.tmdb, CONFIG.region.toUpperCase())), actualizado: new Date().toISOString() };
        } catch {
            films[clave(f.nombre, f.anio)] = { error: "no pude traer los datos" };
        }
    }
    if (aEnriquecer.length) {
        const faltan = new Map();
        for (const f of aEnriquecer) {
            const m = films[clave(f.nombre, f.anio)];
            if (m?.directorId && m.director && !personas[m.directorId]) faltan.set(m.directorId, m.director);
            (m?.repartoIds ?? []).forEach((id, i) => {
                if (id && m.reparto?.[i] && !personas[id]) faltan.set(id, m.reparto[i]);
            });
        }
        for (const [id, nom] of faltan) personas[id] = await nombreLatino(id, nom);

        guardarJson(RUTA_FILMS, films);
        if (faltan.size) guardarJson(RUTA_PERSONAS, personas);
    }

    const cumplido = nuevas.find((f) => estado.plan && f.nombre === estado.plan.nombre);
    guardarEstado({
        ...estado,
        ultimaSync: new Date().toISOString(),
        ultimoIntento: new Date().toISOString(),
        ultimoError: null,
        plan: cumplido ? null : estado.plan,
        historial: [
            ...(estado.historial ?? []).slice(-49),
            ...(cumplido ? [{ fecha: cumplido.visto, tipo: "cumplido", pelicula: cumplido.nombre }] : []),
        ],
    });

    return { ok: true, nuevas, cumplido: cumplido?.nombre ?? null, enriquecidas: aEnriquecer.length };
};
