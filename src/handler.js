import { construirPayload, construirJuntos, reducir, leerEstado, guardarEstado } from "./api.js";
import { hayKV, leerRemoto, guardarRemoto, leerSyncRemoto } from "./estado-remoto.js";
import { CONFIG } from "./config.js";

/* un solo endpoint para leer y para actuar.
   con kv: el estado vive al lado de la app y es el mismo desde cualquier
   dispositivo. sin kv: disco en local, y el navegador en serverless. */
export const manejarEstado = async (cuerpo = {}, { persistir = false } = {}) => {
    const { minutos = null, estado: delCliente = null, accion = null, nombre, retoId } = cuerpo;
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

    const nuevo = accion ? reducir(base, { accion, nombre, retoId }) : base;

    if (accion || (modo === "kv" && !(await leerRemoto(usuario)))) {
        if (modo === "kv") await guardarRemoto(usuario, nuevo);
        else if (persistir) guardarEstado(nuevo);
    }

    const payload = usuario === "juntos"
        ? construirJuntos({ estado: nuevo })
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
