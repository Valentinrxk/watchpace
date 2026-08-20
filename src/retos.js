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
    ko: "coreano", ja: "japonés", it: "italiano", fr: "francés", de: "alemán",
};
const pais = (c) => PAISES[c] ?? c;
const idioma = (c) => IDIOMAS[c] ?? c;

const conMeta = (films, cache) =>
    films.map((f) => ({ ...f, m: cache[clave(f.nombre, f.anio)] ?? {} })).filter((f) => f.m.tmdb);

const contar = (films, extraer) => {
    const c = {};
    for (const f of films) for (const v of [extraer(f)].flat().filter((x) => x != null && x !== "")) c[v] = (c[v] ?? 0) + 1;
    return c;
};

const mejores = (cands, n = 3) =>
    [...cands].sort((a, b) => mirable(b) - mirable(a) || (b.m.popularidad ?? 0) - (a.m.popularidad ?? 0)).slice(0, n);

const servicios = (f) => clasificar(f).sub;

/* ─── explorar: dos sabores, ambos verdaderos ──────────────
   "nunca" sólo si el historial COMPLETO da cero.
   Si lo vio alguna vez, el titulo dice "este año".            */

const decadas = ({ anio, vida, lista }) => {
    const a = contar(anio, (f) => decada(f.anio));
    const v = contar(vida, (f) => decada(f.anio));
    const l = contar(lista, (f) => decada(f.anio));
    const pend = (d) => lista.filter((f) => decada(f.anio) === d);

    const nunca = Object.keys(l).map(Number)
        .filter((d) => l[d] >= 3 && !v[d])
        .sort((x, y) => l[y] - l[x])
        .slice(0, 3)
        .map((d) => ({
            id: `decada-nunca-${d}`, tipo: "explorar", cumple: (f) => decada(f.anio) === d,
            titulo: `nunca viste una de ${nombreDecada(d)}`,
            detalle: `ni una en toda tu vida, y tenés ${l[d]} esperando.`,
            objetivo: 1, progreso: 0, interes: 94, candidatas: mejores(pend(d)),
        }));

    const puntoCiego = Object.keys(l).map(Number)
        .filter((d) => l[d] >= 4 && v[d] > 0 && v[d] <= 10)
        .sort((x, y) => v[x] / l[x] - v[y] / l[y])
        .slice(0, 3)
        .map((d) => ({
            id: `decada-ciega-${d}`, tipo: "explorar", cumple: (f) => decada(f.anio) === d,
            titulo: `${nombreDecada(d)} son tu punto ciego`,
            detalle: `${v[d]} vistas en toda tu vida (${a[d] ?? 0} este año) y ${l[d]} en la watchlist.`,
            objetivo: 3, progreso: 0, interes: 86, candidatas: mejores(pend(d)),
        }));

    const esteAnio = Object.keys(l).map(Number)
        .filter((d) => l[d] >= 6 && v[d] > 10 && (a[d] ?? 0) <= 2)
        .sort((x, y) => l[y] - l[x])
        .slice(0, 2)
        .map((d) => ({
            id: `decada-anio-${d}`, tipo: "explorar", cumple: (f) => decada(f.anio) === d,
            titulo: `este año casi no pisaste ${nombreDecada(d)}`,
            detalle: `${a[d] ?? 0} este año, aunque en total llevás ${v[d]}. hay ${l[d]} pendientes.`,
            objetivo: 3, progreso: 0, interes: 66, candidatas: mejores(pend(d)),
        }));

    return [...nunca, ...puntoCiego, ...esteAnio];
};

const paises = ({ anio, vida, lista }) => {
    const a = contar(anio, (f) => f.m.paises);
    const v = contar(vida, (f) => f.m.paises);
    const l = contar(lista, (f) => f.m.paises);
    const pend = (p) => lista.filter((f) => f.m.paises?.includes(p));

    const nunca = Object.keys(l)
        .filter((p) => l[p] >= 2 && !v[p])
        .sort((x, y) => l[y] - l[x])
        .slice(0, 4)
        .map((p) => ({
            id: `pais-nunca-${p}`, tipo: "explorar", cumple: (f) => f.m.paises?.includes(p),
            titulo: `nunca viste cine de ${pais(p)}`,
            detalle: `tenés ${l[p]} esperando y ninguna vista, jamás.`,
            objetivo: 1, progreso: 0, interes: 90, candidatas: mejores(pend(p)),
        }));

    const esteAnio = Object.keys(l)
        .filter((p) => l[p] >= 2 && v[p] > 0 && !a[p])
        .sort((x, y) => l[y] - l[x])
        .slice(0, 3)
        .map((p) => ({
            id: `pais-anio-${p}`, tipo: "explorar", cumple: (f) => f.m.paises?.includes(p),
            titulo: `este año no viste nada de ${pais(p)}`,
            detalle: `llevás ${v[p]} en tu historial y ${l[p]} pendientes.`,
            objetivo: 1, progreso: 0, interes: 68, candidatas: mejores(pend(p)),
        }));

    return [...nunca, ...esteAnio];
};

