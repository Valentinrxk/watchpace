import { cargarEnv } from "./env.js";
import { enRaiz } from "./rutas.js";

cargarEnv(enRaiz(".env"));
cargarEnv(enRaiz(".env.local"));

const URL_KV = () => process.env.KV_REST_API_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN;

export const hayKV = () => Boolean(URL_KV() && TOKEN());

const llave = (usuario) => `watchpace:estado:${usuario}`;

/* la marca del sync no es estado del usuario: la escribe el runner de
   github y la lee la app en vercel, que no comparten disco. por eso va
   en kv y en su propia llave. */
const LLAVE_SYNC = "watchpace:sync";

const comando = async (cmd) => {
    const r = await fetch(URL_KV(), {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN()}`, "content-type": "application/json" },
        body: JSON.stringify(cmd),
    });
    if (!r.ok) throw new Error(`kv ${r.status}`);
    return (await r.json()).result;
};

export const leerRemoto = async (usuario) => {
    if (!hayKV()) return null;
    try {
        const v = await comando(["GET", llave(usuario)]);
        return v ? JSON.parse(v) : null;
    } catch {
        return null;
    }
};

export const guardarRemoto = async (usuario, estado) => {
    if (!hayKV()) return false;
    try {
        await comando(["SET", llave(usuario), JSON.stringify(estado)]);
        return true;
    } catch {
        return false;
    }
};

export const leerSyncRemoto = async () => {
    if (!hayKV()) return null;
    try {
        const v = await comando(["GET", LLAVE_SYNC]);
        return v ? JSON.parse(v) : null;
    } catch {
        return null;
    }
};

export const guardarSyncRemoto = async (marca) => {
    if (!hayKV()) return false;
    try {
        await comando(["SET", LLAVE_SYNC, JSON.stringify(marca)]);
        return true;
    } catch {
        return false;
    }
};

/* lo que escriben los dos a la vez no puede ir en el estado de juntos: es
   un solo json que se lee, se cambia y se guarda, y dos telefonos votando
   o jugando al mismo tiempo se pisaban. va en estructuras propias, con
   operaciones atomicas: un hash con los votos del match y una lista de
   jugadas por persona. */
const LLAVE_VOTOS = "watchpace:votos";
const llaveJugadas = (usuario) => `watchpace:jugadas:${usuario}`;
const TOPE_JUGADAS = 1000;

/* upstash devuelve HGETALL como lista plana [campo, valor, ...] */
const aPares = (r) => (Array.isArray(r) ? r.flatMap((x, i) => (i % 2 ? [] : [[x, r[i + 1]]])) : Object.entries(r ?? {}));

export const votarRemoto = async (k, usuario, valor, otros) => {
    if (!hayKV()) return false;
    try {
        await comando(["HSET", LLAVE_VOTOS, `${usuario}\t${k}`, String(valor)]);
        /* escribir y despues leer: el ultimo de los dos en votar ve el
           voto del otro seguro, asi que el match no se escapa */
        const suyos = await comando(["HMGET", LLAVE_VOTOS, ...otros.map((u) => `${u}\t${k}`)]);
        if (valor === 1 && suyos.every((v) => v === "1")) await comando(["HSETNX", LLAVE_VOTOS, `match\t${k}`, new Date().toISOString()]);
        return true;
    } catch {
        return false;
    }
};

export const leerVotosRemotos = async () => {
    if (!hayKV()) return null;
    try {
        const votos = {};
        for (const [campo, valor] of aPares(await comando(["HGETALL", LLAVE_VOTOS]))) {
            const [quien, k] = campo.split("\t");
            (votos[k] ??= {})[quien] = quien === "match" ? valor : Number(valor);
        }
        return votos;
    } catch {
        return null;
    }
};

export const anotarJugadaRemota = async (usuario, jugada) => {
    if (!hayKV()) return false;
    try {
        await comando(["RPUSH", llaveJugadas(usuario), JSON.stringify(jugada)]);
        await comando(["LTRIM", llaveJugadas(usuario), String(-TOPE_JUGADAS), "-1"]);
        return true;
    } catch {
        return false;
    }
};

export const leerJugadasRemotas = async (usuarios) => {
    if (!hayKV()) return null;
    try {
        const listas = await Promise.all(usuarios.map((u) => comando(["LRANGE", llaveJugadas(u), "0", "-1"])));
        return listas.flatMap((l, i) => (l ?? []).map((x) => ({ ...JSON.parse(x), quien: usuarios[i] })));
    } catch {
        return null;
    }
};
