import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cargarExport, clave } from "./letterboxd.js";
import { calcularRitmo, ritmoPorDia } from "./pace.js";
import { prerankear, rankearFinal } from "./rank.js";
import { generarRetos } from "./retos.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { clasificar } from "./fmt.js";
import { CONFIG } from "./config.js";
import { enRaiz } from "./rutas.js";

const RUTA = enRaiz("cache/estado.json");
const VACIO = { rechazadas: {}, plan: null, retosPasados: [], retoActivo: null, snoozeHasta: null, mirando: null };

export const leerEstado = () => (existsSync(RUTA) ? { ...VACIO, ...JSON.parse(readFileSync(RUTA, "utf8")) } : { ...VACIO });

export const guardarEstado = (e) => {
    mkdirSync(enRaiz("cache"), { recursive: true });
    writeFileSync(RUTA, JSON.stringify(e, null, 1));
    return e;
};

let PERSONAS = leerPersonas();

const hoyISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const aFilm = (f) => {
    const c = clasificar(f);
    const t = f.tmdb ?? f.m ?? {};
    return {
        nombre: f.nombre,
        anio: f.anio,
        agregada: f.agregada,
        diasEnLista: f.diasEnLista,
        minutos: t.minutos ?? null,
        generos: t.generos ?? [],
        director: PERSONAS[t.directorId] ?? t.director ?? null,
        directorId: t.directorId ?? null,
        poster: t.poster ?? null,
        backdrop: t.backdrop ?? null,
        sinopsis: t.sinopsis ?? null,
        tagline: t.tagline ?? null,
        puntaje: t.puntaje ?? null,
        votos: t.votos ?? 0,
        reparto: (t.reparto ?? []).map((n, i) => ({ nombre: PERSONAS[t.repartoIds?.[i]] ?? n, id: t.repartoIds?.[i] ?? null })),
        uri: f.uri,
        donde: c.sub.length ? c.sub : c.gratis.length ? c.gratis : [],
        dondeTipo: c.sub.length ? "sub" : c.gratis.length ? "gratis" : c.addon.length ? "addon" : c.alquiler.length ? "alquiler" : "ninguno",
        addon: c.addon,
    };
};

export const construirPayload = ({ minutos = null, estado: estadoDado = null } = {}) => {
    const hoy = new Date();
    const { diario, watchlist, vistasFilas, sincronizadas, watchlistEnVivo, watchlistActualizada } = cargarExport(CONFIG.dirDatos);
    const cache = leerCache();
    /* cuando se sincronizo el dato es un hecho del deploy, no del usuario:
       en serverless el estado viene del navegador y no lo sabria */
    const enDisco = leerEstado();
    const estado = estadoDado ? { ...VACIO, ...estadoDado } : enDisco;
    PERSONAS = leerPersonas();

    const ritmo = calcularRitmo({ diario, meta: CONFIG.meta, contarRewatches: CONFIG.contarRewatches, hoy });
    const conDatos = watchlist.map((f) => ({ ...f, tmdb: cache[clave(f.nombre, f.anio)] ?? null }));

    const pre = prerankear({ watchlist: conDatos, hoy, rechazadas: estado.rechazadas });
    const cabe = (f) => {
        const d = f.tmdb?.minutos;
        return !minutos || d == null || d <= minutos;
    };
    const pool = minutos && pre.filter(cabe).length >= 8 ? pre.filter(cabe) : pre;
    const orden = rankearFinal({ candidatas: pool.slice(0, 40), minutosDisponibles: minutos });

    const retos = generarRetos({ diario, watchlist, vistasFilas, cache, personas: PERSONAS, ritmo, hoy })
        .filter((r) => !estado.retosPasados.includes(r.id))
        .map((r) => ({ ...r, candidatas: r.candidatas.map((c) => aFilm({ ...c, tmdb: c.m })) }));

    const dormido = estado.snoozeHasta && estado.snoozeHasta >= hoyISO(hoy);
    const planDeHoy = estado.plan?.fecha === hoyISO(hoy) ? estado.plan : null;

    const iMirando = estado.mirando ? orden.findIndex((f) => f.nombre === estado.mirando) : -1;
    const elegida = iMirando >= 0 ? orden[iMirando] : orden[0];
    const resto = orden.filter((_, i) => i !== (iMirando >= 0 ? iMirando : 0));

    return {
        usuario: CONFIG.usuario,
        ritmo: {
            ...ritmo,
            fechaMeta: ritmo.fechaMeta ? hoyISO(ritmo.fechaMeta) : null,
            porDia: ritmoPorDia(diario, ritmo.anio),
            pendientes: watchlist.length,
        },
        dormido,
        plan: planDeHoy,
        sugerencia: aFilm(elegida),
        elegidaAMano: iMirando >= 0,
        alternativas: resto.slice(0, 6).map(aFilm),
        retos,
        retoActivo: estado.retoActivo,
        sync: {
            ultima: enDisco.ultimaSync ?? estado.ultimaSync ?? null,
            ultimoIntento: enDisco.ultimoIntento ?? null,
            error: enDisco.ultimoError ?? null,
            nuevasDesdeExport: sincronizadas,
            watchlist: watchlistActualizada,
            watchlistEnVivo,
        },
        historial: (estado.historial ?? []).slice(-5).reverse(),
        ultimas: diario.slice(0, 5).map((f) => ({ nombre: f.nombre, anio: f.anio, visto: f.visto, rating: f.rating })),
    };
};

