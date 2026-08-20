import { cargarTodos } from "./env.js";
import { hayKV, leerRemoto, guardarRemoto } from "./estado-remoto.js";
import { usuariosConfigurados, configDe } from "./usuarios.js";

cargarTodos();

const TOKEN = () => process.env.TELEGRAM_TOKEN;
const SECRETO = () => process.env.TELEGRAM_SECRETO ?? "";

export const hayTelegram = () => Boolean(TOKEN());

const api = async (metodo, cuerpo) => {
    if (!TOKEN()) throw new Error("falta TELEGRAM_TOKEN");
    const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${metodo}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`telegram ${metodo}: ${j.description}`);
    return j.result;
};

/* quien es quien: chat de telegram -> usuario de letterboxd.
   vive en kv para que no haya que redeployar al sumar a alguien */
const LLAVE_CHATS = "watchpace:chats";

export const leerChats = async () => {
    if (!hayKV()) return {};
    try {
        const v = await leerRemoto("__chats__");
        return v ?? {};
    } catch {
        return {};
    }
};

export const guardarChats = (chats) => guardarRemoto("__chats__", chats);

export const vincular = async (chatId, usuario) => {
    const chats = await leerChats();
    chats[String(chatId)] = usuario;
    await guardarChats(chats);
    return chats;
};

const esc = (t) =>
    String(t ?? "").replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);

export const armarMensaje = (p) => {
    const r = p.ritmo;
    const f = p.sugerencia;

    const cabeza = r.alDia
        ? `*${r.vistas}/${r.meta}* · ${-r.deficit} adelantado`
        : `*${r.vistas}/${r.meta}* · ${r.deficit} atrasado`;

    const donde = f.dondeTipo === "sub" || f.dondeTipo === "gratis"
        ? f.donde.join(", ")
        : f.dondeTipo === "alquiler" ? "solo alquiler"
        : f.dondeTipo === "addon" ? "add\\-on aparte" : "no está en streaming";

    const partes = [
        `${esc(p.nombre)} — ${cabeza}`,
        "",
        `*${esc(f.nombre)}* \\(${f.anio}\\)`,
        `${f.minutos ? `${f.minutos} min · ` : ""}${esc((f.generos ?? []).join("/"))}${f.director ? ` · ${esc(f.director)}` : ""}`,
        `${f.puntaje ? `⭐ ${esc(String(f.puntaje))} · ` : ""}${esc(donde)}`,
    ];

    if (f.sinopsis) partes.push("", `_${esc(f.sinopsis.slice(0, 220))}${f.sinopsis.length > 220 ? "…" : ""}_`);

    const logro = p.retos?.find((t) => t.completado);
    if (logro) partes.push("", `🏁 *cumpliste:* ${esc(logro.titulo)}`);
    if (p.cumplidoReciente) partes.push("", `✓ viste ${esc(p.cumplidoReciente.pelicula)}, la que habías planificado`);

    return partes.join("\n");
};

export const botones = (f) => ({
    inline_keyboard: [
        [
            { text: "▶ dale", callback_data: `acepto|${f.nombre}`.slice(0, 64) },
            { text: "🔀 otra", callback_data: `otra|${f.nombre}`.slice(0, 64) },
            { text: "✋ hoy no", callback_data: "hoy-no|" },
        ],
        [
            { text: "90 min", callback_data: "min|90" },
            { text: "2 horas", callback_data: "min|120" },
            { text: "cualquiera", callback_data: "min|" },
        ],
    ],
});

export const enviar = (chatId, texto, teclado) =>
    api("sendMessage", {
        chat_id: chatId,
        text: texto,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
        ...(teclado ? { reply_markup: teclado } : {}),
    });

export const editar = (chatId, messageId, texto, teclado) =>
    api("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: texto,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
        ...(teclado ? { reply_markup: teclado } : {}),
    });

export const responderBoton = (id, texto) =>
    api("answerCallbackQuery", { callback_query_id: id, text: texto ?? "" });

export const registrarWebhook = (url) =>
    api("setWebhook", {
        url,
        secret_token: SECRETO() || undefined,
        allowed_updates: ["message", "callback_query"],
    });

export const verWebhook = () => api("getWebhookInfo", {});

export const secretoOk = (req) =>
    !SECRETO() || req.headers["x-telegram-bot-api-secret-token"] === SECRETO();

export const usuarioDe = async (chatId) => {
    const chats = await leerChats();
    const u = chats[String(chatId)];
    return u ? configDe(u) : null;
};

export const listaUsuarios = () => usuariosConfigurados();
