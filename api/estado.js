import { manejarEstado } from "../src/handler.js";

export default async function handler(req, res) {
    const cuerpo = req.method === "POST"
        ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {})
        : Object.fromEntries(new URL(req.url, "http://x").searchParams);

    try {
        res.setHeader("cache-control", "no-store");
        res.status(200).json(manejarEstado({ ...cuerpo, minutos: cuerpo.minutos ? Number(cuerpo.minutos) : null }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
