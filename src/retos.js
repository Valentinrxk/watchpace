import { clave } from "./letterboxd.js";
import { duracion, mirable, clasificar } from "./fmt.js";

const MS_DIA = 86400000;
const decada = (a) => Math.floor(a / 10) * 10;
const nombreDecada = (d) => `los ${String(d).slice(2)}`;

const PAISES = {
    SU: "la Unión Soviética", RU: "Rusia", GR: "Grecia", CY: "Chipre", SG: "Singapur", TH: "Tailandia",
    MA: "Marruecos", UY: "Uruguay", CZ: "Chequia", SI: "Eslovenia", PL: "Polonia", IR: "Irán",
    TR: "Turquía", IN: "India", CN: "China", TW: "Taiwán", HK: "Hong Kong", BR: "Brasil",
    MX: "México", CL: "Chile", SE: "Suecia", DK: "Dinamarca", NO: "Noruega", FI: "Finlandia",
    IS: "Islandia", NL: "Países Bajos", BE: "Bélgica", PT: "Portugal", AT: "Austria", HU: "Hungría",
    RO: "Rumania", UA: "Ucrania", IL: "Israel", EG: "Egipto", ZA: "Sudáfrica", NG: "Nigeria",
    AU: "Australia", NZ: "Nueva Zelanda", KR: "Corea", JP: "Japón", IT: "Italia", ES: "España",
};
const IDIOMAS = {
    ru: "ruso", el: "griego", fa: "persa", tr: "turco", hi: "hindi", zh: "chino", cn: "cantonés",
    th: "tailandés", pl: "polaco", cs: "checo", hu: "húngaro", sv: "sueco", da: "danés", no: "noruego",
    fi: "finés", nl: "neerlandés", pt: "portugués", he: "hebreo", ar: "árabe", is: "islandés",
};
const pais = (c) => PAISES[c] ?? c;
const idioma = (c) => IDIOMAS[c] ?? c;

const conMeta = (films, cache) =>
    films.map((f) => ({ ...f, m: cache[clave(f.nombre, f.anio)] ?? {} })).filter((f) => f.m.tmdb);

const contar = (films, extraer) => {
    const c = {};
    for (const f of films) for (const v of [extraer(f)].flat().filter(Boolean)) c[v] = (c[v] ?? 0) + 1;
    return c;
};

const mejores = (cands, n = 3) =>
    [...cands].sort((a, b) => mirable(b) - mirable(a) || (b.m.popularidad ?? 0) - (a.m.popularidad ?? 0)).slice(0, n);

const servicios = (f) => clasificar(f).sub;

/* ─── explorar ─────────────────────────────────────────────── */

const decadasOlvidadas = ({ vistas, lista }) => {
    const v = contar(vistas, (f) => decada(f.anio));
    const l = contar(lista, (f) => decada(f.anio));
    return Object.keys(l).map(Number)
        .filter((d) => l[d] >= 4 && (v[d] ?? 0) <= 4)
        .sort((a, b) => (v[a] ?? 0) / l[a] - (v[b] ?? 0) / l[b])
        .slice(0, 4)
        .map((d) => ({
            id: `decada-${d}`, tipo: "explorar",
            titulo: (v[d] ?? 0) === 0 ? `${nombreDecada(d)} no existen para vos` : `apenas pisás ${nombreDecada(d)}`,
            detalle: `${v[d] ?? 0} vistas este año, ${l[d]} esperando en la watchlist.`,
            objetivo: 3, progreso: 0, interes: 88 - (v[d] ?? 0) * 8,
            candidatas: mejores(lista.filter((f) => decada(f.anio) === d)),
        }));
};

