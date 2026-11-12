const MS_DIA = 86400000;

const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

const diaDelAnio = (d) =>
    Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / MS_DIA) + 1;

export const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

export const calcularRitmo = ({ diario, meta, contarRewatches = true, hoy = new Date() }) => {
    const anio = hoy.getFullYear();
    const delAnio = diario.filter((f) => f.visto.startsWith(String(anio)));
    const contadas = contarRewatches ? delAnio : delAnio.filter((f) => !f.rewatch);

    const vistas = contadas.length;
    const totalDias = esBisiesto(anio) ? 366 : 365;
    const transcurridos = diaDelAnio(hoy);
    const restantes = totalDias - transcurridos;
    const faltan = Math.max(0, meta - vistas);

    const ritmoActual = vistas / transcurridos;
    const ritmoNecesario = restantes > 0 ? faltan / restantes : 0;
    const proyeccion = Math.round(vistas + ritmoActual * restantes);
    const deficit = Math.round(meta * (transcurridos / totalDias) - vistas);

    const diasParaMeta = faltan && ritmoActual > 0 ? Math.ceil(faltan / ritmoActual) : 0;
    const fechaMeta = faltan ? new Date(hoy.getTime() + diasParaMeta * MS_DIA) : null;

    return {
        anio, meta, vistas, faltan, transcurridos, restantes,
        rewatches: delAnio.filter((f) => f.rewatch).length,
        ritmoActual, ritmoNecesario, proyeccion, deficit, fechaMeta,
        cumplida: vistas >= meta,
        yapa: Math.max(0, vistas - meta),
        alDia: deficit <= 0,
        vioHoy: delAnio.some((f) => f.visto === hoy.toISOString().slice(0, 10)),
    };
};

const PASO = 50;

/* el diario viene de la mas nueva a la mas vieja. darlo vuelta antes de
   ordenar por fecha deja las de un mismo dia en el orden en que las
   cargaste: si viste cuatro un sabado, la numero 206 es la que fue y no
   cualquiera de las cuatro */
const enOrden = (pelis) => [...pelis].reverse().sort((a, b) => a.visto.localeCompare(b.visto));

const fichaDe = (f) => (f ? { nombre: f.nombre, anio: f.anio, visto: f.visto, rating: f.rating ?? null } : null);

/* los premios del año: cada numero redondo y la meta, con la pelicula que
   fue esa numero. pasada la meta se suma el redondo que sigue, para que
   siempre quede algo adelante */
export const calcularPremios = ({ diario, meta, contarRewatches = true, hoy = new Date() }) => {
    const anio = hoy.getFullYear();
    const delAnio = diario.filter((f) => f.visto.startsWith(String(anio)));
    const pelis = enOrden(contarRewatches ? delAnio : delAnio.filter((f) => !f.rewatch));
    const vistas = pelis.length;

    const tope = vistas >= meta ? (Math.floor(vistas / PASO) + 1) * PASO : meta;
    const numeros = new Set([meta]);
    for (let n = PASO; n <= tope; n += PASO) numeros.add(n);

    const premios = [...numeros].sort((a, b) => a - b).map((n) => {
        const esMeta = n === meta;
        return {
            id: `${esMeta ? "meta" : "numero"}-${anio}-${n}`,
            n,
            esMeta,
            logrado: vistas >= n,
            faltan: Math.max(0, n - vistas),
            peli: fichaDe(pelis[n - 1]),
        };
    });

    const metaEl = premios.find((p) => p.esMeta).peli?.visto ?? null;
    const [, mes, dia] = (metaEl ?? "").split("-").map(Number);
    const diasDeSobra = metaEl
        ? (esBisiesto(anio) ? 366 : 365) - diaDelAnio(new Date(anio, mes - 1, dia))
        : null;

    return { premios, primera: fichaDe(pelis[0]), metaEl, diasDeSobra };
};

export const ritmoPorDia = (diario, anio) => {
    const cuenta = Object.fromEntries(DIAS.map((d) => [d, 0]));
    for (const f of diario.filter((x) => x.visto.startsWith(String(anio)))) {
        const [y, m, d] = f.visto.split("-").map(Number);
        cuenta[DIAS[new Date(y, m - 1, d).getDay()]]++;
    }
    return cuenta;
};
