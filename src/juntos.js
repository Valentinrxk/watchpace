import { clave } from "./letterboxd.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { cargarUsuario, configDe } from "./usuarios.js";
import { calcularRitmo } from "./pace.js";
import { azar, diaDe, facilidad } from "./rank.js";
import { clasificar, mirable } from "./fmt.js";
import { CONFIG } from "./config.js";

export const ES_JUNTOS = "juntos";

const setDe = (arr) => new Set(arr.map((f) => clave(f.nombre, f.anio)));

/* baraja estable: mismo dia y misma ronda -> mismo orden. cambia la
   ronda y cambia todo, asi pueden seguir tirando sin repetir */
const barajar = (items, semilla) =>
    items
        .map((f) => ({ f, r: azar(`${semilla}|${f.nombre}|${f.anio}`) }))
        .sort((a, b) => b.r - a.r)
        .map(({ f }) => f);

const conStreamPrimero = (items) =>
    [...items].sort((a, b) => mirable(b) - mirable(a) || facilidad(desde(b)) - facilidad(desde(a)));

const desde = (f) => (f.m?.proveedores?.suscripcion ?? []).map((n) => ({ host: n, tipo: "SUSCRIPCION" }));

const MS_DIA = 86400000;
const dias = (a, b) => Math.abs(new Date(a) - new Date(b)) / MS_DIA;

/* la misma pelicula anotada por los dos con un dia de diferencia o menos.
   dos metas separadas no dicen nada de una pareja; esto si. */
const verJuntas = (diarioA, diarioB, hoy) => {
    const deB = new Map();
    for (const f of diarioB) {
        const k = clave(f.nombre, f.anio);
        if (!deB.has(k)) deB.set(k, []);
        deB.get(k).push(f);
    }

    const juntas = [];
    const usadas = new Set();
    for (const fa of diarioA) {
        const k = clave(fa.nombre, fa.anio);
        if (usadas.has(k)) continue;
        const par = (deB.get(k) ?? []).find((fb) => dias(fa.visto, fb.visto) <= 1);
        if (!par) continue;
        usadas.add(k);
        juntas.push({
            nombre: fa.nombre, anio: fa.anio, visto: fa.visto,
            mismoDia: dias(fa.visto, par.visto) === 0,
            notas: [fa.rating ?? null, par.rating ?? null],
        });
    }
    juntas.sort((x, y) => y.visto.localeCompare(x.visto));

    const anio = hoy.getFullYear();
    const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
    const transcurridos = Math.floor((hoy - new Date(anio, 0, 1)) / MS_DIA) + 1;
    const restantes = (bisiesto ? 366 : 365) - transcurridos;
    const delAnio = juntas.filter((f) => f.visto.startsWith(String(anio)));
    const ritmo = delAnio.length / transcurridos;

    return {
        total: delAnio.length,
        mismoDia: delAnio.filter((f) => f.mismoDia).length,
        ritmo,
        cada: ritmo > 0 ? 1 / ritmo : null,
        proyeccion: Math.round(delAnio.length + ritmo * restantes),
        ultima: delAnio[0] ?? null,
        ultimas: delAnio.slice(0, 6),
    };
};

export const armarJuntos = ({ ronda = 0, modo = "comun", rechazadas = {}, hoy = new Date() } = {}) => {
    const cache = leerCache();
    const personas = leerPersonas();
    const quienes = CONFIG.usuarios.map((u) => configDe(u.usuario));

    const datos = quienes.map((q) => {
        const d = cargarUsuario(q.usuario);
        return {
            ...q,
            watchlist: d.watchlist.map((f) => ({ ...f, m: cache[clave(f.nombre, f.anio)] ?? {}, de: q.nombre })),
            diario: d.diario,
            vistas: setDe(d.vistasFilas),
            notas: new Map(d.diario.filter((f) => f.rating).map((f) => [clave(f.nombre, f.anio), f.rating])),
            ritmo: calcularRitmo({ diario: d.diario, meta: q.meta, contarRewatches: CONFIG.contarRewatches, hoy }),
        };
    });

    const [A, B] = datos;
    const wlA = setDe(A.watchlist), wlB = setDe(B.watchlist);
    const vivo = (f) => !rechazadas[f.nombre];

    /* 1. los dos la quieren ver */
    const comun = conStreamPrimero(A.watchlist.filter((f) => wlB.has(clave(f.nombre, f.anio)))).filter(vivo);

    /* 2. duelo: una de cada watchlist que el otro no vio */
    const soloA = A.watchlist.filter((f) => !wlB.has(clave(f.nombre, f.anio)) && !B.vistas.has(clave(f.nombre, f.anio))).filter(vivo);
    const soloB = B.watchlist.filter((f) => !wlA.has(clave(f.nombre, f.anio)) && !A.vistas.has(clave(f.nombre, f.anio))).filter(vivo);

    const semilla = `${diaDe(hoy)}#${ronda}`;
    const mejoresDe = (arr) => barajar(conStreamPrimero(arr).slice(0, 40), semilla);
    const duelo = [mejoresDe(soloA)[0] ?? null, mejoresDe(soloB)[0] ?? null];

    /* 3. te la debo: uno le puso 4+ y el otro no la vio */
    const debo = [];
    for (const [uno, otro] of [[A, B], [B, A]]) {
        for (const f of otro.watchlist) {
            const nota = uno.notas.get(clave(f.nombre, f.anio));
            if (nota >= 4 && vivo(f)) debo.push({ ...f, recomienda: uno.nombre, nota, para: otro.nombre });
        }
    }

    /* 4. revancha: la vieron los dos y la puntuaron muy distinto */
    const revancha = [];
    for (const [k, notaA] of A.notas) {
        const notaB = B.notas.get(k);
        if (notaB == null) continue;
        const brecha = Math.abs(notaA - notaB);
        if (brecha < 1.5) continue;
        const [nombre, anio] = [k.slice(0, k.lastIndexOf("::")), Number(k.slice(k.lastIndexOf("::") + 2))];
        revancha.push({ nombre, anio, m: cache[k] ?? {}, brecha, notas: [{ de: A.nombre, nota: notaA }, { de: B.nombre, nota: notaB }] });
    }
    revancha.sort((x, y) => y.brecha - x.brecha);

    /* 5. ruleta: de donde sale depende del modo que estes mirando */
    const bolillero = modo === "comun" && comun.length ? comun
        : modo === "revancha" && revancha.length ? revancha
        : [...soloA, ...soloB];
    const giro = barajar(conStreamPrimero(bolillero).slice(0, 30), `${semilla}!ruleta`);

    const juntas = verJuntas(A.diario ?? [], B.diario ?? [], hoy);

    return {
        personas, datos, comun, duelo, debo, revancha, giro, juntas,
        ritmos: datos.map((d) => ({ nombre: d.nombre, usuario: d.usuario, vistas: d.ritmo.vistas, meta: d.ritmo.meta, alDia: d.ritmo.alDia, deficit: d.ritmo.deficit })),
        totales: {
            comun: comun.length,
            comunDisponibles: comun.filter(mirable).length,
            duelo: soloA.length + soloB.length,
            debo: debo.length,
            revancha: revancha.length,
        },
    };
};
