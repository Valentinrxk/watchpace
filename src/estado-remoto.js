import { cargarEnv } from "./env.js";
import { enRaiz } from "./rutas.js";

cargarEnv(enRaiz(".env"));
cargarEnv(enRaiz(".env.local"));

const URL_KV = () => process.env.KV_REST_API_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN;

export const hayKV = () => Boolean(URL_KV() && TOKEN());

const llave = (usuario) => `watchpace:estado:${usuario}`;

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