const idiomas = ({ anio, vida, lista }) => {
    const a = new Set(anio.map((f) => f.m.idioma));
    const v = new Set(vida.map((f) => f.m.idioma));
    const l = contar(lista, (f) => f.m.idioma);
    const pend = (i) => lista.filter((f) => f.m.idioma === i);

    const nunca = Object.keys(l)
        .filter((i) => l[i] >= 2 && !v.has(i))
        .slice(0, 2)
        .map((i) => ({
            id: `idioma-nunca-${i}`, tipo: "explorar", cumple: (f) => f.m.idioma === i,
            titulo: `nunca viste una en ${idioma(i)}`,
            detalle: `${l[i]} en la watchlist para estrenarte.`,
            objetivo: 1, progreso: 0, interes: 88, candidatas: mejores(pend(i)),
        }));

    const esteAnio = Object.keys(l)
        .filter((i) => l[i] >= 2 && v.has(i) && !a.has(i))
        .slice(0, 2)
        .map((i) => ({
            id: `idioma-anio-${i}`, tipo: "explorar", cumple: (f) => f.m.idioma === i,
            titulo: `este año no escuchaste una sola en ${idioma(i)}`,
            detalle: `${l[i]} esperando en la watchlist.`,
            objetivo: 1, progreso: 0, interes: 64, candidatas: mejores(pend(i)),
        }));

    return [...nunca, ...esteAnio];
};

const generos = ({ anio, vida, lista }) => {
    const a = contar(anio, (f) => f.m.generos);
    const v = contar(vida, (f) => f.m.generos);
    const l = contar(lista, (f) => f.m.generos);
    const pend = (g) => lista.filter((f) => f.m.generos?.includes(g));

    const evita = Object.keys(l)
        .filter((g) => l[g] >= 8 && v[g] / l[g] < 0.6)
        .sort((x, y) => v[x] / l[x] - v[y] / l[y])
        .slice(0, 2)
        .map((g) => ({
            id: `genero-vida-${g}`, tipo: "explorar", cumple: (f) => f.m.generos?.includes(g),
            titulo: `juntás ${g.toLowerCase()} más rápido de lo que lo ves`,
            detalle: `${l[g]} pendientes contra ${v[g] ?? 0} vistas en toda tu vida.`,
            objetivo: 3, progreso: 0, interes: 72, candidatas: mejores(pend(g)),
        }));

    const esteAnio = Object.keys(l)
        .filter((g) => l[g] >= 8 && (a[g] ?? 0) / l[g] < 0.3)
        .sort((x, y) => (a[x] ?? 0) / l[x] - (a[y] ?? 0) / l[y])
        .slice(0, 3)
        .map((g) => ({
            id: `genero-anio-${g}`, tipo: "explorar", cumple: (f) => f.m.generos?.includes(g),
            titulo: `${g.toLowerCase()}: ${l[g]} en la watchlist, ${a[g] ?? 0} este año`,
            detalle: `en tu vida viste ${v[g] ?? 0}, así que el género te gusta. este año lo dejaste.`,
            objetivo: 3, progreso: 0, interes: 62, candidatas: mejores(pend(g)),
        }));

    return [...evita, ...esteAnio];
};

const ladrillos = ({ lista }) => {
    const largas = lista.filter((f) => (f.m.minutos ?? 0) >= 170).sort((a, b) => b.m.minutos - a.m.minutos);
    if (largas.length < 3) return [];
    return [{
        id: "largas", tipo: "explorar", cumple: (f) => (f.m.minutos ?? 0) >= 170,
        titulo: `${largas.length} ladrillos que venís esquivando`,
        detalle: `la más brava: ${largas[0].nombre}, ${duracion(largas[0].m.minutos)}.`,
        objetivo: 2, progreso: 0, interes: 64, candidatas: largas.slice(0, 4),
    }];
};

const cortitas = ({ lista }) => {
    const cortas = lista.filter((f) => (f.m.minutos ?? 0) > 0 && f.m.minutos <= 90);
    if (cortas.length < 8) return [];
    return [{
        id: "cortas", tipo: "explorar", cumple: (f) => (f.m.minutos ?? 0) > 0 && f.m.minutos <= 90,
        titulo: `${cortas.length} que entran en hora y media`,
        detalle: "para los días en que no da para más. sin excusas.",
        objetivo: 3, progreso: 0, interes: 58, candidatas: mejores(cortas, 4),
    }];
};

/* ─── completar: siempre contra el historial completo ─────── */

