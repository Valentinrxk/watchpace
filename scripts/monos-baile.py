"""Genera los monos bailarines de la gala: gifs -> cuadros ascii.

uso: uv run --with pillow --with numpy --with scipy scripts/monos-baile.py <carpeta con los gifs> public/monos.json

Los gifs de origen no estan en el repo (son de internet): gorila
(monkey-monkey-dancing.gif), short (monkey-dance-dancing.gif), sonrisa
(happy-monkey.gif), pixel (monkey-reaction.gif) y salto
(a0e819aeae6ca4ba3da924b1f764aa74.gif).

No es una conversion literal. La silueta y el movimiento salen del gif; lo
que a esta escala no sobrevive (las caras) se dibuja a mano y se estampa
siguiendo la cabeza cuadro a cuadro."""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageSequence
from scipy import ndimage as ndi

ASPECTO = 0.6                       # ancho/alto de la celda: mono con line-height 1
LUMA = np.array([0.299, 0.587, 0.114], dtype=np.float32)
NADA, DENSO, CLARO, ROJO, SUAVE = 0, 1, 2, 3, 4

SOLOS = {(1, 0, 0, 0): "`", (0, 1, 0, 0): "'", (0, 0, 1, 0): ",", (0, 0, 0, 1): "."}
FORMAS = {
    (1, 1, 0, 0): '"', (0, 0, 1, 1): "_", (1, 0, 1, 0): "(", (0, 1, 0, 1): ")",
    (1, 0, 0, 1): "\\", (0, 1, 1, 0): "/",
    (0, 1, 1, 1): "d", (1, 0, 1, 1): "b", (1, 1, 0, 1): "7", (1, 1, 1, 0): "P",
}
RELLENO = {DENSO: "#", CLARO: ":", ROJO: "#", SUAVE: ":"}

# la cabeza de la marca, en chico: sale del simbolo (23x17 pixeles) pero
# esta dibujada a mano, porque convertido solo quedaba puro medio renglon.
# cabeza redonda, orejas a los costados, la cara hueca con ojos sonrientes,
# la V de nariz y la R como oreja derecha. CABEZA_ROJO marca que va en rojo
CABEZA = [
    "       .d#####b.       ",
    "     d###########b     ",
    "    ###############    ",
    ".d####    \"#\"    #####.",
    "#  ### ^^     ^^ ##  ##",
    "#  ###     V     #####'",
    " \"####b   \\_/   d##  ##",
    "     '##b.   .d##'     ",
    "        '#####'        ",
]
CABEZA_ROJO = [
    "",
    "",
    "",
    "                 xxxxxx",
    "                 xxxxxx",
    "           x     xxxxxx",
    "                 xxxxxx",
    "",
    "",
]


def cuadros(ruta, cada):
    im = Image.open(ruta)
    return [np.asarray(f.convert("RGBA")).astype(np.float32) for f in ImageSequence.Iterator(im)][::cada]


def mayor(m):
    et, n = ndi.label(m)
    if not n:
        return m
    return et == (int(np.argmax(ndi.sum(m, et, range(1, n + 1)))) + 1)


# ---- una segmentacion por gif: devuelve el mapa de clases por pixel ----

def de_dibujo(f, corte_claro=172):
    """dibujo sobre blanco o transparente: pelo denso, panza y cara claras"""
    rgb, a = f[..., :3], f[..., 3]
    m = (a > 128) & ((255 - rgb).max(axis=2) > 40)
    m = ndi.binary_fill_holes(mayor(ndi.binary_closing(m, iterations=1)))
    clase = np.where(m, DENSO, NADA)
    clase[m & ((rgb @ LUMA) > corte_claro)] = CLARO
    return clase


