import { mkdirSync, writeFileSync } from "node:fs";
import { clave, claveEntrada, leerIncremental, guardarIncremental, leerWatchlistLive, RUTA_WATCHLIST } from "./letterboxd.js";
import { detalle, nombreLatino } from "./tmdb.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { leerEstado, guardarEstado } from "./api.js";
import { CONFIG } from "./config.js";
import { enRaiz } from "./rutas.js";

const RUTA_FILMS = enRaiz("cache/films.json");
const RUTA_PERSONAS = enRaiz("cache/personas.json");

const guardarJson = (ruta, obj) => {
    mkdirSync(enRaiz("cache"), { recursive: true });
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

/* ─── watchlist: no esta en el rss, hay que ir a la pagina ───
   el grid trae data-item-full-display-name="Nombre (Año)" y viene
   ordenado por fecha de agregado, mas nuevo primero. 28 por pagina. */

const parsearWatchlist = (html) =>
    [...html.matchAll(/data-item-slug="([^"]+)"[\s\S]{0,400}?data-item-full-display-name="([^"]+)"/g)]
        .map(([, slug, display]) => {
            const t = desescapar(display).trim();
            const m = t.match(/^(.*)\s+\((\d{4})\)$/);
            return m ? { nombre: m[1].trim(), anio: Number(m[2]), slug, uri: `https://letterboxd.com/film/${slug}/` } : null;
        })
        .filter(Boolean);

export const traerWatchlist = async ({ maxPaginas = 20 } = {}) => {
    const items = [];
    const vistos = new Set();

    for (let p = 1; p <= maxPaginas; p++) {
        const url = p === 1
            ? `https://letterboxd.com/${CONFIG.usuario}/watchlist/`
            : `https://letterboxd.com/${CONFIG.usuario}/watchlist/page/${p}/`;

        const r = await fetch(url, { headers: { "user-agent": "watchpace/0.1 (personal use)" } });
        if (!r.ok) throw new Error(`watchlist pagina ${p}: http ${r.status}`);

        const pagina = parsearWatchlist(await r.text());
        const nuevos = pagina.filter((f) => !vistos.has(f.slug));
        if (!nuevos.length) break;

        for (const f of nuevos) {
            vistos.add(f.slug);
            items.push(f);
        }
        await new Promise((s) => setTimeout(s, 700));
    }
    return items;
};

export const sincronizarWatchlist = async ({ fechasConocidas = new Map() } = {}) => {
    const estado = leerEstado();
    let items;
    try {
        items = await traerWatchlist();
    } catch (e) {
        guardarEstado({ ...estado, ultimoIntentoWatchlist: new Date().toISOString(), ultimoErrorWatchlist: e.message });
        return { ok: false, error: e.message, agregadas: [], sacadas: [] };
    }
    if (!items.length) return { ok: false, error: "la watchlist vino vacia, no la piso", agregadas: [], sacadas: [] };

    const previa = leerWatchlistLive();
    const antes = new Map((previa.items ?? []).map((f) => [clave(f.nombre, f.anio), f]));
    const hoy = new Date().toISOString().slice(0, 10);

    /* la pagina no publica la fecha de agregado: la del csv manda, y a lo
       nuevo se le pone la fecha en que lo vimos aparecer por primera vez */
    const fusionados = items.map((f) => {
        const k = clave(f.nombre, f.anio);
        return { ...f, agregada: antes.get(k)?.agregada ?? fechasConocidas.get(k) ?? hoy };
    });

    const ahora = new Set(fusionados.map((f) => clave(f.nombre, f.anio)));
    const agregadas = fusionados.filter((f) => antes.size && !antes.has(clave(f.nombre, f.anio)));
    const sacadas = [...antes.values()].filter((f) => !ahora.has(clave(f.nombre, f.anio)));

    guardarJson(RUTA_WATCHLIST, { items: fusionados, actualizada: new Date().toISOString() });
    guardarEstado({
        ...estado,
        ultimaSyncWatchlist: new Date().toISOString(),
        ultimoIntentoWatchlist: new Date().toISOString(),
        ultimoErrorWatchlist: null,
    });

    return { ok: true, total: fusionados.length, agregadas, sacadas, primera: !antes.size };
};
