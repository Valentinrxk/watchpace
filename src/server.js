import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { construirPayload, porPersona, porPelicula } from "./api.js";
import { manejarEstado } from "./handler.js";
import { CONFIG } from "./config.js";
import { enRaiz } from "./rutas.js";

const PUERTO = Number(process.env.PORT) || 4321;
const WEB = enRaiz("public");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };

const json = (res, data, code = 200) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
};

const cuerpoDe = (req) =>
    new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => {
            try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); }
        });
    });

const HORAS_SYNC = 6;

const correrSync = async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    try {
        const { stdout } = await promisify(execFile)(process.execPath, [enRaiz("scripts", "sync.mjs")], { cwd: enRaiz(), timeout: 1800000 });
        const lineas = stdout.trim().split(/\r?\n/);
        lineas.forEach((l) => console.log(`  ${l}`));
        return { ok: true, salida: lineas };
    } catch (e) {
        const motivo = String(e.message).split(/\r?\n/)[0];
        console.log(`  [sync] fallo: ${motivo}`);
        return { ok: false, error: motivo };
    }
};

createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
        if (url.pathname === "/api/estado") {
            const cuerpo = req.method === "POST" ? await cuerpoDe(req) : {};
            const min = url.searchParams.get("minutos");
            return json(res, await manejarEstado({ ...cuerpo, minutos: cuerpo.minutos ?? (min ? Number(min) : null) }, { persistir: true }));
        }

        if (url.pathname === "/api/sync" && req.method === "POST") {
            const r = await correrSync();
            const min = url.searchParams.get("minutos");
            return json(res, { ...await manejarEstado({ minutos: min ? Number(min) : null }, { persistir: true }), resultadoSync: r });
        }

        if (url.pathname === "/api/persona") {
            const id = url.searchParams.get("id");
            return id ? json(res, porPersona(id, url.searchParams.get("u"))) : json(res, { error: "falta id" }, 400);
        }

        if (url.pathname === "/api/pelicula") {
            const n = url.searchParams.get("nombre"), a = url.searchParams.get("anio");
            return n && a ? json(res, porPelicula(n, a, url.searchParams.get("u"))) : json(res, { error: "faltan datos" }, 400);
        }

        const rel = url.pathname === "/" ? "index.html" : normalize(url.pathname).replace(/^[/\\]+/, "");
        const archivo = join(WEB, rel);
        if (!archivo.startsWith(WEB) || !existsSync(archivo)) {
            res.writeHead(404);
            return res.end("no esta");
        }
        res.writeHead(200, { "content-type": MIME[extname(archivo)] ?? "application/octet-stream" });
        res.end(readFileSync(archivo));
    } catch (e) {
        json(res, { error: e.message }, 500);
    }
}).listen(PUERTO, () => {
    console.log(`\n  watchpace  ->  http://localhost:${PUERTO}\n`);
    correrSync().catch((e) => console.log(`  [sync] no arranco: ${e.message}`));
    setInterval(() => correrSync().catch((e) => console.log(`  [sync] fallo: ${e.message}`)), HORAS_SYNC * 3600 * 1000);
});
