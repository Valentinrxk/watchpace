/* lee un perfil publico de letterboxd sin export: diario con fechas y
   notas, historial completo de vistas, y watchlist. */

const UA = { headers: { "user-agent": "watchpace/0.1 (personal use)" } };
const PAUSA = 1200;
const REINTENTOS = 3;

const dormir = (ms) => new Promise((s) => setTimeout(s, ms));

const desescapar = (t) => {
    let s = String(t ?? "");
    for (let i = 0; i < 2 && /&[#\w]+;/.test(s); i++) {
        s = s
            .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
            .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    }
    return s;
};

const partirTitulo = (display) => {
    const t = desescapar(display).trim();
    const m = t.match(/^(.*)\s+\((\d{4})\)$/);
    return m ? { nombre: m[1].trim(), anio: Number(m[2]) } : null;
};

/* cloudflare desafia al azar cuando ve volumen. casi siempre el
   reintento pasa, asi que conviene esperar antes de rendirse */
const traer = async (url) => {
    let ultimo = 0;
    for (let i = 0; i < REINTENTOS; i++) {
        const r = await fetch(url, UA);
        if (r.status === 404) return null;
        if (r.ok) {
            const html = await r.text();
            /* el desafio de cloudflare a veces viene con 200: si eso pasa
               el parser no encuentra nada, y un perfil "vacio" se guarda
               y se publica como si fuera la verdad */
            if (esDesafio(html)) {
                ultimo = 403;
                await dormir(2500 * (i + 1));
                continue;
            }
            return html;
        }
        ultimo = r.status;
        if (r.status !== 403 && r.status !== 429) break;
        await dormir(2500 * (i + 1));
    }
    throw new Error(`${url} -> http ${ultimo}`);
};

const esDesafio = (html) =>
    html.length < 12000 &&
    /Just a moment|__cf_chl|cf-browser-verification|Attention Required|Enable JavaScript and cookies/i.test(html);

/* recorre paginas hasta que una no aporte nada nuevo */
const paginar = async (armarUrl, extraer, { max = 40 } = {}) => {
    const items = [];
    const vistos = new Set();
    for (let p = 1; p <= max; p++) {
        const html = await traer(armarUrl(p));
        if (!html) break;
        const nuevos = extraer(html).filter((f) => f && !vistos.has(f.clave));
        if (!nuevos.length) break;
        for (const f of nuevos) {
            vistos.add(f.clave);
            items.push(f);
        }
        await dormir(PAUSA);
    }
    return items;
};

const porGrid = (html) =>
    [...html.matchAll(/data-item-slug="([^"]+)"[\s\S]{0,400}?data-item-full-display-name="([^"]+)"/g)]
        .map(([, slug, display]) => {
            const t = partirTitulo(display);
            return t && { ...t, slug, clave: slug, uri: `https://letterboxd.com/film/${slug}/` };
        });

/* una fila de diario trae fecha, nota y si fue rewatch.
   data-viewing-id aparece dos veces por fila: filtramos por el nombre. */
const porDiario = (html) =>
    html.split("data-viewing-id=").slice(1)
        .map((f) => f.split("</tr>")[0])
        .filter((f) => /data-item-name="/.test(f))
        .map((f) => {
            const t = partirTitulo(f.match(/data-item-name="([^"]+)"/)?.[1] ?? "");
            const d = f.match(/daydate"\s+href="\/[^/]+\/diary\/films\/for\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (!t || !d) return null;

            const nota = f.match(/rated-(\d+)/)?.[1];
            const celdaRewatch = f.match(/<td class="col-rewatch[^"]*"/)?.[0] ?? "";
            const id = f.match(/^"?(\d+)/)?.[1];

            return {
                ...t,
                visto: `${d[1]}-${d[2]}-${d[3]}`,
                rating: nota ? Number(nota) / 2 : null,
                rewatch: !/icon-status-off/.test(celdaRewatch),
                clave: id ?? `${d[1]}${d[2]}${d[3]}-${t.nombre}`,
            };
        });

export const traerDiario = (usuario, anio) =>
    paginar(
        (p) => p === 1
            ? `https://letterboxd.com/${usuario}/films/diary/for/${anio}/`
            : `https://letterboxd.com/${usuario}/films/diary/for/${anio}/page/${p}/`,
        porDiario,
    );

export const traerVistas = (usuario) =>
    paginar(
        (p) => p === 1
            ? `https://letterboxd.com/${usuario}/films/`
            : `https://letterboxd.com/${usuario}/films/page/${p}/`,
        porGrid,
    );

export const traerWatchlist = (usuario) =>
    paginar(
        (p) => p === 1
            ? `https://letterboxd.com/${usuario}/watchlist/`
            : `https://letterboxd.com/${usuario}/watchlist/page/${p}/`,
        porGrid,
    );

/* el rss trae las ultimas 50 funciones con fecha, nota, rewatch y hasta
   el id de tmdb — o sea todo lo que da el diario. y, a diferencia del
   diario, responde desde cualquier IP: las paginas /films/diary/ estan
   detras del desafio de cloudflare cuando el pedido no viene de una
   conexion domestica. */
export const traerRssDiario = async (usuario) => {
    const xml = await traer(`https://letterboxd.com/${usuario}/rss/`);
    if (!xml) return [];

    const uno = (bloque, etiqueta) =>
        bloque.match(new RegExp(`<${etiqueta}>([^<]*)</${etiqueta}>`))?.[1] ?? null;

    const entradas = [];
    for (const bloque of xml.split("<item>").slice(1)) {
        const visto = uno(bloque, "letterboxd:watchedDate");
        /* sin fecha no es una funcion: es una lista o una resena suelta */
        if (!visto) continue;

        const nombre = desescapar(uno(bloque, "letterboxd:filmTitle") ?? "").trim();
        const anio = Number(uno(bloque, "letterboxd:filmYear"));
        if (!nombre || !anio) continue;

        const nota = uno(bloque, "letterboxd:memberRating");
        /* el prefijo cambia (watch/review) pero el numero es el mismo id
           de funcion que usa el scraper */
        const guid = bloque.match(/<guid[^>]*>letterboxd-\w+-(\d+)</)?.[1] ?? null;
        const slug = bloque.match(/<link>https:\/\/letterboxd\.com\/[^/]+\/film\/([^/]+)\//)?.[1] ?? null;

        entradas.push({
            nombre,
            anio,
            visto,
            rating: nota == null || nota === "" ? null : Number(nota),
            rewatch: /<letterboxd:rewatch>Yes</i.test(bloque),
            clave: guid,
            slug,
        });
    }
    return entradas;
};

/* la primera pagina de la watchlist viene ordenada por fecha de agregado,
   asi que su primer item alcanza para saber si cambio algo */
export const primeraDeWatchlist = async (usuario) => {
    const html = await traer(`https://letterboxd.com/${usuario}/watchlist/`);
    return html?.match(/data-item-slug="([^"]+)"/)?.[1] ?? null;
};

export const existePerfil = async (usuario) => Boolean(await traer(`https://letterboxd.com/${usuario}/`));

/* dos pedidos para saber si vale la pena bajar las 30 paginas:
   el rss dice si viste algo nuevo, y la primera pagina de watchlist
   dice si agregaste algo (viene ordenada por fecha de agregado) */
export const huellaBarata = async (usuario) => {
    const rss = await traer(`https://letterboxd.com/${usuario}/rss/`);
    const ultimaVista = rss?.match(/<letterboxd:watchedDate>([^<]+)/)?.[1] ?? null;
    /* la fecha sola no alcanza: dos pelis el mismo dia comparten fecha.
       el titulo del item mas nuevo si cambia con cada registro */
    const ultimaPeli = desescapar(rss?.match(/<letterboxd:filmTitle>([^<]+)/)?.[1] ?? "") || null;

    await dormir(PAUSA);
    const wl = await traer(`https://letterboxd.com/${usuario}/watchlist/`);
    const primera = wl?.match(/data-item-slug="([^"]+)"/)?.[1] ?? null;

    return { ultimaVista, ultimaPeli, primeraWatchlist: primera };
};