const directores = ({ vida, lista, personas }) => {
    const v = contar(vida, (f) => f.m.directorId);
    const l = contar(lista, (f) => f.m.directorId);

    return Object.keys(l)
        .filter((id) => l[id] >= 2)
        .sort((x, y) => l[y] - l[x] || (v[x] ?? 0) - (v[y] ?? 0))
        .slice(0, 8)
        .map((id) => {
            const pend = lista.filter((f) => String(f.m.directorId) === id);
            const nombre = personas[id] ?? pend[0]?.m.director ?? "ese director";
            const yaVio = v[id] ?? 0;
            return {
                id: `director-${id}`, tipo: "completar", cumple: (f) => String(f.m.directorId) === id,
                titulo: yaVio ? `te faltan ${pend.length} de ${nombre}` : `${pend.length} de ${nombre} y nunca viste una`,
                detalle: yaVio ? `ya viste ${yaVio} suya${yaVio === 1 ? "" : "s"}.` : "ninguna en toda tu vida. están todas ahí, mirándote.",
                objetivo: pend.length, progreso: 0,
                interes: (yaVio ? 68 : 78) + pend.length * 4,
                candidatas: mejores(pend, pend.length),
            };
        });
};

const actores = ({ vida, lista, personas }) => {
    const v = contar(vida, (f) => f.m.repartoIds);
    const l = contar(lista, (f) => f.m.repartoIds);

    return Object.keys(l)
        .filter((id) => l[id] >= 3)
        .sort((x, y) => l[y] - l[x])
        .slice(0, 5)
        .map((id) => {
            const pend = lista.filter((f) => (f.m.repartoIds ?? []).map(String).includes(id));
            const i = pend[0]?.m.repartoIds?.indexOf(Number(id));
            const nombre = personas[id] ?? (i >= 0 ? pend[0]?.m.reparto?.[i] : null) ?? "ese actor";
            return {
                id: `actor-${id}`, tipo: "completar", cumple: (f) => (f.m.repartoIds ?? []).map(String).includes(id),
                titulo: `${pend.length} con ${nombre} en la fila`,
                detalle: v[id] ? `ya lo viste en ${v[id]}. no lo hiciste a propósito.` : "y nunca lo viste. no lo hiciste a propósito.",
                objetivo: pend.length, progreso: 0, interes: 58 + pend.length * 3,
                candidatas: mejores(pend, pend.length),
            };
        });
};

/* ─── limpiar: sólo miran la watchlist ─────────────────────── */

const masVieja = ({ lista, hoy }) => {
    if (!lista.length) return [];
    const pendientes = new Set(lista.map((f) => clave(f.nombre, f.anio)));
    const conFecha = lista.filter((f) => f.agregada);

    /* con fechas podemos decir cuanto hace; sin ellas solo el orden */
    const orden = conFecha.length
        ? [...conFecha].sort((a, b) => a.agregada.localeCompare(b.agregada))
        : [...lista].sort((a, b) => (b.orden ?? 0) - (a.orden ?? 0));
    const v = orden[0];

    return [{
        id: "watchlist-vieja", tipo: "limpiar", cumple: (f) => pendientes.has(clave(f.nombre, f.anio)),
        titulo: conFecha.length
            ? `hace ${((hoy - new Date(v.agregada)) / MS_DIA / 365).toFixed(1)} años que pateás la misma`
            : "las que más venís pateando",
        detalle: conFecha.length
            ? `${v.nombre} (${v.anio}) entró a tu watchlist el ${v.agregada}. sigue ahí.`
            : `${v.nombre} (${v.anio}) es la más vieja de tu watchlist.`,
        objetivo: 5, progreso: 0, interes: 82, candidatas: orden.slice(0, 5),
    }];
};

const porServicio = ({ lista }) => {
    const l = contar(lista, servicios);
    return Object.keys(l)
        .filter((s) => l[s] >= 5)
        .sort((a, b) => l[b] - l[a])
        .slice(0, 5)
        .map((s) => ({
            id: `servicio-${s}`, tipo: "limpiar", cumple: (f) => servicios(f).includes(s),
            titulo: `${l[s]} de tu watchlist están en ${s}`,
            detalle: "ahora mismo, sin alquilar nada.",
            objetivo: 5, progreso: 0, interes: 76, candidatas: mejores(lista.filter((f) => servicios(f).includes(s)), 4),
        }));
};

const mejorPuntuadas = ({ lista }) => {
    const top = lista.filter((f) => (f.m.puntaje ?? 0) >= 8 && (f.m.votos ?? 0) >= 1000).sort((a, b) => b.m.puntaje - a.m.puntaje);
    if (top.length < 4) return [];
    return [{
        id: "mejor-puntuadas", tipo: "limpiar", cumple: (f) => (f.m.puntaje ?? 0) >= 8 && (f.m.votos ?? 0) >= 1000,
        titulo: `${top.length} con 8+ que no viste`,
        detalle: `arrancando por ${top[0].nombre} (${top[0].m.puntaje}).`,
        objetivo: 3, progreso: 0, interes: 78, candidatas: top.slice(0, 4),
    }];
};

