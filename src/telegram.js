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

    const cabecera = r.alDia
        ? `${esc(p.nombre)} — *${r.vistas}/${r.meta}* · ${-r.deficit} adelantado`
        : `${esc(p.nombre)} — *${r.vistas}/${r.meta}* · ${r.deficit} atrasado`;

    /* la web tiene tres estados y el bot tiene que respetarlos: si ya
       elegiste, no te ofrezco otra cosa */
    const NL = "\n";
    if (p.plan) {
        return [cabecera, "", `📌 *${esc(p.plan.nombre)}*`, "", "_es tu plan de hoy_"].join(NL);
    }
    if (p.dormido) {
        return [cabecera, "", `dijiste que hoy no${esc(".")} mañana vemos${esc(".")}`].join(NL);
    }

    const donde = f.dondeTipo === "sub" || f.dondeTipo === "gratis"
        ? f.donde.join(", ")
        : f.dondeTipo === "alquiler" ? "solo alquiler"
        : f.dondeTipo === "addon" ? "add\\-on aparte" : "no está en streaming";

    const partes = [
        cabecera,
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

export const botones = (p) => {
    /* acepta el payload entero o solo la pelicula, para no romper llamadas */
    const f = p?.sugerencia ?? p ?? {};

    if (p?.plan) {
        return { inline_keyboard: [[
            { text: "✕ cambiar de idea", callback_data: "cancelar-plan|" },
        ]] };
    }
    if (p?.dormido) {
        return { inline_keyboard: [[
            { text: "↺ me arrepentí", callback_data: "despertar|" },
        ]] };
    }

    return { inline_keyboard: [
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
    ] };
};

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

/* ─── juntos: decidir de a dos desde el telefono ─────────── */

const dondeTxt = (f) =>
    f.dondeTipo === "sub" || f.dondeTipo === "gratis" ? f.donde.join(", ")
    : f.dondeTipo === "alquiler" ? "solo alquiler"
    : f.dondeTipo === "addon" ? "add-on aparte" : "no está en streaming";

const ficha = (f) =>
    `*${esc(f.nombre)}* ${esc("(")}${f.anio}${esc(")")}\n${f.minutos ? `${f.minutos} min · ` : ""}${f.puntaje ? `⭐ ${esc(String(f.puntaje))} · ` : ""}${esc(dondeTxt(f))}`;

export const mensajeDuelo = (p) => {
    const [a, b] = p.duelo;
    if (!a || !b) return `no me quedan pares nuevos${esc(".")}`;
    return [
        `${esc(p.ritmos.map((r) => `${r.nombre} ${r.vistas}/${r.meta}`).join(" · "))}`,
        "",
        `_la quiere ${esc(a.de)}_`,
        ficha(a),
        "",
        `_la quiere ${esc(b.de)}_`,
        ficha(b),
    ].join("\n");
};

export const botonesDuelo = (p) => {
    const [a, b] = p.duelo;
    if (!a || !b) return { inline_keyboard: [[{ text: "otro par", callback_data: "juntos-otro|" }]] };
    return {
        inline_keyboard: [
            [{ text: `▶ ${a.nombre.slice(0, 22)}`, callback_data: `juntos-elige|${a.nombre}`.slice(0, 64) }],
            [{ text: `▶ ${b.nombre.slice(0, 22)}`, callback_data: `juntos-elige|${b.nombre}`.slice(0, 64) }],
            [{ text: "🔀 otro par", callback_data: "juntos-otro|" }, { text: "🎰 ruleta", callback_data: "juntos-gira|" }],
        ],
    };
};

export const mensajeNuestro = (p) => {
    const v = p.juntas?.vida;
    if (!v) return `todavia no vieron nada juntos${esc(".")}`;
    const MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const [a, m, d] = v.primera.visto.split("-");
    const anios = Math.floor(v.desde / 365);
    return [
        `*${v.total}* peliculas juntos`,
        "",
        `la primera fue *${esc(v.primera.nombre)}*`,
        `el ${+d} de ${MES[+m - 1]} de ${a}, hace ${anios} años`,
        "",
        `${v.horas} horas de pantalla compartida ${esc("(")}${esc(String(v.diasDePantalla))} dias enteros${esc(")")}`,
        `coinciden al puntuar el *${v.sintonia}%* de las veces`,
        `su record: ${v.racha} semanas seguidas sin fallar`,
        "",
        `_${esc(v.amadas.slice(0, 3).map((f) => f.nombre).join(", "))} — las que amaron los dos_`,
    ].join("\n");
};

export const mensajeRuleta = (p) => {
    const g = p.giro?.[(p.ronda ?? 0) % Math.max(1, p.giro.length)];
    if (!g) return `el bolillero está vacío${esc(".")}`;
    return ["🎰 *la ruleta decidió*", "", ficha(g), "", "_no se discute_"].join("\n");
};

export const botonesRuleta = (p) => {
    const g = p.giro?.[(p.ronda ?? 0) % Math.max(1, p.giro.length)];
    return {
        inline_keyboard: [[
            ...(g ? [{ text: "▶ va esta", callback_data: `juntos-elige|${g.nombre}`.slice(0, 64) }] : []),
            { text: "🎰 otra vez", callback_data: "juntos-gira|" },
        ]],
    };
};
