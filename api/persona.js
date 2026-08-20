import { porPersona } from "../src/api.js";

export default async function handler(req, res) {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (!id) return res.status(400).json({ error: "falta id" });
    try {
        res.setHeader("cache-control", "public, max-age=300");
        res.status(200).json(porPersona(id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
