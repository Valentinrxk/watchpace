import { manejarEstado } from "../src/handler.js";
import {
    armarMensaje, botones, editar, enviar, responderBoton,
    secretoOk, usuarioDe, vincular, listaUsuarios,
} from "../src/telegram.js";

const leerCuerpo = (req) =>
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

const AYUDA = [
    "*watchpace*",
    "",
    "/hoy — qué ver hoy",
    "/estado — cómo vas con la meta",
    "/retos — los tres de arriba",
    "/soy `usuario` — vincular esta cuenta \\(ej\\: /soy valentinrxk\\)",
].join("\n");

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();
    if (!secretoOk(req)) return res.status(401).end();

    /* el trabajo va ANTES de responder: en serverless la funcion se
       congela apenas mandas la respuesta y el await queda sin correr */
    const u = leerCuerpo(req);
    try {
        if (u.message?.text) await mensaje(u.message);
        else if (u.callback_query) await boton(u.callback_query);
        res.status(200).json({ ok: true });
    } catch (e) {
        console.error("telegram:", e.stack ?? e.message);
        res.status(200).json({ ok: false, error: e.message });
    }
}

const mensaje = async (m) => {
    const chat = m.chat.id;
    const texto = m.text.trim();

    if (/^\/soy/i.test(texto)) {
        const pedido = texto.split(/\s+/)[1];
        const existe = listaUsuarios().find((x) => x.usuario === pedido);
        if (!existe) {
            const nombres = listaUsuarios().map((x) => `\`${x.usuario}\``).join(", ");
            return enviar(chat, `no conozco a ese\\. tengo: ${nombres}`);
        }
        await vincular(chat, existe.usuario);
        return enviar(chat, `listo, sos *${existe.nombre}*\\. mandá /hoy`);
    }

    const quien = await usuarioDe(chat);
    if (!quien) return enviar(chat, `no sé quién sos todavía\\.\n\n${AYUDA}`);

    if (/^\/(start|help|ayuda)/i.test(texto)) return enviar(chat, AYUDA);

    if (/^\/estado/i.test(texto)) {
        const p = await manejarEstado({ usuario: quien.usuario });
        const r = p.ritmo;
        return enviar(chat, [
            `*${r.vistas}/${r.meta}* · ${r.alDia ? `${-r.deficit} adelantado` : `${r.deficit} atrasado`}`,
            `faltan ${r.faltan} en ${r.restantes} días`,
            `proyección: ${r.proyeccion} · watchlist: ${r.pendientes}`,
        ].join("\n"));
    }

    if (/^\/retos/i.test(texto)) {
        const p = await manejarEstado({ usuario: quien.usuario });
        const tres = p.retos.slice(0, 3).map((t) => `• *${t.titulo.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)}* — ${t.progreso}/${t.objetivo}`);
        return enviar(chat, tres.join("\n") || "sin retos");
    }

    const p = await manejarEstado({ usuario: quien.usuario });
    return enviar(chat, armarMensaje(p), botones(p));
};

const boton = async (q) => {
    const chat = q.message.chat.id;
    const quien = await usuarioDe(chat);
    if (!quien) return responderBoton(q.id, "mandá /soy usuario primero");

    const [accion, dato] = String(q.data).split("|");
    const args = { usuario: quien.usuario };

    if (accion === "min") args.minutos = dato ? Number(dato) : null;
    else { args.accion = accion; args.nombre = dato; }

    const p = await manejarEstado(args);

    const avisos = { acepto: "anotada", otra: "va otra", "hoy-no": "listo, mañana vemos" };
    await responderBoton(q.id, avisos[accion] ?? "");

    if (accion === "acepto") {
        return editar(chat, q.message.message_id, `✓ *${String(dato).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)}* — anotada para hoy`);
    }
    if (accion === "hoy-no") {
        return editar(chat, q.message.message_id, "listo, no te jodo más por hoy\\.");
    }
    return editar(chat, q.message.message_id, armarMensaje(p), botones(p));
};
