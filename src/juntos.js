import { clave } from "./letterboxd.js";
import { leerCache, leerPersonas } from "./enrich.js";
import { cargarUsuario, configDe } from "./usuarios.js";
import { calcularRitmo } from "./pace.js";
import { azar, diaDe, facilidad, ordenDelDia } from "./rank.js";
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

/* toma una de cada lista por vuelta, para que recortar arriba no borre
   una lista entera */
const intercalar = (listas) => {
    const salida = [];
    const largo = Math.max(0, ...listas.map((l) => l.length));
    for (let i = 0; i < largo; i++) for (const l of listas) if (l[i]) salida.push(l[i]);
    return salida;
};

const conStreamPrimero = (items) =>
    [...items].sort((a, b) => mirable(b) - mirable(a) || facilidad(desde(b)) - facilidad(desde(a)));

const desde = (f) => (f.m?.proveedores?.suscripcion ?? []).map((n) => ({ host: n, tipo: "SUSCRIPCION" }));

const MS_DIA = 86400000;
const dias = (a, b) => Math.abs(new Date(a) - new Date(b)) / MS_DIA;

/* la misma pelicula anotada por los dos con un dia de diferencia o menos.
   el dia de diferencia no es otra cosa: es el que se olvido de anotarla
   y la anoto al otro dia. por eso entra igual y no se distingue. */
const verJuntas = (diarioA, diarioB, hoy, cache = {}) => {
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
            nombre: fa.nombre, anio: fa.anio, visto: fa.visto, k,
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
        ritmo,
        cada: ritmo > 0 ? 1 / ritmo : null,
        proyeccion: Math.round(delAnio.length + ritmo * restantes),
        ultima: delAnio[0] ?? null,
        ultimas: delAnio.slice(0, 6),
        vida: loNuestro(juntas, hoy, cache),
        /* el material de "¿cuanto le puso?": las que puntuaron los dos */
        puntuadas: juntas
            .filter((f) => f.notas[0] != null && f.notas[1] != null)
            .map((f) => ({ nombre: f.nombre, anio: f.anio, visto: f.visto, notas: f.notas, poster: cache[f.k]?.poster ?? null })),
    };
};

/* toda la historia junta, no solo la del año. el diario baja 7 años
   pero la primera coincidencia es la que manda: antes de esa fecha
   simplemente no veian nada juntos. */
