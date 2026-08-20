import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { construirPayload, porPersona, porPelicula } from "./api.js";
import { manejarEstado } from "./handler.js";
import { cargarExport, claveEntrada, clave } from "./letterboxd.js";
import { sincronizar, sincronizarWatchlist } from "./sync.js";
import { CONFIG } from "./config.js";
import { enRaiz } from "./rutas.js";

const PUERTO = Number(process.env.PORT) || 4321;
const WEB = enRaiz("web");

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

const correrSync = async ({ conWatchlist = true } = {}) => {
    const { diario, watchlist } = cargarExport(CONFIG.dirDatos);
    const r = await sincronizar({ yaConocidas: new Set(diario.map(claveEntrada)) });

    if (conWatchlist) {
        const w = await sincronizarWatchlist({
            fechasConocidas: new Map(watchlist.map((f) => [clave(f.nombre, f.anio), f.agregada])),
        });
        r.watchlist = w;
        console.log(w.ok
            ? `  [watchlist] ${w.total} en total · ${w.agregadas.length} agregada${w.agregadas.length === 1 ? "" : "s"} · ${w.sacadas.length} sacada${w.sacadas.length === 1 ? "" : "s"}`
            : `  [watchlist] fallo: ${w.error}`);
    }
    const detalle = r.ok
        ? `${r.nuevas.length} nueva${r.nuevas.length === 1 ? "" : "s"}${r.nuevas.length ? ": " + r.nuevas.map((f) => f.nombre).join(", ") : ""}`
        : `fallo: ${r.error}`;
    console.log(`  [sync] ${new Date().toLocaleTimeString("es-AR")} - ${detalle}`);
    return r;
};

createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
        if (url.pathname === "/api/estado") {
            const cuerpo = req.method === "POST" ? await cuerpoDe(req) : {};
            const min = url.searchParams.get("minutos");
            return json(res, manejarEstado({ ...cuerpo, minutos: cuerpo.minutos ?? (min ? Number(min) : null) }, { persistir: true }));
        }

        if (url.pathname === "/api/sync" && req.method === "POST") {
            const r = await correrSync();
            const min = url.searchParams.get("minutos");
            return json(res, { ...manejarEstado({ minutos: min ? Number(min) : null }, { persistir: true }), resultadoSync: r });
        }

        if (url.pathname === "/api/persona") {
            const id = url.searchParams.get("id");
            return id ? json(res, porPersona(id)) : json(res, { error: "falta id" }, 400);
        }

        if (url.pathname === "/api/pelicula") {
            const n = url.searchParams.get("nombre"), a = url.searchParams.get("anio");
            return n && a ? json(res, porPelicula(n, a)) : json(res, { error: "faltan datos" }, 400);
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