const paisesSinTocar = ({ vistas, lista }) => {
    const v = contar(vistas, (f) => f.m.paises);
    const l = contar(lista, (f) => f.m.paises);
    return Object.keys(l)
        .filter((p) => l[p] >= 2 && !v[p])
        .sort((a, b) => l[b] - l[a])
        .slice(0, 4)
        .map((p) => ({
            id: `pais-${p}`, tipo: "explorar",
            titulo: `nunca viste cine de ${pais(p)}`,
            detalle: `tenés ${l[p]} esperando y este año no tocaste ninguna.`,
            objetivo: 1, progreso: 0, interes: 72 + l[p] * 2,
            candidatas: mejores(lista.filter((f) => f.m.paises?.includes(p))),
        }));
};

const idiomasNuevos = ({ vistas, lista }) => {
    const v = new Set(vistas.map((f) => f.m.idioma));
    const l = contar(lista, (f) => f.m.idioma);
    return Object.keys(l)
        .filter((i) => l[i] >= 2 && !v.has(i))
        .slice(0, 2)
        .map((i) => ({
            id: `idioma-${i}`, tipo: "explorar",
            titulo: `este año no escuchaste una sola en ${idioma(i)}`,
            detalle: `${l[i]} en la watchlist esperando.`,
            objetivo: 1, progreso: 0, interes: 66,
            candidatas: mejores(lista.filter((f) => f.m.idioma === i)),
        }));
};

const generosQueEvita = ({ vistas, lista }) => {
    const v = contar(vistas, (f) => f.m.generos);
    const l = contar(lista, (f) => f.m.generos);
    return Object.keys(l)
        .filter((g) => l[g] >= 8 && (v[g] ?? 0) / l[g] < 0.3)
        .sort((a, b) => (v[a] ?? 0) / l[a] - (v[b] ?? 0) / l[b])
        .slice(0, 3)
        .map((g) => ({
            id: `genero-${g}`, tipo: "explorar",
            titulo: `juntás ${g.toLowerCase()} pero no lo ves`,
            detalle: `${l[g]} en la watchlist y sólo ${v[g] ?? 0} vistas en todo el año.`,
            objetivo: 3, progreso: 0, interes: 62,
            candidatas: mejores(lista.filter((f) => f.m.generos?.includes(g))),
        }));
};

const ladrillos = ({ lista }) => {
    const largas = lista.filter((f) => (f.m.minutos ?? 0) >= 170).sort((a, b) => b.m.minutos - a.m.minutos);
    if (largas.length < 3) return [];
    return [{
        id: "largas", tipo: "explorar",
        titulo: `${largas.length} ladrillos que venís esquivando`,
        detalle: `la más brava: ${largas[0].nombre}, ${duracion(largas[0].m.minutos)}.`,
        objetivo: 2, progreso: 0, interes: 64,
        candidatas: largas.slice(0, 4),
    }];
};

const cortitas = ({ lista }) => {
    const cortas = lista.filter((f) => (f.m.minutos ?? 0) > 0 && f.m.minutos <= 90);
    if (cortas.length < 8) return [];
    return [{
        id: "cortas", tipo: "explorar",
        titulo: `${cortas.length} que entran en hora y media`,
        detalle: "para los días en que no da para más. sin excusas.",
        objetivo: 3, progreso: 0, interes: 58,
        candidatas: mejores(cortas, 4),
    }];
};

/* ─── completar ────────────────────────────────────────────── */

const directoresAMedias = ({ vistas, lista }) => {
    const v = contar(vistas, (f) => f.m.director);
    const l = contar(lista, (f) => f.m.director);
    return Object.keys(l)
        .filter((d) => l[d] >= 2)
        .sort((a, b) => l[b] - l[a] || (v[a] ?? 0) - (v[b] ?? 0))
        .slice(0, 6)
        .map((d) => ({
            id: `director-${d}`, tipo: "completar",
            titulo: `${l[d]} de ${d} sin ver`,
            detalle: v[d] ? `viste ${v[d]} este año. falta el resto.` : "ninguna este año. están todas ahí, mirándote.",
            objetivo: l[d], progreso: 0, interes: 64 + l[d] * 5,
            candidatas: mejores(lista.filter((f) => f.m.director === d), l[d]),
        }));
};

