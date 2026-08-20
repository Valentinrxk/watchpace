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
        alDia: deficit <= 0,
        vioHoy: delAnio.some((f) => f.visto === hoy.toISOString().slice(0, 10)),
    };
};

export const ritmoPorDia = (diario, anio) => {
    const cuenta = Object.fromEntries(DIAS.map((d) => [d, 0]));
    for (const f of diario.filter((x) => x.visto.startsWith(String(anio)))) {
        const [y, m, d] = f.visto.split("-").map(Number);
        cuenta[DIAS[new Date(y, m - 1, d).getDay()]]++;
    }
    return cuenta;
};
