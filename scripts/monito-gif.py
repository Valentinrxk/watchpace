# -*- coding: utf-8 -*-
"""Genera el gif del monito festejando. Los brazos suben y bajan, el
guino se abre y la sonrisa se ensancha. Sin interpolacion: cuadro a
cuadro, como el resto del movimiento del proyecto."""

import io
import os
from PIL import Image, ImageDraw, ImageFont

TINTA = (35, 35, 39)
ROJO = (225, 6, 0)
FONDO_DIA = (207, 208, 214)
FONDO_NOCHE = (35, 35, 40)
TINTA_NOCHE = (226, 227, 231)

CELDA = 26          # alto de cada linea
ANCHO_CH = 15       # ancho de cada caracter
MARGEN = 18
MS = 150

# 19 columnas x 7 filas. los brazos son las columnas de los bordes.
QUIETO = [
    "     .==#%#==.     ",
    "   =%+.:#%#:.+%=   ",
    "  (@:   ...   :R)  ",
    "  (@.  o   -  .R)  ",
    "  (@:    V    :R)  ",
    "   =%= \\===/ =%=   ",
    "    .=#%%%#=.      ",
]

MEDIO = [
    "     .==#%#==.     ",
    "   =%+.:#%#:.+%=   ",
    "  (@:   ...   :R)  ",
    "  (@.  O   O  .R)  ",
    "  (@:    V    :R)  ",
    " \\ =%= \\===/ =%= / ",
    "    .=#%%%#=.      ",
]

ARRIBA = [
    " \\   .==#%#==.   / ",
    "  \\=%+.:#%#:.+%=/  ",
    "  (@:   ...   :R)  ",
    "  (@.  O   O  .R)  ",
    "  (@:    V    :R)  ",
    "   =%= \\===/ =%=   ",
    "    .=#%%%#=.      ",
]

SALTO = [
    " \\   .==#%#==.   / ",
    "  \\=%+.:#%#:.+%=/  ",
    "  (@:   ^   ^ :R)  ",
    "  (@.         .R)  ",
    "  (@:    V    :R)  ",
    "   =%= \\ooo/ =%=   ",
    "    .=#%%%#=.      ",
]

CUADROS = [QUIETO, MEDIO, ARRIBA, SALTO, ARRIBA, MEDIO]


def buscar_fuente(tam):
    for ruta in (
        r"C:\Windows\Fonts\consolab.ttf",
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\cour.ttf",
    ):
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, tam)
    return ImageFont.load_default()


def pintar(cuadro, fuente, fondo, tinta):
    cols = max(len(l) for l in cuadro)
    img = Image.new("RGB", (cols * ANCHO_CH + MARGEN * 2, len(cuadro) * CELDA + MARGEN * 2), fondo)
    d = ImageDraw.Draw(img)
    for fila, linea in enumerate(cuadro):
        for col, ch in enumerate(linea):
            if ch == " ":
                continue
            color = ROJO if ch in ("R", "V") else tinta
            d.text((MARGEN + col * ANCHO_CH, MARGEN + fila * CELDA), ch, font=fuente, fill=color)
    return img


def generar(salida, fondo, tinta, tam=22):
    fuente = buscar_fuente(tam)
    frames = [pintar(c, fuente, fondo, tinta) for c in CUADROS]
    frames[0].save(
        salida,
        save_all=True,
        append_images=frames[1:],
        duration=[260, MS, MS, 260, MS, MS],
        loop=0,
        optimize=True,
    )
    return salida, os.path.getsize(salida), frames[0].size


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "public")
    for nombre, fondo, tinta in (
        ("monito-festeja.gif", FONDO_DIA, TINTA),
        ("monito-festeja-noche.gif", FONDO_NOCHE, TINTA_NOCHE),
    ):
        ruta, peso, tam = generar(os.path.join(base, nombre), fondo, tinta)
        print(f"  {nombre}  {tam[0]}x{tam[1]}px  {peso // 1024} KB")