const joyasOcultas = ({ lista }) => {
    const joyas = lista.filter((f) => (f.m.puntaje ?? 0) >= 7.5 && (f.m.votos ?? 0) > 0 && f.m.votos < 500).sort((a, b) => b.m.puntaje - a.m.puntaje);
    if (joyas.length < 5) return [];
    return [{
        id: "joyas", tipo: "limpiar", cumple: (f) => (f.m.puntaje ?? 0) >= 7.5 && (f.m.votos ?? 0) > 0 && f.m.votos < 500,
        titulo: `${joyas.length} que casi nadie vio`,
        detalle: "puntaje alto, poquísimos votos. terreno para plantar bandera.",
        objetivo: 3, progreso: 0, interes: 70, candidatas: mejores(joyas, 4),
    }];
};

const sinPuntuar = ({ diario }) => {
    const sin = diario.filter((f) => f.rating == null);
    if (sin.length < 5) return [];
    return [{
        id: "sin-puntuar", acumulativo: true, tipo: "limpiar",
        titulo: `${sin.length} vistas sin puntuar`,
        detalle: `las viste este año y no dijiste nada. la más vieja: ${sin[sin.length - 1].nombre}.`,
        objetivo: sin.length, progreso: 0, interes: 54, candidatas: [],
    }];
};

/* ─── hitos: siempre del año en curso ──────────────────────── */

const hitoRedondo = ({ ritmo }) => {
    const proximo = Math.ceil((ritmo.vistas + 1) / 50) * 50;
    if (proximo > ritmo.meta) return [];
    const faltan = proximo - ritmo.vistas;
    const dias = ritmo.ritmoActual > 0 ? Math.ceil(faltan / ritmo.ritmoActual) : null;
    return [{
        id: `hito-${proximo}`, acumulativo: true, tipo: "hito",
        titulo: `te faltan ${faltan} para la número ${proximo}`,
        detalle: dias ? `a tu ritmo caen en ${dias} días. elegí bien la ${proximo}.` : "",
        objetivo: proximo, progreso: ritmo.vistas, interes: 56 + (faltan <= 5 ? 40 : 0), candidatas: [],
    }];
};

const horasDeCine = ({ anio }) => {
    const min = anio.reduce((s, f) => s + (f.m.minutos ?? 0), 0);
    const horas = Math.floor(min / 60);
    const proximo = Math.ceil((horas + 1) / 50) * 50;
    return [{
        id: "horas", acumulativo: true, tipo: "hito",
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
        id: "racha", acumulativo: true, tipo: "racha",
        titulo: `${actual} días seguidos`,
        detalle: actual >= mejor ? "estás en tu mejor racha del año." : `tu récord es ${mejor}.`,
        objetivo: Math.max(mejor + 1, actual + 1), progreso: actual, interes: 52 + actual * 5, candidatas: [],
    }];
};

const GENERADORES = [
    decadas, paises, idiomas, generos, ladrillos, cortitas,
    directores, actores,
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

export const generarRetos = ({ diario, watchlist, vistasFilas = [], cache, personas = {}, activos = {}, ritmo, hoy }) => {
    const delAnio = diario.filter((f) => f.visto.startsWith(String(hoy.getFullYear())));
    const ctx = {
        anio: conMeta(delAnio, cache),
        vida: conMeta(vistasFilas, cache),
        lista: conMeta(watchlist, cache),
        diario: delAnio,
        personas, ritmo, hoy,
    };

    const todos = GENERADORES.flatMap((g) => {
        try {
            return g(ctx) ?? [];
        } catch {
            return [];
        }
    }).map((r) => ({ ...r, interes: r.candidatas.length && !r.candidatas.some(mirable) ? r.interes - 18 : r.interes }));

    /* un reto aceptado cuenta desde el dia que lo aceptaste, no desde
       enero: si no, nacerian a medio cumplir o ya cumplidos */
    const conProgreso = todos.map((r) => {
        const desde = activos[r.id];
        if (!desde || r.acumulativo || !r.cumple) return { ...r, activo: Boolean(desde), desde: desde ?? null };
        const hechas = ctx.anio.filter((f) => f.visto >= desde && r.cumple(f));
        return {
            ...r,
            activo: true,
            desde,
            progreso: hechas.length,
            hechas: hechas.map((f) => ({ nombre: f.nombre, anio: f.anio, visto: f.visto })),
            completado: hechas.length >= r.objetivo,
        };
    });

    /* los activos van primero: si te comprometiste, que no se escondan */
    return intercalar(conProgreso).sort((a, b) => (b.activo ? 1 : 0) - (a.activo ? 1 : 0));
};
