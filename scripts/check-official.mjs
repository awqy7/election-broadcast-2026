// Confere se o .env esta em modo OFICIAL. Usado pelo INICIAR-OFICIAL.bat,
// que nao pode rodar com dados de ensaio achando que sao oficiais.
// Sai com codigo 0 quando pode transmitir, 1 quando nao pode.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "./setup-core.mjs";

const envPath = process.argv[2] ?? ".env";
if (!existsSync(envPath)) {
  console.error("ERRO: configuracao ausente. Execute INSTALAR.bat primeiro.");
  process.exit(1);
}
const mode = parseEnv(readFileSync(envPath, "utf8")).get("DATA_MODE");
if (mode === "tse") process.exit(0);

console.error("ERRO: o arquivo .env nao esta em modo oficial.");
console.error("");
console.error("  Modo encontrado: " + (mode ?? "(vazio)"));
console.error("");
console.error("  Abra o .env e deixe a linha assim:");
console.error("");
console.error("      DATA_MODE=tse");
console.error("");
console.error("  Sem isso o programa mostraria dados de teste com aparencia");
console.error("  de resultado oficial. Nao use para transmitir.");
process.exit(1);
