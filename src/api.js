import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { clave } from "./letterboxd.js";
import { calcularRitmo, ritmoPorDia } from "./pace.js";
import { prerankear, rankearFinal } from "./rank.js";
import { generarRetos } from "./retos.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { clasificar } from "./fmt.js";
import { CONFIG } from "./config.js";
import { cargarUsuario, configDe, leerPerfil } from "./usuarios.js";
import { enRaiz } from "./rutas.js";
import { armarJuntos, ES_JUNTOS } from "./juntos.js";

const RUTA = enRaiz("cache/estado.json");
const VACIO = { rechazadas: {}, plan: null, retosPasados: [], retosActivos: {}, retoActivo: null, snoozeHasta: null, mirando: null, historial: [], modo: "comun", ronda: 0 };

export const leerEstado = () => (existsSync(RUTA) ? { ...VACIO, ...JSON.parse(readFileSync(RUTA, "utf8")) } : { ...VACIO });

export const guardarEstado = (e) => {
    mkdirSync(enRaiz("cache"), { recursive: true });
    writeFileSync(RUTA, JSON.stringify(e, null, 1));
    return e;
};

let PERSONAS = leerPersonas();

const fechasCache = {};
const fechasDe = (usuario) => {
    if (fechasCache[usuario]) return fechasCache[usuario];
    try {
        fechasCache[usuario] = JSON.parse(readFileSync(enRaiz("usuarios", usuario, "fechas-watchlist.json"), "utf8"));
    } catch {
        fechasCache[usuario] = {};
    }
    return fechasCache[usuario];
};

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

const MODOS = [
    { id: "comun", texto: "en común" },
    { id: "duelo", texto: "uno y uno" },
    { id: "debo", texto: "te la debo" },
    { id: "revancha", texto: "revancha" },
    { id: "ruleta", texto: "la ruleta" },
    { id: "nuestro", texto: "lo nuestro" },
];

export const construirJuntos = ({ estado: estadoDado = null } = {}) => {
    const hoy = new Date();
    const estado = estadoDado ? { ...VACIO, ...estadoDado } : leerEstado();
    PERSONAS = leerPersonas();

    const modo = MODOS.some((m) => m.id === estado.modo) ? estado.modo : "comun";
    const j = armarJuntos({ modo, ronda: estado.ronda ?? 0, rechazadas: estado.rechazadas, hoy });

    const conMarca = (f, extra = {}) => ({ ...aFilm({ ...f, tmdb: f.m }), ...extra });

    return {
        tipo: "juntos",
        usuario: ES_JUNTOS,
        nombre: "juntos",
        usuarios: [...CONFIG.usuarios.map((u) => ({ usuario: u.usuario, nombre: u.nombre })), { usuario: ES_JUNTOS, nombre: "juntos" }],
        modos: MODOS.map((m) => ({ ...m, cuantas: j.totales[m.id] ?? j.totales.duelo })),
        modo,
        ronda: estado.ronda ?? 0,
        ritmos: j.ritmos,
        juntas: {
            ...j.juntas,
            vida: j.juntas.vida && {
                ...j.juntas.vida,
                primera: conMarca(j.juntas.vida.primera, { notas: j.juntas.vida.primera.notas, visto: j.juntas.vida.primera.visto }),
                amadas: j.juntas.vida.amadas.map((f) => conMarca(f, { notas: f.notas, visto: f.visto })),
                ultimas: j.juntas.vida.ultimas.map((f) => ({ nombre: f.nombre, anio: f.anio, visto: f.visto, notas: f.notas })),
            },
        },
        totales: j.totales,
        plan: estado.plan?.fecha === hoyISO(hoy) ? estado.plan : null,
        comun: j.comun.slice(0, 8).map((f) => conMarca(f)),
        duelo: j.duelo.map((f) => (f ? conMarca(f, { de: f.de }) : null)),
        debo: j.debo.slice(0, 6).map((f) => conMarca(f, { recomienda: f.recomienda, nota: f.nota, para: f.para })),
        revancha: j.revancha.slice(0, 6).map((f) => conMarca(f, { notas: f.notas, brecha: f.brecha })),
        giro: j.giro.slice(0, 24).map((f) => conMarca(f)),
        estado,
    };
};

