import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { enRaiz } from "../src/rutas.js";
import { cargarTodos } from "../src/env.js";

cargarTodos();

const RUTA = enRaiz(".env.local");
const URL_POR_DEFECTO = "https://watchpace.valentinromero.com/api/telegram";

if (!process.env.TELEGRAM_TOKEN) {
    console.log("");
    console.log("  falta TELEGRAM_TOKEN. pegalo en .env.local asi:");
    console.log("");
    console.log("    TELEGRAM_TOKEN=el_token_que_te_dio_botfather");
    console.log("");
    console.log("  y despues corre de nuevo: npm run telegram");
    process.exit(1);
}

/* el secreto lo genera la maquina y se guarda solo: nunca hace falta que
   pase por ningun lado. telegram lo manda en cada webhook y asi sabemos
   que el pedido viene de telegram y no de cualquiera */
if (!process.env.TELEGRAM_SECRETO) {
    const secreto = randomBytes(24).toString("hex");
    const salto = existsSync(RUTA) && !readFileSync(RUTA, "utf8").endsWith("\n") ? "\n" : "";
    appendFileSync(RUTA, `${salto}TELEGRAM_SECRETO=${secreto}\n`);
    process.env.TELEGRAM_SECRETO = secreto;
    console.log("  secreto de webhook generado y guardado en .env.local");
}

const { registrarWebhook, verWebhook } = await import("../src/telegram.js");

const url = process.argv[2] ?? URL_POR_DEFECTO;
console.log(`\n  registrando webhook en ${url}`);
await registrarWebhook(url);

const info = await verWebhook();
console.log(`  url        : ${info.url || "(ninguna)"}`);
console.log(`  pendientes : ${info.pending_update_count}`);
console.log(`  ultimo err : ${info.last_error_message ?? "ninguno"}`);
console.log(`  secreto    : ${process.env.TELEGRAM_SECRETO ? "activo" : "sin configurar"}`);
console.log("");
console.log("  falta subir las dos variables a vercel:");
console.log("    vercel env add TELEGRAM_TOKEN production");
console.log("    vercel env add TELEGRAM_SECRETO production");
console.log("");
console.log("  y despues, escribile al bot: /soy valentinrxk");
