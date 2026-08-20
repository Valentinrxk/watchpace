import { construirPayload, reducir, leerEstado, guardarEstado } from "./api.js";
import { hayKV, leerRemoto, guardarRemoto } from "./estado-remoto.js";
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

    return { ...construirPayload({ minutos, estado: nuevo, usuario }), estado: nuevo, modoEstado: modo };
};
