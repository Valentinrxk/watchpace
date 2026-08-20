export const parseCsv = (texto) => {
    const filas = [];
    let fila = [], campo = "", entreComillas = false;

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (entreComillas) {
            if (c !== '"') campo += c;
            else if (texto[i + 1] === '"') { campo += '"'; i++; }
            else entreComillas = false;
        } else if (c === '"') entreComillas = true;
        else if (c === ",") { fila.push(campo); campo = ""; }
        else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
        else if (c !== "\r") campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }

    const [cabecera, ...cuerpo] = filas;
    return cuerpo
        .filter((f) => f.length === cabecera.length)
        .map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i]])));
};
