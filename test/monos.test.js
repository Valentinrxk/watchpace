import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* public/monos.json lo genera scripts/monos-baile.py. la pagina pinta cada
   cuadro en un <pre>: si un cuadro viene con otra medida, el mono salta de
   lugar en vez de bailar */
const { monos } = JSON.parse(readFileSync(new URL("../public/monos.json", import.meta.url), "utf8"));

test("hay monos para los costados de la apertura y del fin", () => {
    assert.ok(monos.length >= 4, `hay ${monos.length}`);
    assert.equal(new Set(monos.map((m) => m.id)).size, monos.length);
});

for (const m of monos) {
    test(`${m.id}: todos los cuadros miden lo mismo`, () => {
        assert.ok(m.cuadros.length > 1 && m.ms > 0);
        for (const c of m.cuadros) {
            const filas = c.split("\n");
            assert.equal(filas.length, m.filas);
            assert.ok(filas.every((f) => f.length === m.cols));
        }
    });

    test(`${m.id}: la capa de rojo acompaña a cada cuadro sin salirse`, () => {
        if (!m.rojo) return;
        assert.equal(m.rojo.length, m.cuadros.length);
        m.rojo.forEach((r, i) => {
            const letras = m.cuadros[i].split("\n");
            r.split("\n").forEach((fila, f) => {
                for (let c = 0; c < fila.length; c++) {
                    if (fila[c] === "x") assert.notEqual(letras[f][c], " ", `cuadro ${i}, fila ${f}, col ${c}: rojo sobre un hueco`);
                }
            });
        });
    });
}
