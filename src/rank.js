const MS_DIA = 86400000;

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

const semillaDiaria = (nombre, hoy) => {
    const s = `${nombre}${hoy.toISOString().slice(0, 10)}`;
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
    return (h / 9973) * 12;
};

export const prerankear = ({ watchlist, hoy = new Date(), rechazadas = {} }) =>
    watchlist
        .map((f) => {
            /* sin fecha de agregado (perfil publico) usamos la posicion:
               orden 0 es la mas nueva, el final de la lista la mas vieja */
            const dias = f.agregada ? Math.floor((hoy - new Date(f.agregada)) / MS_DIA) : null;
            const antiguedad = dias !== null ? Math.min(30, dias / 60) : Math.min(30, (f.orden ?? 0) / 15);
            const castigo = rechazadas[f.nombre] && hoy - new Date(rechazadas[f.nombre]) < 7 * MS_DIA ? -100 : 0;
            return { ...f, diasEnLista: dias, score: antiguedad + castigo + semillaDiaria(f.nombre, hoy) };
        })
        .sort((a, b) => b.score - a.score);

const desdeTmdb = (t) => (t?.proveedores?.suscripcion ?? []).map((n) => ({ host: n, tipo: "SUSCRIPCION" }));

const duracionDe = (f) => f.minutos ?? f.tmdb?.minutos ?? f.m?.minutos ?? null;

export const rankearFinal = ({ candidatas, minutosDisponibles = null }) => {
    const entra = (f) => {
        const dura = duracionDe(f);
        return !minutosDisponibles || dura === null || dura <= minutosDisponibles;
    };

    const caben = minutosDisponibles ? candidatas.filter(entra) : candidatas;
    const base = caben.length >= 3 ? caben : candidatas;

    return base
        .map((f) => {
            const ops = f.ops?.length ? f.ops : desdeTmdb(f.tmdb);
            const bonusStreaming = facilidad(ops) * (f.ops?.length ? 1 : 0.6);
            const dura = duracionDe(f);
            const aprovecha = minutosDisponibles && dura ? (dura / minutosDisponibles) * 18 : 0;
            const incierta = minutosDisponibles && dura === null ? -25 : 0;
            return { ...f, score: f.score + bonusStreaming + aprovecha + incierta };
        })
        .sort((a, b) => b.score - a.score);
};