export const construirPayload = ({ minutos = null, estado: estadoDado = null, usuario = null } = {}) => {
    const hoy = new Date();
    const quien = configDe(usuario ?? CONFIG.porDefecto);
    const { diario, watchlist, vistasFilas, sincronizadas, watchlistEnVivo, watchlistActualizada } =
        cargarUsuario(quien.usuario, { fechasWatchlist: fechasDe(quien.usuario) });
    const cache = leerCache();
    /* cuando se sincronizo el dato es un hecho del deploy, no del usuario:
       en serverless el estado viene del navegador y no lo sabria */
    const enDisco = leerEstado();
    const estado = estadoDado ? { ...VACIO, ...estadoDado } : enDisco;
    PERSONAS = leerPersonas();

    const ritmo = calcularRitmo({ diario, meta: quien.meta, contarRewatches: CONFIG.contarRewatches, hoy });
    const conDatos = watchlist.map((f) => ({ ...f, tmdb: cache[clave(f.nombre, f.anio)] ?? null }));

    const pre = prerankear({ watchlist: conDatos, hoy, rechazadas: estado.rechazadas });
    const cabe = (f) => {
        const d = f.tmdb?.minutos;
        return !minutos || d == null || d <= minutos;
    };
    const pool = minutos && pre.filter(cabe).length >= 8 ? pre.filter(cabe) : pre;
    const orden = rankearFinal({ candidatas: pool.slice(0, 40), minutosDisponibles: minutos, hoy });

    const retos = generarRetos({ diario, watchlist, vistasFilas, cache, personas: PERSONAS, activos: estado.retosActivos ?? {}, ritmo, hoy })
        .filter((r) => !estado.retosPasados.includes(r.id))
        .map((r) => ({ ...r, candidatas: r.candidatas.map((c) => aFilm({ ...c, tmdb: c.m })) }));

    const dormido = estado.snoozeHasta && estado.snoozeHasta >= hoyISO(hoy);
    const planDeHoy = estado.plan?.fecha === hoyISO(hoy) ? estado.plan : null;

    const iMirando = estado.mirando ? orden.findIndex((f) => f.nombre === estado.mirando) : -1;
    const elegida = iMirando >= 0 ? orden[iMirando] : orden[0];
    const resto = orden.filter((_, i) => i !== (iMirando >= 0 ? iMirando : 0));

    return {
        usuario: quien.usuario,
        nombre: quien.nombre,
        usuarios: CONFIG.usuarios.map((u) => ({ usuario: u.usuario, nombre: u.nombre })),
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
        cumplidoReciente: (estado.historial ?? []).filter((h) => h.tipo === "cumplido").at(-1) ?? null,
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

const fuentes = (usuario = null) => {
    const quien = configDe(usuario ?? CONFIG.porDefecto);
    const { diario, watchlist, vistasFilas } = cargarUsuario(quien.usuario, { fechasWatchlist: fechasDe(quien.usuario) });
    const cache = leerCache();
    PERSONAS = leerPersonas();
    return {
        diario, watchlist, vistasFilas, cache,
        meta: (f) => cache[clave(f.nombre, f.anio)],
        enDiario: new Map([...diario].reverse().map((f) => [clave(f.nombre, f.anio), f])),
        enWatchlist: new Map(watchlist.map((f) => [clave(f.nombre, f.anio), f])),
        yaVista: new Set(vistasFilas.map((f) => clave(f.nombre, f.anio))),
    };
};

export const porPersona = (id, usuario = null) => {
    const pid = Number(id);
    const { watchlist, vistasFilas, meta, enDiario } = fuentes(usuario);

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

export const porPelicula = (nombre, anio, usuario = null) => {
    const k = clave(nombre, Number(anio));
    const esJuntos = usuario === ES_JUNTOS;
    const { cache, enDiario, enWatchlist, yaVista } = fuentes(esJuntos ? null : usuario);
    const m = cache[k];
    const wl = enWatchlist.get(k);
    const d = enDiario.get(k);

    /* en juntos el panel no sirve de nada en primera persona: si la
       agrego yo, el que pregunta "que es esto" es el otro. asi que dice
       lo que le pasa a cada uno con la pelicula. */
    const dedos = esJuntos
        ? CONFIG.usuarios.map((u) => {
            const f = fuentes(u.usuario);
            const suya = f.enDiario.get(k);
            return {
                nombre: u.nombre,
                enWatchlist: f.enWatchlist.has(k),
                vista: f.yaVista.has(k),
                visto: suya?.visto ?? null,
                rating: suya?.rating ?? null,
            };
        })
        : null;

    return {
        tipo: "pelicula",
        ...aFilm({ nombre, anio: Number(anio), uri: wl?.uri ?? null, agregada: wl?.agregada ?? null, tmdb: m }),
        directorNombre: PERSONAS[m?.directorId] ?? m?.director ?? null,
        enWatchlist: Boolean(wl),
        vista: yaVista.has(k),
        visto: d?.visto ?? null,
        miRating: d?.rating ?? null,
        resuelta: Boolean(m?.tmdb),
        dedos,
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
    if (accion === "reto-paso" && retoId) {
        estado.retosPasados = [...new Set([...estado.retosPasados, retoId])];
        estado.retosActivos = Object.fromEntries(Object.entries(estado.retosActivos ?? {}).filter(([k]) => k !== retoId));
    }
    if (accion === "modo" && nombre) { estado.modo = nombre; estado.ronda = 0; }
    if (accion === "girar" || accion === "otra-ronda") estado.ronda = (estado.ronda ?? 0) + 1;
    if (accion === "reto-acepto" && retoId) {
        const ya = estado.retosActivos ?? {};
        estado.retosActivos = ya[retoId]
            ? Object.fromEntries(Object.entries(ya).filter(([k]) => k !== retoId))
            : { ...ya, [retoId]: hoyISO() };
    }
    if (accion === "limpiar") return { ...VACIO, ultimaSync: previo?.ultimaSync ?? null, ultimaSyncWatchlist: previo?.ultimaSyncWatchlist ?? null };

    return estado;
};

export const aplicarAccion = (args) => guardarEstado(reducir(leerEstado(), args));
