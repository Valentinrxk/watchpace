import { porPelicula } from "../src/api.js";

export default async function handler(req, res) {
    const q = new URL(req.url, "http://x").searchParams;
    const nombre = q.get("nombre"), anio = q.get("anio");
    if (!nombre || !anio) return res.status(400).json({ error: "faltan datos" });
    try {
        res.setHeader("cache-control", "public, max-age=300");
        res.status(200).json(porPelicula(nombre, anio, q.get("u")));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
