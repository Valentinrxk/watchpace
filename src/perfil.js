/* lee un perfil publico de letterboxd sin export: diario con fechas y
   notas, historial completo de vistas, y watchlist. */

const UA = { headers: { "user-agent": "watchpace/0.1 (personal use)" } };
const PAUSA = 600;

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

const traer = async (url) => {
    const r = await fetch(url, UA);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${url} -> http ${r.status}`);
    return r.text();
};

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

export const existePerfil = async (usuario) => Boolean(await traer(`https://letterboxd.com/${usuario}/`));
