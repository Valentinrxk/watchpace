import { construirPayload, reducir, leerEstado, guardarEstado } from "./api.js";

/* un solo endpoint para leer y para actuar.
   local: manda el disco (el cli y la web comparten estado).
   serverless: manda el estado que trae el cliente, no hay disco. */
export const manejarEstado = (cuerpo = {}, { persistir = false } = {}) => {
    const { minutos = null, estado = null, accion = null, nombre, retoId } = cuerpo;

    const base = persistir ? leerEstado() : (estado ?? {});
    const nuevo = accion ? reducir(base, { accion, nombre, retoId }) : base;
    if (persistir && accion) guardarEstado(nuevo);

    return { ...construirPayload({ minutos, estado: nuevo }), estado: nuevo };
};
