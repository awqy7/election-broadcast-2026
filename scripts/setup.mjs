// Instalador do Election Broadcast 2026. Roda com o Node portatil que vem
// dentro do pacote, em Windows, sem depender de Node instalado no sistema.
// Toda a decisao fica em setup-core.mjs, que e verificado por testes.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import {
  buildEnv,
  buildSummary,
  buildUrls,
  classifyInstallPath,
  generateKey,
  pickLanAddress,
  resolverRaiz,
} from "./setup-core.mjs";

const root = resolverRaiz(process.argv[2]);
const envFile = join(root, ".env");
const isWindows = process.platform === "win32";

const fail = (message, hint) => {
  console.error("");
  console.error("  FALHOU: " + message);
  if (hint) console.error("  " + hint);
  console.error("");
  process.exit(1);
};
const step = (n, text) => console.log(`  [${n}/6] ${text}`);
const warn = (text) => console.log(`  ! ${text}`);

// ---------------------------------------------------------------- 1. estrutura
step(1, "Conferindo os arquivos do programa");
const required = [
  ["dist/server/main.js", "Servidor compilado"],
  ["dist/web/index.html", "Interface do painel"],
  ["node_modules/better-sqlite3/package.json", "Driver do banco"],
  ["node_modules/fastify/package.json", "Servidor HTTP"],
];
const missing = required.filter(([file]) => !existsSync(join(root, file)));
if (missing.length)
  fail(
    "O pacote esta incompleto. Faltou: " +
      missing.map(([f, what]) => `${what} (${f})`).join(", "),
    "Extraia o instalador de novo, em uma pasta vazia, e nao dentro de um ZIP.",
  );
console.log("      tudo presente.");

// ------------------------------------------------------------ 2. versao node
step(2, `Node ${process.version} (portatil)`);
if (Number(process.versions.node.split(".")[0]) < 22)
  fail(
    `Node ${process.versions.node} e antigo demais.`,
    "Use o Node portatil que acompanha o programa (22 ou superior).",
  );

// -------------------------------------------------------------- 3. driver
step(3, "Driver do banco de dados (better-sqlite3)");
let Database;
try {
  ({ default: Database } = await import("better-sqlite3"));
} catch (error) {
  fail(
    "Nao foi possivel carregar o driver do banco: " + error.message,
    "O antivirus pode ter bloqueado um arquivo do programa. Libere o " +
      "ElectionBroadcast2026 na lista de exclusoes e execute INSTALAR.bat de novo.",
  );
}

// ------------------------------------------------ 4. gravacao real em disco
step(4, "Testando gravacao do banco de dados");
const probe = mkdtempSync(join(tmpdir(), "election-probe-"));
try {
  const db = new Database(join(probe, "teste.db"));
  const mode = String(db.pragma("journal_mode = WAL", { simple: true }));
  if (mode.toLowerCase() !== "wal")
    throw new Error("o modo WAL nao foi ativado (" + mode + ")");
  db.exec("CREATE TABLE teste (id INTEGER PRIMARY KEY, valor TEXT NOT NULL)");
  db.prepare("INSERT INTO teste (valor) VALUES (?)").run("ok");
  const read = db.prepare("SELECT valor FROM teste").get();
  if (read?.valor !== "ok") throw new Error("a leitura devolveu valor errado");
  db.close();
  console.log("      gravacao e leitura OK.");
} catch (error) {
  fail(
    "O banco de dados nao funcionou nesta pasta: " + error.message,
    "Instale em C:\\ElectionBroadcast2026, fora de pasta sincronizada " +
      "(OneDrive/Dropbox) e fora de rede. Se o disco for muito antigo, " +
      "tente a pasta padrao do instalador.",
  );
} finally {
  rmSync(probe, { recursive: true, force: true });
}

// --------------------------------------------------------- 5. pasta e rede
step(5, "Conferindo a pasta e o endereco de rede");
for (const problem of classifyInstallPath(root)) {
  if (problem.level === "erro") fail("Pasta inadequada.", problem.message);
  warn(problem.message);
}
// pickLanAddress so devolve endereco privado; null significa "sem rede local".
const lan = pickLanAddress(networkInterfaces());
const privateNetwork = !!lan;
const host = lan ? lan.address : "127.0.0.1";
if (lan) console.log(`      endereco de rede: ${lan.address} (${lan.iface})`);
else
  warn("Nenhuma placa de rede encontrada; o painel so abre neste computador.");

// --------------------------------------------------------------- 6. .env
step(6, "Gerando o arquivo de configuracao");
const { text, key, keyPreserved } = buildEnv({
  existing: existsSync(envFile) ? readFileSync(envFile, "utf8") : "",
  host,
  key: generateKey(randomBytes(24)),
});
mkdirSync(resolve(root, "data"), { recursive: true });
writeFileSync(envFile, text);
// O cartao mostra os dois modos. O INSTALAR.bat sobe o modo de ENSAIO na 8788,
// mas o operador vai usar a 8787 no dia da eleicao; mostrar so uma das portas
// fazia o cartao apontar para um endereudo que nao estava no ar.
const urls = buildUrls(host, "8787", lan?.address);
const urlsEnsaio = buildUrls(host, "8788", lan?.address);
const summary = buildSummary({
  urls,
  urlsEnsaio,
  key,
  host,
  privateNetwork,
});
writeFileSync(join(root, "CHAVE-DE-ACESSO.txt"), summary, "utf8");
console.log(
  keyPreserved
    ? "      chave existente preservada."
    : "      nova chave de acesso gerada.",
);

// Nada abaixo pode derrubar a instalacao: sao ajustes de conforto.
if (isWindows) {
  try {
    execFileSync(
      "powercfg.exe",
      ["/change", "standby-timeout-ac", "0", "hibernate-timeout-ac", "0"],
      { stdio: "ignore" },
    );
    console.log("      suspensao automatica do PC desligada.");
  } catch {
    warn(
      "Nao foi possivel desligar a suspensao automatica. Desligue nas opcoes de energia.",
    );
  }
}

console.log("");
console.log(summary);
