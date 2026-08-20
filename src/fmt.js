const ES_ADDON = /\bchannel\b/i;

export const clasificar = (f) => {
    const t = f?.tmdb ?? f?.m ?? f ?? {};
    const crudo = t.proveedores?.suscripcion ?? [];
    return {
        sub: crudo.filter((n) => !ES_ADDON.test(n)),
        addon: crudo.filter((n) => ES_ADDON.test(n)),
        gratis: t.proveedores?.gratis ?? [],
        alquiler: t.proveedores?.alquiler ?? [],
        resuelto: Boolean(t.tmdb),
    };
};

export const mirable = (f) => {
    const c = clasificar(f);
    return c.sub.length > 0 || c.gratis.length > 0;
};

export const dondeVer = (f) => {
    const verificados = f.ops?.filter((o) => o.tipo === "SUSCRIPCION") ?? [];
    if (verificados.length) return `${verificados.map((o) => o.host.replace(/\.(com|es)$/, "")).join(", ")} ✓`;

    const c = clasificar(f);
    if (c.sub.length) return c.sub.join(", ");
    if (c.gratis.length) return `${c.gratis.join(", ")} (gratis)`;
    if (c.addon.length) return `${c.addon[0]} (add-on aparte)`;
    if (c.alquiler.length) return "solo alquiler";
    return c.resuelto ? "no esta" : "sin datos";
};

export const pad = (s, n) => s + " ".repeat(Math.max(1, n - s.length));

export const duracion = (min) => (min ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : "?");
