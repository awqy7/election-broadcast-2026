// Reune as informacoes uteis quando algo da errado: o programa responde nas
// duas portas, quais enderecos usar em cada computador da rede e a chave.
// Usado pelo menu INICIAR.bat.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import {
  buildUrls,
  parseEnv,
  pickLanAddress,
  resolverRaiz,
} from "./setup-core.mjs";

const root = resolverRaiz(process.argv[2]);
const envPath = join(root, ".env");
const env = existsSync(envPath)
  ? parseEnv(readFileSync(envPath, "utf8"))
  : new Map();
const lan = pickLanAddress(networkInterfaces());
const host = env.get("HOST") || lan?.address || "127.0.0.1";
const official = Number(env.get("PORT") ?? 8787);
const sim = Number(env.get("SIM_PORT") ?? 8788);
// O .env pode prender o servidor a um IP especifico; nesse caso o endereco
// que o operador digita precisa ser esse IP, e nao o loopback.
const officialUrls = buildUrls(host, official, lan?.address);
const simUrls = buildUrls(host, sim, lan?.address);

async function check(label, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    const body = await response.json();
    const extra = [];
    if (body.dataMode) extra.push("modo=" + body.dataMode);
    if (body.database) extra.push("banco=" + body.database);
    if (body.tse) extra.push("fonte=" + body.tse);
    if (body.sseClients !== undefined)
      extra.push("conectados=" + body.sseClients);
    console.log(
      `  ${label.padEnd(22)} RESPONDE  (${extra.join(", ") || "ok"})`,
    );
  } catch (error) {
    const cause =
      error?.cause?.code === "ECONNREFUSED"
        ? "nao esta rodando"
        : "sem resposta";
    console.log(`  ${label.padEnd(22)} parado   (${cause})`);
  }
}

console.log("");
console.log("  === Diagnostico do Election Broadcast 2026 ===");
console.log("");
await check("Oficial (ao vivo)", officialUrls.health);
await check("Ensaio (TSE simulado)", simUrls.health);
console.log("");
console.log("  Enderecos:");
console.log(`    Painel oficial    ${officialUrls.studio}`);
console.log(`    Saida oficial     ${officialUrls.overlay}`);
console.log(`    Ensaio            ${simUrls.studio}`);
console.log(`    Saida ensaio      ${simUrls.overlay}`);
console.log("");
console.log(`  Computador servindo: ${officialUrls.host}`);
console.log(`  Modo configurado:    ${env.get("DATA_MODE") ?? "(padrao tse)"}`);
console.log(`  Pasta do programa:   ${root}`);
const key = env.get("ADMIN_ACCESS_KEY");
console.log("");
console.log("  Chave de acesso:");
console.log(key ? `    ${key}` : "    (nao encontrada no .env)");
console.log("");