const actoresRecurrentes = ({ lista }) => {
    const l = contar(lista, (f) => f.m.reparto);
    return Object.keys(l)
        .filter((a) => l[a] >= 3)
        .sort((x, y) => l[y] - l[x])
        .slice(0, 4)
        .map((a) => ({
            id: `actor-${a}`, tipo: "completar",
            titulo: `${l[a]} con ${a} en la fila`,
            detalle: "no lo hiciste a propósito, pero ahí están.",
            objetivo: l[a], progreso: 0, interes: 58 + l[a] * 3,
            candidatas: mejores(lista.filter((f) => f.m.reparto?.includes(a)), l[a]),
        }));
};

/* ─── limpiar ──────────────────────────────────────────────── */

const masVieja = ({ lista, hoy }) => {
    const orden = [...lista].sort((a, b) => new Date(a.agregada) - new Date(b.agregada));
    if (!orden.length) return [];
    const v = orden[0];
    return [{
        id: "watchlist-vieja", tipo: "limpiar",
        titulo: `hace ${((hoy - new Date(v.agregada)) / MS_DIA / 365).toFixed(1)} años que pateás la misma`,
        detalle: `${v.nombre} (${v.anio}) entró a tu watchlist el ${v.agregada}. sigue ahí.`,
        objetivo: 5, progreso: 0, interes: 82,
        candidatas: orden.slice(0, 5),
    }];
};

const porServicio = ({ lista }) => {
    const l = contar(lista, servicios);
    return Object.keys(l)
        .filter((s) => l[s] >= 5)
        .sort((a, b) => l[b] - l[a])
        .slice(0, 5)
        .map((s) => ({
            id: `servicio-${s}`, tipo: "limpiar",
            titulo: `${l[s]} de tu watchlist están en ${s}`,
            detalle: "ahora mismo, sin alquilar nada.",
            objetivo: 5, progreso: 0, interes: 76,
            candidatas: mejores(lista.filter((f) => servicios(f).includes(s)), 4),
        }));
};

const mejorPuntuadas = ({ lista }) => {
    const top = lista.filter((f) => (f.m.puntaje ?? 0) >= 8 && (f.m.votos ?? 0) >= 1000)
        .sort((a, b) => b.m.puntaje - a.m.puntaje);
    if (top.length < 4) return [];
    return [{
        id: "mejor-puntuadas", tipo: "limpiar",
        titulo: `${top.length} con 8+ que no viste`,
        detalle: `arrancando por ${top[0].nombre} (${top[0].m.puntaje}).`,
        objetivo: 3, progreso: 0, interes: 78,
        candidatas: top.slice(0, 4),
    }];
};

const joyasOcultas = ({ lista }) => {
    const joyas = lista.filter((f) => (f.m.puntaje ?? 0) >= 7.5 && (f.m.votos ?? 0) > 0 && f.m.votos < 500)
        .sort((a, b) => b.m.puntaje - a.m.puntaje);
    if (joyas.length < 5) return [];
    return [{
        id: "joyas", tipo: "limpiar",
        titulo: `${joyas.length} que casi nadie vio`,
        detalle: "puntaje alto, poquísimos votos. terreno para plantar bandera.",
        objetivo: 3, progreso: 0, interes: 70,
        candidatas: mejores(joyas, 4),
    }];
};

const sinPuntuar = ({ diario }) => {
    const sin = diario.filter((f) => f.rating == null);
    if (sin.length < 5) return [];
    return [{
        id: "sin-puntuar", tipo: "limpiar",
        titulo: `${sin.length} vistas sin puntuar`,
        detalle: `las viste y no dijiste nada. la más vieja: ${sin[sin.length - 1].nombre}.`,
        objetivo: sin.length, progreso: 0, interes: 54,
        candidatas: [],
    }];
};

/* ─── hitos ────────────────────────────────────────────────── */

