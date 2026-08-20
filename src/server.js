import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { construirPayload, aplicarAccion, porPersona, porPelicula } from "./api.js";

const PUERTO = Number(process.env.PORT) || 4321;
const WEB = "web";

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };

const json = (res, data, code = 200) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
};

const cuerpo = (req) =>
    new Promise((resolve) => {
        let d = "";
        req.on("data", (c) => (d += c));
        req.on("end", () => {
            try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); }
        });
    });

createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
        if (url.pathname === "/api/estado") {
            const min = url.searchParams.get("minutos");
            return json(res, construirPayload({ minutos: min ? Number(min) : null }));
        }

        if (url.pathname === "/api/persona") {
            const id = url.searchParams.get("id");
            return id ? json(res, porPersona(id)) : json(res, { error: "falta id" }, 400);
        }

        if (url.pathname === "/api/pelicula") {
            const n = url.searchParams.get("nombre"), a = url.searchParams.get("anio");
            return n && a ? json(res, porPelicula(n, a)) : json(res, { error: "faltan datos" }, 400);
        }

        if (url.pathname === "/api/accion" && req.method === "POST") {
            aplicarAccion(await cuerpo(req));
            const min = url.searchParams.get("minutos");
            return json(res, construirPayload({ minutos: min ? Number(min) : null }));
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
}).listen(PUERTO, () => console.log(`\n  watchpace  ->  http://localhost:${PUERTO}\n`));