const loNuestro = (juntas, hoy, cache) => {
    if (!juntas.length) return null;
    const orden = [...juntas].sort((a, b) => a.visto.localeCompare(b.visto));
    const primera = orden[0];

    const conNota = juntas.filter((f) => f.notas[0] != null && f.notas[1] != null);
    const cerca = conNota.filter((f) => Math.abs(f.notas[0] - f.notas[1]) <= 0.5).length;
    /* el paso de letterboxd ES media estrella, asi que "a media estrella"
       incluye notas vecinas. las clavadas son otra cosa y hay que decirlo */
    const clavadas = conNota.filter((f) => f.notas[0] === f.notas[1]).length;
    const brecha = conNota.length
        ? conNota.reduce((t, f) => t + Math.abs(f.notas[0] - f.notas[1]), 0) / conNota.length
        : null;

    const minutos = juntas.reduce((t, f) => t + (cache[f.k]?.minutos ?? 0), 0);
    const sinDuracion = juntas.filter((f) => !cache[f.k]?.minutos).length;

    /* las que les volaron la cabeza a los dos */
    const todasAmadas = conNota
        .filter((f) => f.notas[0] >= 4.5 && f.notas[1] >= 4.5)
        .sort((a, b) => (b.notas[0] + b.notas[1]) - (a.notas[0] + a.notas[1]) || b.visto.localeCompare(a.visto));
    const amadas = todasAmadas.slice(0, 12).map((f) => ({ ...f, m: cache[f.k] ?? {} }));

    /* semanas seguidas con al menos una: la racha de a dos */
    const semanas = [...new Set(orden.map((f) => semanaDe(f.visto)))].sort();
    let mejor = 1, corrida = 1;
    for (let i = 1; i < semanas.length; i++) {
        corrida = semanas[i] - semanas[i - 1] === 1 ? corrida + 1 : 1;
        if (corrida > mejor) mejor = corrida;
    }

    /* la que sigue abierta: cuenta hacia atras desde esta semana, o desde
       la pasada si todavia no vieron nada esta */
    const semHoy = semanaDe(hoy.toISOString().slice(0, 10));
    const puestas = new Set(semanas);
    let viva = 0;
    for (let sem = puestas.has(semHoy) ? semHoy : semHoy - 1; puestas.has(sem); sem--) viva++;

    const pa = new Date(primera.visto + "T00:00:00");
    /* comparar contra hoy CON hora hacia que el 22 de junio a las 14hs ya
       contara como pasado y saltara un año entero: el aniversario se
       salteaba a si mismo */
    const hoySolo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    let prox = new Date(hoy.getFullYear(), pa.getMonth(), pa.getDate());
    if (prox < hoySolo) prox = new Date(hoy.getFullYear() + 1, pa.getMonth(), pa.getDate());

    const porAnio = {};
    for (const f of juntas) porAnio[f.visto.slice(0, 4)] = (porAnio[f.visto.slice(0, 4)] ?? 0) + 1;

    return {
        total: juntas.length,
        primera: { ...primera, m: cache[primera.k] ?? {} },
        desde: Math.round((hoy - pa) / MS_DIA),
        horas: Math.round(minutos / 60),
        diasDePantalla: +(minutos / 1440).toFixed(1),
        sintonia: conNota.length ? Math.round((cerca / conNota.length) * 100) : null,
        clavadas: conNota.length ? Math.round((clavadas / conNota.length) * 100) : null,
        brecha: brecha != null ? +brecha.toFixed(2) : null,
        puntuadas: conNota.length,
        amadas,
        amadasTotal: todasAmadas.length,
        /* el panel es de toda la historia: la lista tambien. antes salia
           de delAnio y quedaba recortada al año calendario en curso */
        ultimas: [...juntas].sort((a, b) => b.visto.localeCompare(a.visto)).slice(0, 6),
        sinDuracion,
        racha: mejor,
        rachaViva: viva,
        aniversario: {
            fecha: prox.toISOString().slice(0, 10),
            faltan: Math.round((prox - hoySolo) / MS_DIA),
            numero: prox.getFullYear() - pa.getFullYear(),
            esHoy: prox.getTime() === hoySolo.getTime(),
        },
        porAnio,
        anios: aniosConRitmo(porAnio, primera.visto, hoy),
    };
};

/* cada año con los dias que REALMENTE tuvo disponibles: 2023 arranco el
   dia de la primera juntos, y el año en curso va hasta hoy. sin esto un
   año a medio andar compite de igual a igual contra uno entero. */
const aniosConRitmo = (porAnio, primeraISO, hoy) => {
    const hoyISO = hoy.toISOString().slice(0, 10);
    return Object.entries(porAnio).sort().map(([a, n]) => {
        const desde = a === primeraISO.slice(0, 4) ? primeraISO : a + "-01-01";
        const hasta = a === String(hoy.getFullYear()) ? hoyISO : a + "-12-31";
        const dias = Math.round((new Date(hasta) - new Date(desde)) / MS_DIA) + 1;
        const enCurso = a === String(hoy.getFullYear());
        return {
            anio: a, total: n, dias, parcial: dias < 365,
            cada: n ? +(dias / n).toFixed(1) : null,
            proyeccion: enCurso && n ? Math.round((n / dias) * 365) : null,
            enCurso,
        };
    });
};

/* numero de semana absoluto arrancando el lunes. dividir el epoch por
   7 dias no sirve: el 1/1/1970 fue jueves, asi que las "semanas" iban
   de jueves a miercoles y partian rachas reales al medio. */
const semanaDe = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return Math.round(d.getTime() / (MS_DIA * 7));
};

