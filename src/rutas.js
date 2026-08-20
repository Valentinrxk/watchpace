import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* en serverless el cwd no es la raiz del proyecto: todo path a archivo
   se resuelve contra este modulo, no contra process.cwd() */
export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

export const enRaiz = (...partes) => join(RAIZ, ...partes);