def de_gorila(f):
    """figura oscura sobre pared clara: silueta pura"""
    rgb, a = f[..., :3], f[..., 3]
    m = (a > 128) & ((rgb @ LUMA) < 70)
    m = ndi.binary_opening(m, iterations=2)
    m = ndi.binary_fill_holes(ndi.binary_closing(mayor(m), iterations=2))
    m[int(m.shape[0] * 0.93):] = False          # el zocalo de la pared se pega a los pies
    return np.where(mayor(m), DENSO, NADA)


def de_short(f, techo=0.2):
    """camisa negra y short naranja sobre un fondo marron: lo unico que se
    separa bien es la ropa. la cabeza se pierde contra el fondo oscuro de
    arriba, asi que se corta y despues se estampa la del monito"""
    rgb = f[..., :3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    naranja = (r > 170) & (g > 40) & (g < 150) & (b < 95) & (r - g > 70)
    luma = rgb @ LUMA
    oscuro = luma < 60
    oscuro[: int(f.shape[0] * techo)] = False
    ys = np.where(naranja.any(axis=1))[0]
    if ys.size:                                   # de la mitad del short para abajo: piernas
        desde = int(ys.min() + (ys.max() - ys.min()) * 0.5)
        oscuro[desde:] |= luma[desde:] < 104
    m = ndi.binary_opening(naranja | oscuro, iterations=1)
    m = ndi.binary_fill_holes(ndi.binary_closing(mayor(m), iterations=3))
    clase = np.where(m, CLARO, NADA)             # lo que se rellena es la panza
    clase[m & oscuro] = DENSO
    clase[m & ndi.binary_dilation(naranja, iterations=1)] = ROJO
    return clase


def de_pixel(f):
    """pixel art: lo que lo dibuja es el contorno, asi que el contorno es lo
    denso, el relleno queda como textura y lo crema (cara, orejas) hueco,
    igual que en el logo. los cachetes van en rojo. no lleva cara estampada
    porque se da vuelta: de espaldas no hay cara, y eso es parte del chiste"""
    rgb, a = f[..., :3], f[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = rgb @ LUMA
    m = (a > 128) & ((255 - rgb).max(axis=2) > 28)
    m = ndi.binary_fill_holes(mayor(ndi.binary_closing(m, iterations=1)))
    clase = np.where(m, SUAVE, NADA)
    clase[m & (luma < 122)] = DENSO
    clase[m & (luma > 195)] = CLARO
    rosa = m & (r > 215) & (g > 120) & (g < 205) & (b > 110) & (b < 205) & (r - g > 35)
    # el gif viene con ruido rosado suelto: un cachete es una mancha pegada a la cara
    rosa &= ndi.binary_dilation(m & (luma > 195), iterations=4)
    et, n = ndi.label(rosa)
    if n:
        chicas = np.where(ndi.sum(rosa, et, range(1, n + 1)) < 45)[0] + 1
        rosa[np.isin(et, chicas)] = False
    clase[rosa] = ROJO
    return clase


# ---- de pixeles a celdas ----

def a_grilla(clase, caja, filas, hueco=False):
    y0, y1, x0, x1 = caja
    alto = (y1 - y0) / filas
    ancho = alto * ASPECTO
    cols = int(np.ceil((x1 - x0) / ancho))
    m = clase > 0
    txt = [[" "] * cols for _ in range(filas)]
    rojo = [[False] * cols for _ in range(filas)]

    def trozo(p, q, s, t):
        return slice(int(p), max(int(p) + 1, int(q))), slice(int(s), max(int(s) + 1, int(t)))

    for r in range(filas):
        for c in range(cols):
            ya, yb = y0 + r * alto, y0 + (r + 1) * alto
            xa, xb = x0 + c * ancho, x0 + (c + 1) * ancho
            ym, xm = (ya + yb) / 2, (xa + xb) / 2
            cub = [float(m[trozo(*z)].mean()) for z in ((ya, ym, xa, xm), (ya, ym, xm, xb), (ym, yb, xa, xm), (ym, yb, xm, xb))]
            on = tuple(int(v > 0.5) for v in cub)
            celda = clase[trozo(ya, yb, xa, xb)]
            dentro = celda[celda > 0]
            if not dentro.size or (sum(on) == 0 and sum(cub) / 4 <= 0.22):
                continue
            gana = int(np.bincount(dentro, minlength=5).argmax())
            rojo[r][c] = gana == ROJO
            if hueco and sum(on) == 4:
                # una linea de contorno casi nunca es mayoria en su celda: alcanza con que pase
                parte = lambda k: float((dentro == k).mean())
                es_rojo = parte(ROJO) >= 0.3 and parte(DENSO) < 0.3
                rojo[r][c] = es_rojo
                txt[r][c] = "*" if es_rojo else "#" if parte(DENSO) >= 0.3 else ":" if parte(SUAVE) > parte(CLARO) else " "
                continue
            txt[r][c] = RELLENO[gana] if sum(on) == 4 else ":" if sum(on) == 0 else SOLOS.get(on) or FORMAS.get(on, "#")
    return txt, rojo


def estampar(txt, rojo, sello, fila, col, rojos="", capa=None):
    """pega un dibujo hecho a mano. los espacios del sello no tapan nada.
    lo rojo se dice por letra (rojos) o con una capa paralela de x"""
    for i, linea in enumerate(sello):
        for j, ch in enumerate(linea):
            r, c = fila + i, col + j
            if ch == " " or not (0 <= r < len(txt) and 0 <= c < len(txt[0])):
                continue
            txt[r][c] = ch
            rojo[r][c] = ch in rojos or (capa is not None and capa[i][j:j + 1] == "x")


def suavizar(xs, n=1):
    xs = np.asarray(xs, dtype=np.float32)
    k = np.ones(2 * n + 1) / (2 * n + 1)
    return np.convolve(np.pad(xs, n, mode="wrap"), k, mode="valid")


def caja_de(clases, pad=2):
    union = np.zeros(clases[0].shape, dtype=bool)
    for c in clases:
        union |= c > 0
    ys, xs = np.where(union)
    return (max(0, ys.min() - pad), min(union.shape[0], ys.max() + 1 + pad),
            max(0, xs.min() - pad), min(union.shape[1], xs.max() + 1 + pad))


def centro_claro(clase, caja, filas, hasta):
    """donde esta la cara: el centro de lo claro en la parte de arriba"""
    y0, y1, x0, x1 = caja
    alto = (y1 - y0) / filas
    ys, xs = np.where(clase > 0)
    tope = ys.min()
    zona = clase[tope: tope + int((ys.max() - tope) * hasta)]
    cy, cx = np.where(zona == CLARO)
    if not cy.size:
        cy, cx = np.where(zona > 0)
    return (tope + cy.mean() - y0) / alto, (cx.mean() - x0) / (alto * ASPECTO)


def armar(nombre, clases, filas, ms, cara=None, cabeza=False, hueco=False):
    caja = caja_de(clases)
    grillas = [a_grilla(c, caja, filas, hueco) for c in clases]
    cols = max(len(t[0]) for t, _ in grillas)

    if cara:
        sello, rojos, hasta, dy = cara
        centros = [centro_claro(c, caja, filas, hasta) for c in clases]
        fy, fx = suavizar([p[0] for p in centros]), suavizar([p[1] for p in centros])
        for (txt, rojo), y, x in zip(grillas, fy, fx):
            ancho_s, alto_s = len(sello[0]), len(sello)
            r0, c0 = int(round(y + dy)), int(round(x - ancho_s / 2))
            for r in range(int(round(y + dy)) - 1, int(round(y + dy)) + alto_s + 1):
                for c in range(int(round(x - ancho_s / 2)) - 1, int(round(x + ancho_s / 2)) + 1):
                    if not (0 <= r < len(txt) and 0 <= c < len(txt[0])):
                        continue
                    # la cara queda hueca, como la del logo: adentro solo van los rasgos
                    en_cara = r0 <= r < r0 + alto_s and c0 <= c < c0 + ancho_s
                    if en_cara or txt[r][c] == ":":
                        txt[r][c], rojo[r][c] = " ", False
            estampar(txt, rojo, sello, int(round(y + dy)), int(round(x - len(sello[0]) / 2)), rojos)

    if cabeza:
        # el cuello: el centro de las dos primeras filas con camisa, cuadro a cuadro
        cuellos, hombros = [], []
        for txt, _ in grillas:
            llenas = [r for r, f in enumerate(txt) if sum(ch != " " for ch in f) >= 3]
            tope = llenas[0] if llenas else 0
            arriba = [c for r in (tope, tope + 1) for c, ch in enumerate(txt[r]) if ch != " "]
            cuellos.append(float(np.median(arriba)) if arriba else cols / 2)
            hombros.append(tope)
        cuellos, hombros = suavizar(cuellos, 1), suavizar(hombros, 1)
        alto, ancho = len(CABEZA), len(CABEZA[0])
        izq = int(np.floor(min(0, cuellos.min() - ancho / 2)))
        der = int(np.ceil(max(cols, cuellos.max() + ancho / 2)))
        sube = alto - 1 - int(np.floor(hombros.min()))          # filas que hay que agregar arriba
        sube = max(0, sube)
        nuevas = []
        for (txt, rojo), cx, hy in zip(grillas, cuellos, hombros):
            t = [[" "] * (der - izq) for _ in range(sube)] + [[" "] * (-izq) + f + [" "] * (der - cols) for f in txt]
            r = [[False] * (der - izq) for _ in range(sube)] + [[False] * (-izq) + f + [False] * (der - cols) for f in rojo]
            estampar(t, r, CABEZA, int(round(hy)) + sube - alto + 1, int(round(cx - ancho / 2)) - izq, capa=CABEZA_ROJO)
            nuevas.append((t, r))
        grillas, cols = nuevas, der - izq

    return {
        "id": nombre, "ms": ms, "cols": cols, "filas": len(grillas[0][0]),
        "cuadros": ["\n".join("".join(f).ljust(cols) for f in t) for t, _ in grillas],
        # la capa de rojo solo viaja si el mono tiene algo rojo
        "rojo": ["\n".join("".join("x" if v else " " for v in f).rstrip() for f in r) for _, r in grillas]
        if any(v for _, r in grillas for f in r for v in f) else None,
    }


SONRISA = (["O     O", "       ", "[IIIII]"], "[I]", 0.42, -1)
RISA = (["o  o", "    ", "\\__/"], "\\_/", 0.3, -1)


def main():
    carpeta, salida = sys.argv[1], sys.argv[2]
    en = lambda n: os.path.join(carpeta, n)
    monos = [
        armar("gorila", [de_gorila(f) for f in cuadros(en("monkey-monkey-dancing.gif"), 2)], 28, 190),
        armar("short", [de_short(f) for f in cuadros(en("monkey-dance-dancing.gif"), 2)], 22, 190, cabeza=True),
        armar("sonrisa", [de_dibujo(f) for f in cuadros(en("happy-monkey.gif"), 2)], 26, 190, cara=SONRISA),
        armar("pixel", [de_pixel(f) for f in cuadros(en("monkey-reaction.gif"), 2)], 24, 190, hueco=True),
        armar("salto", [de_dibujo(f) for f in cuadros(en("a0e819aeae6ca4ba3da924b1f764aa74.gif"), 1)], 28, 150, cara=RISA),
    ]
    json.dump({"monos": monos}, open(salida, "w"), ensure_ascii=True, separators=(",", ":"))
    for m in monos:
        print(f"  {m['id']}: {len(m['cuadros'])} cuadros de {m['cols']}x{m['filas']}")
    print(f"  {os.path.getsize(salida) // 1024} KB")


main()
