import { manejarEstado } from "../src/handler.js";
import { armarMensaje, botones, enviar, leerChats } from "../src/telegram.js";

/* lo dispara el cron de vercel. si estas al dia y no hay nada urgente,
   no manda nada: un bot que insiste se silencia en una semana */
export default async function handler(req, res) {
    /* vercel manda este header en cada corrida del cron. sin esto el
       endpoint es publico y cualquiera te puede hacer spam */
    const secreto = process.env.CRON_SECRET;
    const q = new URL(req.url, "http://x").searchParams;
    const autorizado = !secreto
        || req.headers.authorization === `Bearer ${secreto}`
        || q.get("k") === secreto;
    if (!autorizado) return res.status(401).json({ error: "no autorizado" });

    const forzar = q.get("forzar") === "1";
    const chats = await leerChats();
    const salida = [];

    for (const [chat, usuario] of Object.entries(chats)) {
        try {
            const p = await manejarEstado({ usuario });
            const motivo = porQueEscribir(p, forzar);
            if (!motivo) { salida.push(`${usuario}: callado`); continue; }

            await enviar(chat, armarMensaje(p), botones(p.sugerencia));
            salida.push(`${usuario}: ${motivo}`);
        } catch (e) {
            salida.push(`${usuario}: fallo — ${e.message}`);
        }
    }
    res.status(200).json({ ok: true, salida });
}

const porQueEscribir = (p, forzar) => {
    if (forzar) return "forzado";
    if (p.dormido) return null;
    if (p.plan) return null;
    if (p.ritmo.vioHoy) return null;
    if (p.retos?.some((t) => t.completado)) return "cumpliste un reto";
    if (p.cumplidoReciente) return "viste la que planificaste";
    if (!p.ritmo.alDia) return "vas atrasado";
    return "sugerencia del dia";
};
