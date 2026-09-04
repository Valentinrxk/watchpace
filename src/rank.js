const MS_DIA = 86400000;
const POOL = 14;

export const FACILIDAD = {
    "netflix.com": 50, "disneyplus.com": 50, "hbomax.com": 50, "max.com": 50, "primevideo.com": 50,
    "paramountplus.com": 30, "tv.apple.com": 30, "starplus.com": 30, "plus.espn.com": 30,
    "mubi.com": 15, "filmin.es": 15, "criterionchannel.com": 15, "crunchyroll.com": 15,
};

export const facilidad = (ops = []) => {
    const subs = ops.filter((o) => o.tipo === "SUSCRIPCION");
    if (!subs.length) return ops.some((o) => o.tipo === "ADDON") ? 5 : 0;
    return Math.max(...subs.map((o) => FACILIDAD[o.host] ?? 20));
};

/* fnv-1a con mezcla final. el hash anterior era h*31+c sobre el string:
   como la fecha iba al final, cambiar de dia movia el resultado 0,001 y
   la sugerencia quedaba clavada. este avalancha: un caracter distinto da
   un numero completamente distinto. */
export const azar = (semilla) => {
    let h = 2166136261;
    for (let i = 0; i < semilla.length; i++) {
        h ^= semilla.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
};

export const diaDe = (hoy) =>
    `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;

/* calidad pura: que tan buena candidata es, sin azar.
   el azar decide el ORDEN del dia, no quien entra al pool. */
export const prerankear = ({ watchlist, hoy = new Date(), rechazadas = {} }) =>
    watchlist
        .map((f) => {
            /* sin fecha de agregado (perfil publico) usamos la posicion:
               orden 0 es la mas nueva, el final de la lista la mas vieja */
            const dias = f.agregada ? Math.floor((hoy - new Date(f.agregada)) / MS_DIA) : null;
            const antiguedad = dias !== null ? Math.min(30, dias / 60) : Math.min(30, (f.orden ?? 0) / 15);
            const castigo = rechazadas[f.nombre] && hoy - new Date(rechazadas[f.nombre]) < 7 * MS_DIA ? -1000 : 0;
            return { ...f, diasEnLista: dias, score: antiguedad + castigo };
        })
        .sort((a, b) => b.score - a.score);

const desdeTmdb = (t) => (t?.proveedores?.suscripcion ?? []).map((n) => ({ host: n, tipo: "SUSCRIPCION" }));

const duracionDe = (f) => f.minutos ?? f.tmdb?.minutos ?? f.m?.minutos ?? null;

/* barajar cada dia por separado suena bien pero repite: cada dia es un
   sorteo nuevo e independiente, asi que la misma pelicula sale tres veces
   en dos semanas. esto ordena una vez por bloque y despues corre el punto
   de arranque un lugar por dia, o sea que recorre TODA la lista antes de
   repetir una. */
export const numeroDeDia = (hoy) =>
    Math.floor(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) / 86400000);

export const rotarPorDia = (items, hoy, sal = "") => {
    if (items.length < 2) return items;
    const dia = numeroDeDia(hoy);
    const bloque = Math.floor(dia / items.length);
    const barajado = items
        .map((f) => ({ f, r: azar(`${bloque}${sal}|${f.nombre}|${f.anio}`) }))
        .sort((a, b) => b.r - a.r)
        .map(({ f }) => f);
    const desde = dia % items.length;
    return [...barajado.slice(desde), ...barajado.slice(0, desde)];
};

export const rankearFinal = ({ candidatas, minutosDisponibles = null, hoy = new Date() }) => {
    const entra = (f) => {
        const dura = duracionDe(f);
        return !minutosDisponibles || dura === null || dura <= minutosDisponibles;
    };

    const caben = minutosDisponibles ? candidatas.filter(entra) : candidatas;
    const base = caben.length >= 3 ? caben : candidatas;

    const puntuadas = base
        .map((f) => {
            const ops = f.ops?.length ? f.ops : desdeTmdb(f.tmdb);
            const bonusStreaming = facilidad(ops) * (f.ops?.length ? 1 : 0.6);
            const dura = duracionDe(f);
            const aprovecha = minutosDisponibles && dura ? (dura / minutosDisponibles) * 18 : 0;
            const incierta = minutosDisponibles && dura === null ? -25 : 0;
            return { ...f, score: f.score + bonusStreaming + aprovecha + incierta };
        })
        .sort((a, b) => b.score - a.score);

    /* la calidad elige quienes son dignas; el dia elige el orden entre
       ellas. si no, la mejor por decimas gana siempre y todos los dias
       ves la misma. las rechazadas quedan fuera del pool por su castigo. */
    const dia = diaDe(hoy);
    const vivas = puntuadas.filter((f) => f.score > -500);
    const pool = vivas.slice(0, POOL);
    const resto = vivas.slice(POOL);

    return [...rotarPorDia(pool, hoy), ...resto, ...puntuadas.filter((f) => f.score <= -500)];
};
