// Imprime, em uma unica linha, a URL base que o operador deve abrir.
//
// Os .bat precisam da URL real do servidor para abrir o navegador e checar o
// /health. Como o .env pode mandar o servidor ficar ligado so no IP da rede,
// o endereco digitado pelo operador tem que vir do proprio .env. Sem isto os
// atalhos apontariam para 127.0.0.1 e nao responderiam.
//
// Uso: node env-url.mjs <caminho-do-env> <porta>
// Exemplo: node env-url.mjs C:\Programa\...\ElectionBroadcast2026\.env 8787
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { parseEnv, pickLanAddress, buildUrls } from "./setup-core.mjs";

const [envPath, port] = process.argv.slice(2);
const configuredPort = Number(port) || 8787;
const values = existsSync(envPath)
  ? parseEnv(readFileSync(resolve(envPath), "utf8"))
  : new Map();

const lan = pickLanAddress(networkInterfaces());
const urls = buildUrls(values.get("HOST"), configuredPort, lan?.address);

// Uma linha, so em stdout: o .bat le isso com "for /f".
process.stdout.write(urls.base + "\n");