const slugLetterboxd = (nombre) => {
    const s = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (!/^[a-z0-9 .'-]+$/.test(s)) return null;
    return s.replace(/['.]/g, "").replace(/\s+/g, "-");
};

const fuentes = () => {
    const { diario, watchlist, vistasFilas } = cargarExport(CONFIG.dirDatos);
    const cache = leerCache();
    PERSONAS = leerPersonas();
    return {
        diario, watchlist, vistasFilas, cache,
        meta: (f) => cache[clave(f.nombre, f.anio)],
        enDiario: new Map(diario.map((f) => [clave(f.nombre, f.anio), f])),
        enWatchlist: new Map(watchlist.map((f) => [clave(f.nombre, f.anio), f])),
        yaVista: new Set(vistasFilas.map((f) => clave(f.nombre, f.anio))),
    };
};

export const porPersona = (id) => {
    const pid = Number(id);
    const { watchlist, vistasFilas, meta, enDiario } = fuentes();

    const rolDe = (m) => (m?.directorId === pid ? "dirige" : (m?.repartoIds ?? []).includes(pid) ? "actúa" : null);
    const nombreDe = () => {
        for (const f of [...watchlist, ...vistasFilas]) {
            const m = meta(f);
            if (m?.directorId === pid) return PERSONAS[pid] ?? m.director;
            const i = (m?.repartoIds ?? []).indexOf(pid);
            if (i >= 0) return PERSONAS[pid] ?? m.reparto?.[i];
        }
        return PERSONAS[pid] ?? null;
    };

    const pendientes = watchlist
        .filter((f) => rolDe(meta(f)))
        .map((f) => ({ ...aFilm({ ...f, tmdb: meta(f) }), rol: rolDe(meta(f)) }))
        .sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0));

    const vistas = vistasFilas
        .filter((f) => rolDe(meta(f)))
        .map((f) => {
            const d = enDiario.get(clave(f.nombre, f.anio));
            const m = meta(f);
            return {
                nombre: f.nombre, anio: f.anio, rol: rolDe(m),
                visto: d?.visto ?? null, miRating: d?.rating ?? null, puntaje: m?.puntaje ?? null,
            };
        })
        .sort((a, b) => (b.visto ?? "0").localeCompare(a.visto ?? "0") || b.anio - a.anio);

    const nombre = nombreDe() ?? "sin nombre";
    const slug = slugLetterboxd(nombre);
    return {
        tipo: "persona", id: pid, nombre, pendientes, vistas,
        letterboxd: slug ? `https://letterboxd.com/director/${slug}/` : `https://letterboxd.com/search/${encodeURIComponent(nombre)}/`,
        slugExacto: Boolean(slug),
    };
};

export const porPelicula = (nombre, anio) => {
    const k = clave(nombre, Number(anio));
    const { cache, enDiario, enWatchlist, yaVista } = fuentes();
    const m = cache[k];
    const wl = enWatchlist.get(k);
    const d = enDiario.get(k);

    return {
        tipo: "pelicula",
        ...aFilm({ nombre, anio: Number(anio), uri: wl?.uri ?? null, agregada: wl?.agregada ?? null, tmdb: m }),
        directorNombre: PERSONAS[m?.directorId] ?? m?.director ?? null,
        enWatchlist: Boolean(wl),
        vista: yaVista.has(k),
        visto: d?.visto ?? null,
        miRating: d?.rating ?? null,
        resuelta: Boolean(m?.tmdb),
    };
};

/* puro: (estado, accion) -> estado nuevo. el server local lo persiste en
   disco; en serverless el estado viaja con el request y vuelve al cliente. */
export const reducir = (previo, { accion, nombre, retoId }) => {
    const estado = { ...VACIO, ...previo };
    const ahora = new Date().toISOString();

    if (accion === "otra" && nombre) { estado.rechazadas = { ...estado.rechazadas, [nombre]: ahora }; estado.mirando = null; }
    if (accion === "elegir" && nombre) estado.mirando = nombre;
    if (accion === "acepto" && nombre) { estado.plan = { nombre, fecha: hoyISO() }; estado.mirando = null; }
    if (accion === "cancelar-plan") estado.plan = null;
    if (accion === "hoy-no") { estado.snoozeHasta = hoyISO(); estado.mirando = null; }
    if (accion === "despertar") estado.snoozeHasta = null;
    if (accion === "reto-paso" && retoId) estado.retosPasados = [...new Set([...estado.retosPasados, retoId])];
    if (accion === "reto-acepto") estado.retoActivo = retoId ?? null;
    if (accion === "limpiar") return { ...VACIO, ultimaSync: previo?.ultimaSync ?? null, ultimaSyncWatchlist: previo?.ultimaSyncWatchlist ?? null };

    return estado;
};

export const aplicarAccion = (args) => guardarEstado(reducir(leerEstado(), args));
