import { chromium } from "playwright";
import { join } from "node:path";

const PERFIL = join(process.cwd(), "cache", "chrome");
const CANARIO = { nombre: "District 9", anio: 2009 };

const extraer = () => {
    const PRECIO = /(\$|US\$|ARS|€)\s?\d/;
    const ADDON = /complemento|add-?on|channel/i;
    const texto = (sel) => document.querySelector(sel)?.innerText ?? null;
    const base = { titulo: texto('[data-attrid="title"]'), sub: texto('[data-attrid="subtitle"]') };

    const panel = document.querySelector('[aria-label="Dónde mirar"],[aria-label="Where to watch"]');
    if (!panel) return { ...base, ops: [] };

    const vistos = new Set();
    const ops = [];
    for (const a of panel.querySelectorAll("a[href]")) {
        const host = new URL(a.href).hostname.replace(/^www\./, "");
        if (vistos.has(host)) continue;
        vistos.add(host);
        const t = a.innerText;
        ops.push({ host, tipo: PRECIO.test(t) ? "ALQUILER" : ADDON.test(t) ? "ADDON" : "SUSCRIPCION", link: a.href });
    }
    return { ...base, ops };
};

const minutosDe = (sub) => {
    const m = sub?.match(/(?:(\d+)\s*h)?\s*(\d+)\s*m/);
    return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

const generosDe = (sub) => sub?.split("‧")[1]?.trim().split("/").map((g) => g.trim()) ?? [];

const anioDe = (sub) => Number(sub?.match(/\b(?:19|20)\d{2}\b/)?.[0]) || null;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms));

export const abrirNavegador = async ({ headless = false } = {}) =>
    chromium.launchPersistentContext(PERFIL, {
        channel: "chrome",
        headless,
        locale: "es-AR",
        timezoneId: "America/Argentina/Buenos_Aires",
        viewport: { width: 1280, height: 900 },
        args: ["--disable-blink-features=AutomationControlled"],
    });

export const consultar = async (ctx, { nombre, anio }) => {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const q = encodeURIComponent(`${nombre} ${anio}`);
    await page.goto(`https://www.google.com/search?q=${q}&gl=ar&hl=es`, { waitUntil: "domcontentloaded" });
    const r = await page.evaluate(extraer);
    return {
        ...r,
        minutos: minutosDe(r.sub),
        generos: generosDe(r.sub),
        anioPanel: anioDe(r.sub),
        disponible: r.ops.some((o) => o.tipo === "SUSCRIPCION"),
        verificado: new Date().toISOString(),
    };
};

export const verificar = async (peliculas, { headless = false, pausaMs = 2500 } = {}) => {
    const degradado = peliculas.map((p) => ({ ...p, ops: [], disponible: null, modo: "degradado" }));
    let ctx;
    try {
        ctx = await abrirNavegador({ headless });
        const canario = await consultar(ctx, CANARIO);
        if (!canario.ops.length) {
            console.warn("  ! Google no respondio (captcha o cambio de DOM). Sigo sin datos de streaming.");
            return degradado;
        }
        const salida = [];
        for (const p of peliculas) {
            await esperar(pausaMs);
            const r = await consultar(ctx, p);
            const coincide = !r.anioPanel || Math.abs(r.anioPanel - p.anio) <= 1;
            salida.push({ ...p, ...(coincide ? r : { ops: [], disponible: false, dudoso: true }), modo: "ok" });
        }
        return salida;
    } catch (e) {
        console.warn(`  ! Verificacion no disponible (${e.message.slice(0, 80)}). Sigo sin datos de streaming.`);
        return degradado;
    } finally {
        await ctx?.close();
    }
};
