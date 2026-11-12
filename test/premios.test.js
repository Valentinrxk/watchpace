import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPremios, calcularRitmo } from "../src/pace.js";
import { generarRetos } from "../src/retos.js";
import { armarMensaje } from "../src/telegram.js";

const HOY = new Date(2026, 10, 12, 12);

/* n peliculas desde el 1 de enero, la mas nueva primero como en el diario */
const diarioDe = (n, { porDia = 1 } = {}) =>
    Array.from({ length: n }, (_, i) => ({
        nombre: `peli ${i + 1}`,
        anio: 2000,
        visto: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / porDia))).toISOString().slice(0, 10),
        rating: null,
        rewatch: false,
    })).reverse();

const premiosDe = (n, meta, extra = {}) => calcularPremios({ diario: diarioDe(n, extra), meta, hoy: HOY });

test("antes de la meta: los redondos y la meta, nada mas alla", () => {
    const { premios, metaEl, diasDeSobra } = premiosDe(171, 206);
    assert.deepEqual(premios.map((p) => p.n), [50, 100, 150, 200, 206]);
    assert.deepEqual(premios.map((p) => p.logrado), [true, true, true, false, false]);
    assert.equal(premios[2].peli.nombre, "peli 150");
    assert.equal(premios[3].faltan, 29);
    assert.equal(premios[4].esMeta, true);
    assert.equal(premios[4].faltan, 35);
    assert.equal(premios[4].peli, null);
    assert.equal(metaEl, null);
    assert.equal(diasDeSobra, null);
});

test("pasada la meta: queda ganada y aparece el proximo redondo", () => {
    const { premios, metaEl, primera } = premiosDe(208, 206);
    assert.deepEqual(premios.map((p) => p.n), [50, 100, 150, 200, 206, 250]);
    const meta = premios.find((p) => p.esMeta);
    assert.equal(meta.logrado, true);
    assert.equal(meta.peli.nombre, "peli 206");
    assert.equal(meta.id, "meta-2026-206");
    assert.equal(metaEl, meta.peli.visto);
    assert.equal(premios.at(-1).logrado, false);
    assert.equal(premios.at(-1).faltan, 42);
    assert.equal(primera.nombre, "peli 1");
});

test("justo en la meta ya esta cumplida", () => {
    const { premios } = premiosDe(206, 206);
    assert.equal(premios.find((p) => p.esMeta).logrado, true);
    assert.equal(premios.at(-1).n, 250);
});

test("varias el mismo dia: la numero n respeta el orden en que las cargaste", () => {
    const { premios } = premiosDe(208, 206, { porDia: 4 });
    assert.equal(premios.find((p) => p.n === 50).peli.nombre, "peli 50");
    assert.equal(premios.find((p) => p.esMeta).peli.nombre, "peli 206");
});

test("una meta redonda no se repite", () => {
    const { premios } = premiosDe(200, 200);
    assert.deepEqual(premios.map((p) => p.n), [50, 100, 150, 200, 250]);
    assert.equal(premios[3].esMeta, true);
});

test("dias de sobra: del dia que llegaste al 31 de diciembre", () => {
    const diario = [
        { nombre: "la dos", anio: 2000, visto: "2026-11-10", rating: 4, rewatch: false },
        { nombre: "la uno", anio: 2000, visto: "2026-01-03", rating: null, rewatch: false },
    ];
    const r = calcularPremios({ diario, meta: 2, hoy: HOY });
    assert.equal(r.metaEl, "2026-11-10");
    assert.equal(r.diasDeSobra, 51);
});

test("sin contar rewatches, una repetida no te acerca al premio", () => {
    const diario = diarioDe(50).map((f, i) => (i === 0 ? { ...f, rewatch: true } : f));
    const r = calcularPremios({ diario, meta: 60, contarRewatches: false, hoy: HOY });
    assert.equal(r.premios.find((p) => p.n === 50).logrado, false);
});

test("el ritmo sabe si la meta esta cumplida y cuanta yapa hay", () => {
    const antes = calcularRitmo({ diario: diarioDe(171), meta: 206, hoy: HOY });
    assert.equal(antes.cumplida, false);
    assert.equal(antes.yapa, 0);
    const despues = calcularRitmo({ diario: diarioDe(208), meta: 206, hoy: HOY });
    assert.equal(despues.cumplida, true);
    assert.equal(despues.yapa, 2);
});

const hitoDe = (n, meta) => {
    const diario = diarioDe(n);
    const ritmo = calcularRitmo({ diario, meta, hoy: HOY });
    return generarRetos({ diario, watchlist: [], cache: {}, ritmo, hoy: HOY }).find((r) => r.id.startsWith("hito-"));
};

test("el reto del proximo numero no saltea la meta ni se apaga despues", () => {
    assert.equal(hitoDe(171, 206).objetivo, 200);
    assert.equal(hitoDe(203, 206).objetivo, 206);
    assert.match(hitoDe(203, 206).titulo, /meta/);
    assert.equal(hitoDe(208, 206).objetivo, 250);
    assert.match(hitoDe(205, 206).titulo, /^te falta 1 /);
});

test("el reto no promete un numero que a ese ritmo cae el año que viene", () => {
    /* 208 en 316 dias: faltan 42 para la 250 y quedan 49 dias */
    assert.match(hitoDe(208, 206).detalle, /no llegás antes de fin de año/);
    /* 249 de 206: falta una sola, llega seguro */
    assert.doesNotMatch(hitoDe(249, 206).detalle, /no llegás/);
});

/* telegram rechaza el mensaje entero si queda un caracter reservado sin
   escapar, asi que lo que se agrega tiene que salir escapado */
const sinEscapar = (t) => t.replace(/\\./g, "").replace(/\*[^*]*\*/g, "").match(/[_[\]()~`>#+\-=|{}.!]/g);

test("telegram: con la meta cumplida la cabecera lo dice, bien escapada", () => {
    const base = { nombre: "valen", plan: { nombre: "Heat" } };
    const ritmo = { ...calcularRitmo({ diario: diarioDe(208), meta: 206, hoy: HOY }) };
    const txt = armarMensaje({ ...base, ritmo });
    const cabecera = txt.split("\n")[0];
    assert.match(cabecera, /meta cumplida/);
    assert.match(cabecera, /\\\+2 de yapa/);
    assert.equal(sinEscapar(cabecera), null);
});

test("telegram: el dia que llegas a un premio, el mensaje lo festeja", () => {
    const ritmo = calcularRitmo({ diario: diarioDe(206), meta: 206, hoy: HOY });
    const sugerencia = { nombre: "Heat", anio: 1995, donde: [], generos: [] };
    const premio = { n: 206, esMeta: true, peli: { nombre: "Mr. & Mrs. Smith (2005)" } };
    const txt = armarMensaje({ nombre: "valen", ritmo, sugerencia, premioDeHoy: premio });
    const linea = txt.split("\n").find((l) => l.includes("Smith"));
    assert.ok(linea, "falta la linea del premio");
    assert.match(linea, /meta/);
    assert.equal(sinEscapar(linea), null);

    const redondo = armarMensaje({ nombre: "valen", ritmo, sugerencia, premioDeHoy: { n: 150, esMeta: false, peli: { nombre: "Heat" } } });
    assert.match(redondo, /150/);
});
