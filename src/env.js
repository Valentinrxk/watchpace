import { existsSync, readFileSync } from "node:fs";
import { enRaiz } from "./rutas.js";

export const cargarEnv = (ruta = enRaiz(".env")) => {
    if (!existsSync(ruta)) return;
    for (const l of readFileSync(ruta, "utf8").split("\n")) {
        const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "").trim();
    }
};