export const armarJuntos = ({ ronda = 0, modo = "comun", rechazadas = {}, votos = {}, jugadas = [], quien = null, hoy = new Date() } = {}) => {
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

    /* 1. los dos la quieren ver.
       esto no se barajaba: salia ordenado por streaming y nada mas, asi
       que el primero de la lista era el mismo todos los dias. */
    const enComun = conStreamPrimero(A.watchlist.filter((f) => wlB.has(clave(f.nombre, f.anio)))).filter(vivo);
    /* las que se pueden ver hoy van adelante, pero rotando entre ellas.
       las que no estan en streaming rotan tambien: eran 29 de 34 y salian
       siempre en el mismo orden, asi que despues de las 5 mirables venian
       las mismas tres todos los dias */
    const comun = [
        ...ordenDelDia(enComun.filter(mirable), hoy, "!comun"),
        ...ordenDelDia(enComun.filter((f) => !mirable(f)), hoy, "!comun-resto"),
    ];

    /* 2. duelo: una de cada watchlist que el otro no vio */
    const soloA = A.watchlist.filter((f) => !wlB.has(clave(f.nombre, f.anio)) && !B.vistas.has(clave(f.nombre, f.anio))).filter(vivo);
    const soloB = B.watchlist.filter((f) => !wlA.has(clave(f.nombre, f.anio)) && !A.vistas.has(clave(f.nombre, f.anio))).filter(vivo);

    const semilla = `${diaDe(hoy)}#${ronda}`;
    const mejoresDe = (arr) => barajar(conStreamPrimero(arr).slice(0, 40), semilla);
    const duelo = [mejoresDe(soloA)[0] ?? null, mejoresDe(soloB)[0] ?? null];

    /* 3. te la debo: uno le puso 4+ y el otro no la vio.
       las dos direcciones se intercalan, no se concatenan: pegar una
       lista despues de la otra y recortar arriba dejaba afuera al
       segundo entero (el mismo error que tenia el bolillero). */
    const porDireccion = [[A, B], [B, A]].map(([uno, otro]) => {
        const suyas = [];
        for (const f of otro.watchlist) {
            const nota = uno.notas.get(clave(f.nombre, f.anio));
            if (nota >= 4 && vivo(f)) suyas.push({ ...f, recomienda: uno.nombre, nota, para: otro.nombre });
        }
        return suyas.sort((x, y) => y.nota - x.nota || mirable(y) - mirable(x));
    });

    const debo = intercalar(porDireccion);

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

    /* 5. ruleta: de donde sale depende del modo que estes mirando.
       ojo con el bolillero de las watchlists sueltas: concatenar y
       recortar dejaba SIEMPRE afuera al segundo, porque el sort es
       estable y las del primero quedaban todas adelante. hay que tomar
       de a mitades y recien despues barajar.
       y el azar tiene que ser azar: con la semilla del dia, abrir la app
       y girar daba siempre la misma, y el bolillero eran las 15 mas faciles
       de cada lado, las mismas 30 siempre. ahora entra todo lo que se puede
       ver de las dos watchlists y cada pedido baraja distinto. */
    const suerte = Math.random().toString(36).slice(2);
    const paraGirar = (arr) => {
        const si = arr.filter(mirable);
        return si.length >= 10 ? si : conStreamPrimero(arr);
    };
    const bolillero = modo === "comun" && comun.length ? comun
        : modo === "revancha" && revancha.length ? revancha
        : [...paraGirar(soloA), ...paraGirar(soloB)];
    const giro = barajar(bolillero, `${suerte}!ruleta`);

    /* 6. match: cada uno vota desde su telefono sin ver lo del otro, y
       cuando los dos dijeron que si, es match. el mazo es el mismo para
       los dos (se baraja por semana) y lo que el otro ya aprobo se
       intercala adelante: si no, podian pasar semanas sin coincidir.
       lo que el otro rechazo no se muestra, ya no puede ser match. */
    const usuarios = datos.map((d) => d.usuario);
    const otro = usuarios.find((u) => u !== quien);
    const votoDe = (f, u) => votos[clave(f.nombre, f.anio)]?.[u];
    const mazo = barajar([...paraGirar(soloA), ...paraGirar(soloB)], `${semanaDe(hoy.toISOString().slice(0, 10))}!match`);
    const pendientes = usuarios.includes(quien)
        ? mazo.filter((f) => votoDe(f, quien) === undefined && votoDe(f, otro) !== 0)
        : [];
    const porClave = new Map([...A.watchlist, ...B.watchlist].map((f) => [clave(f.nombre, f.anio), f]));
    const match = {
        mazo: intercalar([
            pendientes.filter((f) => votoDe(f, otro) === 1),
            pendientes.filter((f) => votoDe(f, otro) === undefined),
        ]).slice(0, 8),
        /* si ya la vio alguno sale de la watchlist, y del match con ella */
        matches: Object.entries(votos)
            .filter(([k, v]) => v.match && porClave.has(k))
            .sort(([, a], [, b]) => b.match.localeCompare(a.match))
            .map(([k, v]) => ({ ...porClave.get(k), desde: v.match })),
        votados: Object.fromEntries(usuarios.map((u) => [u, Object.values(votos).filter((v) => v[u] !== undefined).length])),
    };

    const juntas = verJuntas(A.diario ?? [], B.diario ?? [], hoy, cache);

    /* 7. ¿cuanto le puso?: el perfil de cada uno, que lo ven los dos. se
       calcula aca con las notas de verdad: el telefono solo manda lo que
       dijo, asi que si alguien le cambia la nota a una peli el historial
       se corrige solo */
    const puntuada = new Map(juntas.puntuadas.map((f) => [clave(f.nombre, f.anio), f]));
    const media = (xs) => (xs.length ? +(xs.reduce((t, x) => t + x, 0) / xs.length).toFixed(2) : null);
    const acierta = (x) => Math.abs(x.error) <= 0.5;
    const juego = datos.map((d, i) => {
        const suyas = jugadas
            .filter((j) => j.quien === d.usuario && puntuada.has(j.k))
            .sort((a, b) => String(a.en).localeCompare(String(b.en)))
            .map((j) => {
                const f = puntuada.get(j.k);
                const real = f.notas[1 - i];
                return { nombre: f.nombre, anio: f.anio, poster: f.poster, dijo: j.dijo, real, error: j.dijo - real };
            });
        let racha = 0;
        for (let n = suyas.length - 1; n >= 0 && acierta(suyas[n]); n--) racha++;
        let mejor = 0, corrida = 0;
        for (const x of suyas) mejor = Math.max(mejor, (corrida = acierta(x) ? corrida + 1 : 0));
        const peor = [...suyas].reverse().sort((a, b) => Math.abs(b.error) - Math.abs(a.error))[0];
        return {
            usuario: d.usuario,
            nombre: d.nombre,
            adivinaA: datos[1 - i].nombre,
            jugadas: suyas.length,
            clavadas: suyas.filter((x) => x.error === 0).length,
            casi: suyas.filter((x) => Math.abs(x.error) === 0.5).length,
            acierto: suyas.length ? Math.round((suyas.filter(acierta).length / suyas.length) * 100) : null,
            racha,
            mejor,
            errorMedio: media(suyas.map((x) => Math.abs(x.error))),
            /* positivo: cree que el otro pone mas estrellas de las que pone */
            sesgo: media(suyas.map((x) => x.error)),
            peor: peor && Math.abs(peor.error) >= 1.5 ? peor : null,
            /* "en cuales le erro mas": una por peli, la peor vez, y solo las
               de una estrella o mas (media estrella es casi, no error) */
            errores: [...new Map([...suyas]
                .sort((a, b) => Math.abs(a.error) - Math.abs(b.error))
                .map((x) => [clave(x.nombre, x.anio), x])).values()]
                .filter((x) => Math.abs(x.error) >= 1)
                .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
                .slice(0, 12),
            ultimas: suyas.slice(-10).map(acierta),
            /* para no repetirle las ultimas que le tocaron */
            recientes: suyas.slice(-40).map((x) => clave(x.nombre, x.anio)),
        };
    });

    /* el dato que hace que el panel exista: de todo lo que vio cada uno
       desde que empezaron, cuanto fue con el otro */
    if (juntas.vida) {
        const desde = juntas.vida.primera.visto;
        juntas.vida.solapamiento = datos.map((d) => {
            const propias = (d.diario ?? []).filter((f) => f.visto >= desde).length;
            return {
                nombre: d.nombre,
                propias,
                pct: propias ? Math.round((juntas.vida.total / propias) * 100) : 0,
            };
        });
    }

    return {
        personas, datos, comun, duelo, debo, revancha, giro, juntas, match, juego,
        ritmos: datos.map((d) => ({ nombre: d.nombre, usuario: d.usuario, vistas: d.ritmo.vistas, meta: d.ritmo.meta, alDia: d.ritmo.alDia, deficit: d.ritmo.deficit })),
        totales: {
            comun: comun.length,
            comunDisponibles: comun.filter(mirable).length,
            duelo: soloA.length + soloB.length,
            debo: debo.length,
            revancha: revancha.length,
            nuestro: juntas.vida?.total ?? 0,
            match: match.matches.length,
            adivina: juntas.puntuadas.length,
        },
    };
};
