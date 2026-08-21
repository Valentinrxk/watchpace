export const CONFIG = {
    usuarios: [
        { usuario: "valentinrxk", nombre: "valen", meta: 206 },
        { usuario: "yuti", nombre: "cande", meta: 180 },
    ],
    porDefecto: "valentinrxk",
    contarRewatches: true,
    region: "ar",
    horaNudge: 20,
    silencio: [0.5, 11],
    dirDatos: "./data",

    get usuario() { return this.porDefecto; },
    get meta() { return this.usuarios.find((u) => u.usuario === this.porDefecto).meta; },
};
