import { construirPayload, construirJuntos, reducir, leerEstado, guardarEstado } from "./api.js";
import {
    hayKV, leerRemoto, guardarRemoto, leerSyncRemoto,
    votarRemoto, leerVotosRemotos, anotarJugadaRemota, leerJugadasRemotas,
} from "./estado-remoto.js";
import { CONFIG } from "./config.js";
import { clave } from "./letterboxd.js";

const USUARIOS = CONFIG.usuarios.map((u) => u.usuario);

/* voto del match y jugada de "¿cuanto le puso?": con kv van por su lado,
   atomicos (ver estado-remoto.js). si no hay kv, o kv fallo, caen al
   estado de juntos como cualquier otra accion. */
const accionAtomica = async ({ accion, nombre, anio, quien, valor }) => {
    if (!USUARIOS.includes(quien) || !nombre || !anio) return false;
    const k = clave(nombre, Number(anio));
    if (accion === "voto") return votarRemoto(k, quien, String(valor) === "1" ? 1 : 0, USUARIOS.filter((u) => u !== quien));
    if (accion === "adivino") return anotarJugadaRemota(quien, { k, dijo: Number(valor), en: new Date().toISOString() });
    return false;
};

/* lo de kv se suma a lo que haya quedado en el estado */
const conLoDeKV = async (estado) => {
    const [votos, jugadas] = await Promise.all([leerVotosRemotos(), leerJugadasRemotas(USUARIOS)]);
    const todos = { ...(estado.votos ?? {}) };
    for (const [k, v] of Object.entries(votos ?? {})) todos[k] = { ...todos[k], ...v };
    return { ...estado, votos: todos, jugadas: [...(estado.jugadas ?? []), ...(jugadas ?? [])] };
};

/* un solo endpoint para leer y para actuar.
   con kv: el estado vive al lado de la app y es el mismo desde cualquier
   dispositivo. sin kv: disco en local, y el navegador en serverless. */
export const manejarEstado = async (cuerpo = {}, { persistir = false } = {}) => {
    const { minutos = null, estado: delCliente = null, accion = null, nombre, retoId, anio = null, quien = null, valor = null } = cuerpo;
    const usuario = cuerpo.usuario || CONFIG.usuario;

    let base;
    let modo;
    if (hayKV()) {
        modo = "kv";
        /* si kv esta vacio pero el navegador trae algo, lo adoptamos:
           asi no se pierde lo que ya habias hecho antes de conectar kv */
        base = (await leerRemoto(usuario)) ?? delCliente ?? {};
    } else if (persistir) {
        modo = "disco";
        base = leerEstado();
    } else {
        modo = "navegador";
        base = delCliente ?? {};
    }

    const atomica = modo === "kv" && usuario === "juntos" && accion
        ? await accionAtomica({ accion, nombre, anio, quien, valor })
        : false;
    const nuevo = accion && !atomica ? reducir(base, { accion, nombre, retoId, anio, quien, valor }) : base;

    if ((accion && !atomica) || (modo === "kv" && !(await leerRemoto(usuario)))) {
        if (modo === "kv") await guardarRemoto(usuario, nuevo);
        else if (persistir) guardarEstado(nuevo);
    }

    const payload = usuario === "juntos"
        ? construirJuntos({ estado: modo === "kv" ? await conLoDeKV(nuevo) : nuevo, quien })
        : construirPayload({ minutos, estado: nuevo, usuario });

    /* en vercel el disco es el del deploy: la marca que dejo el sync de
       las 14:17 no esta ahi, esta en kv. sin esto el header muestra la
       fecha del ultimo deploy y parece que hace dias que no sincroniza. */
    const marca = payload.sync && hayKV() ? await leerSyncRemoto() : null;
    const sync = marca
        ? { ...payload.sync, ultima: marca.ultima ?? payload.sync.ultima, ultimoIntento: marca.ultimoIntento ?? payload.sync.ultimoIntento, error: marca.error ?? null }
        : payload.sync;

    return { ...payload, ...(payload.sync ? { sync } : {}), estado: nuevo, modoEstado: modo };
};