const hitoRedondo = ({ ritmo }) => {
    const proximo = Math.ceil((ritmo.vistas + 1) / 50) * 50;
    if (proximo > ritmo.meta) return [];
    const faltan = proximo - ritmo.vistas;
    const dias = ritmo.ritmoActual > 0 ? Math.ceil(faltan / ritmo.ritmoActual) : null;
    return [{
        id: `hito-${proximo}`, tipo: "hito",
        titulo: `te faltan ${faltan} para la número ${proximo}`,
        detalle: dias ? `a tu ritmo caen en ${dias} días. elegí bien la ${proximo}.` : "",
        objetivo: proximo, progreso: ritmo.vistas, interes: 56 + (faltan <= 5 ? 40 : 0),
        candidatas: [],
    }];
};

const horasDeCine = ({ vistas }) => {
    const min = vistas.reduce((s, f) => s + (f.m.minutos ?? 0), 0);
    const horas = Math.floor(min / 60);
    const proximo = Math.ceil((horas + 1) / 50) * 50;
    return [{
        id: "horas", tipo: "hito",
        titulo: `${horas} horas de cine este año`,
        detalle: `son ${(min / 1440).toFixed(1)} días seguidos mirando pantalla. el próximo hito son ${proximo}h.`,
        objetivo: proximo, progreso: horas, interes: 46, candidatas: [],
    }];
};

const racha = ({ diario, hoy }) => {
    const dias = new Set(diario.map((f) => f.visto));
    const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    let actual = 0;
    for (let i = 0; ; i++) {
        const d = new Date(base.getTime() - i * MS_DIA).toISOString().slice(0, 10);
        if (dias.has(d)) actual++;
        else if (i > 0) break;
    }
    let mejor = 0, run = 0, prev = null;
    for (const d of [...dias].sort()) {
        run = prev && (new Date(d) - new Date(prev)) / MS_DIA === 1 ? run + 1 : 1;
        mejor = Math.max(mejor, run);
        prev = d;
    }
    if (actual < 2) return [];
    return [{
        id: "racha", tipo: "racha",
        titulo: `${actual} días seguidos`,
        detalle: actual >= mejor ? "estás en tu mejor racha del año." : `tu récord es ${mejor}.`,
        objetivo: Math.max(mejor + 1, actual + 1), progreso: actual, interes: 52 + actual * 5, candidatas: [],
    }];
};

const GENERADORES = [
    decadasOlvidadas, paisesSinTocar, idiomasNuevos, generosQueEvita, ladrillos, cortitas,
    directoresAMedias, actoresRecurrentes,
    masVieja, porServicio, mejorPuntuadas, joyasOcultas, sinPuntuar,
    hitoRedondo, horasDeCine, racha,
];

/* baraja por tipo: nunca tres del mismo palo seguidos */
const intercalar = (retos) => {
    const porTipo = {};
    for (const r of retos) (porTipo[r.tipo] ??= []).push(r);
    for (const t of Object.values(porTipo)) t.sort((a, b) => b.interes - a.interes);

    const tipos = Object.keys(porTipo).sort((a, b) => porTipo[b][0].interes - porTipo[a][0].interes);
    const salida = [];
    while (salida.length < retos.length) {
        for (const t of tipos) if (porTipo[t].length) salida.push(porTipo[t].shift());
    }
    return salida;
};

export const generarRetos = ({ diario, watchlist, cache, ritmo, hoy }) => {
    const anio = hoy.getFullYear();
    const delAnio = diario.filter((f) => f.visto.startsWith(String(anio)));
    const ctx = {
        vistas: conMeta(delAnio, cache),
        lista: conMeta(watchlist, cache),
        diario: delAnio,
        ritmo,
        hoy,
    };

    const todos = GENERADORES.flatMap((g) => {
        try {
            return g(ctx) ?? [];
        } catch {
            return [];
        }
    }).map((r) => ({ ...r, interes: r.candidatas.length && !r.candidatas.some(mirable) ? r.interes - 18 : r.interes }));

    return intercalar(todos);
};
