// Gera o pacote de entrega para o Windows.
//
// O ponto critico deste script e o node_modules. O layout padrao do pnpm usa
// links simbolicos, e o Windows so cria link simbolico com administrador ou
// com o Modo Desenvolvedor ligado. Extrair essa arvore no PC do cliente
// quebra. Por isso o pacote e montado com `node-linker=hoisted`, que produz
// uma arvore plana identica a do npm, sem um unico link simbolico.
//
// O unico modulo nativo em producao e o better-sqlite3. Ele e compilado para a
// plataforma da maquina de build (Linux), entao o binario .node e trocado pelo
// artefato oficial win32-x64 do mesmo release antes de compactar.
//
// Uso: node scripts/build-delivery.mjs [--skip-gates]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts");
const stage = join(artifacts, "runtime-stage");
const payload = join(stage, "ElectionBroadcast2026");
const FOLDER = "ElectionBroadcast2026";

// Mesma familia validada em docs/VALIDATION.md. Mudar aqui exige revalidar.
const NODE_VERSION = "v22.23.3";
const NODE_ABI = 127; // ABI do Node 22
const skipGates = process.argv.includes("--skip-gates");

const log = (message) => console.log(message);
const step = (n, text) => console.log(`\n[${n}/8] ${text}`);

function fail(message, hint) {
  console.error("\n  FALHOU: " + message);
  if (hint) console.error("  " + hint);
  process.exit(1);
}

function sh(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "pipe", ...options });
}

async function download(url) {
  log(`      baixando ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * O .bat e lido pelo cmd.exe, que nao tem como declarar a codificacao do
 * arquivo. Qualquer caractere acima de 127 vira lixo na tela. Por isso os
 * quatro .bat sao escritos só com ASCII.
 */
function isAscii(text) {
  for (const char of text) if ((char.codePointAt(0) ?? 0) > 127) return false;
  return true;
}

/** Lista recursivamente, seguindo o padrao que o pacote precisa ter. */ function walk(
  dir,
  base = dir,
  out = [],
) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      out.push({ path: relative(base, full), link: readlinkSync(full) });
      continue;
    }
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile())
      out.push({ path: relative(base, full), size: statSync(full).size });
  }
  return out;
}

// ------------------------------------------------------------------ 1. gates
step(1, "Verificando o projeto");
if (skipGates) log("      pulado por --skip-gates");
else
  for (const script of ["format:check", "lint", "typecheck", "test", "build"]) {
    log(`      pnpm ${script}`);
    try {
      sh("pnpm", [script]);
    } catch {
      fail(
        `pnpm ${script} falhou.`,
        "O pacote de entrega so e gerado com o projeto inteiro passando.",
      );
    }
  }
for (const file of ["dist/server/main.js", "dist/web/index.html"])
  if (!existsSync(join(root, file))) fail(`${file} nao existe apos o build.`);

// ------------------------------------------------------------- 2. preparar
step(2, "Preparando a pasta do pacote");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(payload, "scripts"), { recursive: true });
mkdirSync(join(payload, "runtime/node"), { recursive: true });
// package.json e lockfile verbatim para que --frozen-lockfile continue valendo.
cpSync(join(root, "package.json"), join(payload, "package.json"));
cpSync(join(root, "pnpm-lock.yaml"), join(payload, "pnpm-lock.yaml"));
// node-linker=hoisted e o que elimina os links simbolicos do pacote.
writeFileSync(join(payload, ".npmrc"), "node-linker=hoisted\n");
log("      package.json, pnpm-lock.yaml e .npmrc (hoisted) copiados");

// ------------------------------------------------- 3. dependencias de producao
step(3, "Instalando dependencias de producao (arvore sem links)");
sh("pnpm", ["install", "--prod", "--frozen-lockfile"], { cwd: payload });
const nodeModules = join(payload, "node_modules");
if (!existsSync(join(nodeModules, "better-sqlite3/package.json")))
  fail("better-sqlite3 nao foi instalado no pacote.");

// ------------------------------------------ 4. trocar binario por win32-x64
step(4, "Trocando o driver do banco pelo binario do Windows");
const sqliteVersion = JSON.parse(
  readFileSync(join(nodeModules, "better-sqlite3/package.json"), "utf8"),
).version;
log(`      versao instalada: ${sqliteVersion}`);
const asset = `better-sqlite3-v${sqliteVersion}-node-v${NODE_ABI}-win32-x64.tar.gz`;
const temp = mkdtempSync(join(tmpdir(), "election-build-"));
writeFileSync(
  join(temp, asset),
  await download(
    `https://github.com/WiseLibs/better-sqlite3/releases/download/v${sqliteVersion}/${asset}`,
  ),
);
execFileSync("tar", ["-xzf", join(temp, asset), "-C", temp], {
  stdio: "pipe",
});
const extracted = join(temp, "build/Release/better_sqlite3.node");
if (!existsSync(extracted))
  fail(
    `build/Release/better_sqlite3.node nao veio em ${asset}.`,
    "O formato do artefato mudou; confira a release do better-sqlite3.",
  );
const targetDir = join(nodeModules, "better-sqlite3/build/Release");
mkdirSync(targetDir, { recursive: true });
cpSync(extracted, join(targetDir, "better_sqlite3.node"));
chmodSync(join(targetDir, "better_sqlite3.node"), 0o755);
rmSync(temp, { recursive: true, force: true });
log(`      ${asset} -> node_modules/better-sqlite3`);

// ------------------------------------------------------- 5. Node portatil
step(5, `Baixando o Node ${NODE_VERSION} para Windows (x64)`);
const nodeZip = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;
const nodeFiles = unzipSync(await download(nodeZip));
// Só o node.exe. O pacote dispensa npm, npx e corepack em tempo de execucao,
// e cortar o resto deixa o instalador leve. O zip traz uma pasta raiz, entao
// procuramos pelo nome do arquivo em qualquer nivel.
const nodeEntries = Object.keys(nodeFiles).filter(
  (name) =>
    name.toLowerCase().endsWith("/node.exe") ||
    name.toLowerCase() === "node.exe",
);
if (nodeEntries.length === 0)
  fail(
    "node.exe nao veio no zip do Node.",
    `Entradas inesperadas: ${Object.keys(nodeFiles).slice(0, 8).join(", ")}`,
  );
writeFileSync(
  join(payload, "runtime/node/node.exe"),
  nodeFiles[nodeEntries[0]],
);
log(
  `      runtime/node/node.exe (${(
    statSync(join(payload, "runtime/node/node.exe")).size / 1e6
  ).toFixed(1)} MB)`,
);

// ------------------------------------------------------- 6. arquivos do app
step(6, "Copiando o programa compilado, atalhos e manual");
cpSync(join(root, "dist"), join(payload, "dist"), { recursive: true });

// O pnpm cria links simbolicos em node_modules/.bin para cada pacote que
// declara executavel. Nada disso e usado em tempo de execucao: o servidor
// roda direto pelo node.exe com dist/server/main.js. Como o Windows so cria
// link simbolico com administrador ou Modo Desenvolvedor, e melhor remover
// do que intentar copiar.
rmSync(join(nodeModules, ".bin"), { recursive: true, force: true });

// .modules.yaml e a bookkeeping interna do pnpm e guarda o caminho absoluto do
// store da maquina de build (/home/<usuario>/.local/share/pnpm/...). Isso
// vazaria dados da maquina de quem montou o pacote e nao serve para nada em
// tempo de execucao. Quem precisar reparar a instalacao reinstalla, e o pnpm
// recria o arquivo a partir do .npmrc e do lockfile que vao no pacote.
rmSync(join(nodeModules, ".modules.yaml"), { force: true });

for (const name of [
  "INSTALAR.bat",
  "INICIAR.bat",
  "INICIAR-OFICIAL.bat",
  "INICIAR-SIMULADO.bat",
])
  cpSync(join(root, name), join(payload, name));
for (const name of [
  "launch-official.mjs",
  "setup.mjs",
  "setup-core.mjs",
  "env-url.mjs",
  "check-official.mjs",
  "show-info.mjs",
  "wait-for-health.mjs",
  "abrir-abas.mjs",
  "base-url.mjs",
])
  cpSync(join(root, "scripts", name), join(payload, "scripts", name));
cpSync(join(root, "MANUAL-OPERADOR.txt"), join(payload, "MANUAL-OPERADOR.txt"));
// Só o que o operador do cliente precisa ler. ARCHITECTURE, ENTREGA_CLIENTE,
// ENVIAR-AO-CLIENTE, TSE_INTEGRATION e VALIDATION são histórico de
// engenharia: irem junto só confunde quem vai usar o programa e expõe
// decisões internas que não ajudam ninguém na operação.
const DOCS_DO_CLIENTE = [
  "DOIS-ENDERECOS.md",
  "INSTALACAO-WINDOWS.md",
  "TROUBLESHOOTING.md",
  "ELECTION_DAY_RUNBOOK.md",
];
mkdirSync(join(payload, "docs"), { recursive: true });
for (const name of DOCS_DO_CLIENTE)
  cpSync(join(root, "docs", name), join(payload, "docs", name));
log("      dist, 4 atalhos, 8 scripts, manual e docs");

// ------------------------------------------------------------- 7. validacao
step(7, "Validando o pacote antes de compactar");
const problems = [];
const entries = walk(payload);
const links = entries.filter((entry) => entry.link);
if (links.length)
  problems.push(
    `${links.length} link(s) simbolico(s) no pacote; o Windows quebraria: ` +
      links
        .slice(0, 5)
        .map((l) => l.path)
        .join(", "),
  );

const windowsBinary = join(targetDir, "better_sqlite3.node");
const header = readFileSync(windowsBinary).subarray(0, 2);
if (header[0] !== 0x4d || header[1] !== 0x5a)
  problems.push(
    "better_sqlite3.node nao tem cabecalho PE (MZ); o binario do Windows nao foi aplicado.",
  );
const nodeHeader = readFileSync(
  join(payload, "runtime/node/node.exe"),
).subarray(0, 2);
if (nodeHeader[0] !== 0x4d || nodeHeader[1] !== 0x5a)
  problems.push("runtime/node/node.exe nao e um executavel PE (MZ).");

// Nenhum caminho de dependencia pode citar a plataforma de build.
for (const entry of entries) {
  if (
    /(^|[\\/])(linux-x64|darwin-x64|darwin-arm64|linux-arm64)([\\/]|$)/.test(
      entry.path,
    )
  )
    problems.push(
      `Dependencia da plataforma de build no pacote: ${entry.path}`,
    );
}

// Nenhum caminho da maquina que montou o pacote pode vazar para o PC do
// cliente: seria um vazamento de dado de quem compilou, alem de deixar o
// pacote dependendo de um caminho que nao existe la.
//
// A busca e pelo home e pela raiz REAIS desta maquina, e nao por um padrao
// "/home/*": pacotes publicados trazem no proprio codigo o caminho de casa
// dos autores upstream (/home/fred em sqlite3.c, por exemplo), e isso nao tem
// relacao com a maquina que montou o pacote.
const buildPaths = [homedir(), root].filter(
  (value, index, all) => value && all.indexOf(value) === index,
);
for (const entry of entries) {
  if (entry.link) continue;
  // Binario nao tem texto; so o que for texto vale a pena abrir.
  if (/\.(node|exe|dll|png|jpg|webp|woff2?|zip|tar|gz)$/i.test(entry.path))
    continue;
  let text;
  try {
    text = readFileSync(join(payload, entry.path), "utf8");
  } catch {
    continue;
  }
  for (const leaked of buildPaths) {
    if (!text.includes(leaked)) continue;
    problems.push(
      `Caminho da maquina de build vazou em ${entry.path}: ${leaked}`,
    );
    break;
  }
}
// Todo .bat precisa existir e o .env nao pode vir pronto (a chave e gerada na
// maquina do cliente).
const BAT_FILES = [
  "INSTALAR.bat",
  "INICIAR.bat",
  "INICIAR-OFICIAL.bat",
  "INICIAR-SIMULADO.bat",
];
for (const name of [
  ...BAT_FILES,
  "dist/server/main.js",
  "dist/web/index.html",
  "scripts/setup.mjs",
  "MANUAL-OPERADOR.txt",
])
  if (!existsSync(join(payload, name)))
    problems.push(`Faltando no pacote: ${name}`);
for (const name of [".env", "CHAVE-DE-ACESSO.txt", "data"])
  if (existsSync(join(payload, name)))
    problems.push(`O pacote nao deve conter ${name} (chave ou dados locais).`);

// Cada script citado por um .bat precisa estar no pacote. Se faltar, o atalho
// so quebra na maquina do cliente, depois de instalado.
for (const name of BAT_FILES) {
  const text = readFileSync(join(payload, name), "utf8");
  for (const match of text.matchAll(/scripts\\([\w.-]+\.mjs)/gi)) {
    const target = `scripts/${match[1].toLowerCase()}`;
    if (!existsSync(join(payload, target)))
      problems.push(`${name} chama ${match[1]}, que nao esta no pacote.`);
  }
  // O .bat precisa ser ASCII: o cmd.exe embaralha acentuacao em arquivos que
  // nao declaram codificacao, e nao ha como declarar em .bat.
  if (!isAscii(text))
    problems.push(
      `${name} tem caractere nao-ASCII; o cmd.exe pode exibir lixo.`,
    );
}

// O sistema nao fala com o vMix em hipotese nenhuma. Ele entrega duas abas com
// URL e quem liga a transmissao faz a parte dele fora daqui. Se alguem
// reintroduzir o acoplamento, a build para em vez de sobar na maquina do
// cliente.
const VMIX_PATTERN = /vmix/i;
for (const name of [
  ...BAT_FILES,
  "dist/server/main.js",
  "scripts/setup.mjs",
  "scripts/setup-core.mjs",
  "scripts/show-info.mjs",
  "scripts/check-official.mjs",
  "scripts/env-url.mjs",
  "scripts/wait-for-health.mjs",
  "scripts/abrir-abas.mjs",
  "scripts/base-url.mjs",
  "MANUAL-OPERADOR.txt",
]) {
  const target = join(payload, name);
  if (!existsSync(target)) continue;
  if (VMIX_PATTERN.test(readFileSync(target, "utf8")))
    problems.push(
      `${name} ainda menciona vMix; o pacote nao pode ter esse acoplamento.`,
    );
}
for (const name of [
  "dist/web/index.html",
  ...readdirSync(join(payload, "dist/web/assets")).map(
    (f) => `dist/web/assets/${f}`,
  ),
])
  if (VMIX_PATTERN.test(readFileSync(join(payload, name), "utf8")))
    problems.push(`${name} ainda menciona vMix.`);

// Os .bat de modo sobem o servidor em primeiro plano, num laco de reinicio, e
// por isso nao podem esperar o /health eles mesmos: a espera rodaria contra um
// servidor que ainda nao existe, atrasaria a partida e abriria as abas com
// "nao foi possivel acessar o site". O certo e disparar o auxiliar em
// paralelo. Esta checagem garante que a ordem nao se inverta.
for (const name of ["INICIAR-SIMULADO.bat"]) {
  const bat = readFileSync(join(root, name), "utf8");
  const auxiliar = bat.search(/abrir-abas\.mjs/i);
  const servidor = bat.search(/dist\\server\\main\.js/i);
  if (auxiliar < 0)
    problems.push(
      `${name} nao chama abrir-abas.mjs; as abas nao abrem sozinhas.`,
    );
  else if (servidor >= 0 && auxiliar > servidor)
    problems.push(
      `${name} sobe o servidor antes de disparar abrir-abas.mjs; a espera viraria contra um servidor fora do ar.`,
    );

  // A espera bloqueante e aceitavel no menu, que nao sobe servidor nenhum, e
  // nao e nos .bat de modo. Se voltar a aparecer la, o bug voltou.
  if (/wait-for-health\.mjs/i.test(bat))
    problems.push(
      `${name} usa wait-for-health.mjs em primeiro plano; use abrir-abas.mjs em paralelo.`,
    );
}

// "%ProgramFiles(x86)%" contem parenteses, e no cmd um parenteses vira sintaxe.
// Verificado no Windows: dentro de uma lista "for %%I in (...)" o caminho
// some e a busca falha silenciosa, e dentro de um bloco "if (...)" da erro de
// sintaxe. No COMPILAR-EXE.bat isso fazia o script nao achar um Inno Setup que
// estava instalado e sair tentando baixar de novo. O caminho so pode aparecer em
// linhas soltas de "if exist" ou em variaveis montadas antes.
{
  const bat = readFileSync(join(root, "COMPILAR-EXE.bat"), "utf8");
  const linhas = bat.split(/\r?\n/);
  let emListaFor = false;
  for (const linha of linhas) {
    if (/^\s*rem\b/i.test(linha)) continue;
    if (/for\s+%%[a-z]\s+in\s*\(/i.test(linha)) emListaFor = true;
    const usaX86 = /%ProgramFiles\(x86\)%/.test(linha);
    if (usaX86 && emListaFor)
      problems.push(
        "COMPILAR-EXE.bat usa %ProgramFiles(x86)% dentro de uma lista for %%I in (...); o parentese fecha a lista e a busca do ISCC.exe falha.",
      );
    if (emListaFor && /^\s*\)\s*do\b/i.test(linha)) emListaFor = false;
  }
}

// Nenhum .bat pode capturar a saida do Node com "for /f". O "for /f" roda o
// comando num pipe, e a variavel resultante vira a unica fonte da URL. Se o
// pipe falhar (o stdout do Node em pipe quebra, por exemplo, no Wine, com
// EBADF), a variavel fica vazia, o .bat cai no fallback 127.0.0.1 e as abas
// abrem numa pagina de erro — que e justamente o que nao pode acontecer,
// porque o endereco do outro PC e por IP da rede.
//
// Os scripts resolvem a URL sozinhos, lendo o .env. Assim nada no .bat depende
// de capturar saida.
for (const name of [
  "INSTALAR.bat",
  "INICIAR.bat",
  "INICIAR-OFICIAL.bat",
  "INICIAR-SIMULADO.bat",
]) {
  const bat = readFileSync(join(root, name), "utf8");
  for (const linha of bat.split(/\r?\n/)) {
    // Ignora comentario: o texto do "rem" pode citar o padrao para explicar.
    if (/^\s*rem\b/i.test(linha)) continue;
    // "cd /d" e interno do cmd e nao passa por parser de argumentos de
    // programa, entao "%~dp0" com barra final esta seguro ali.
    if (/^\s*cd\s/i.test(linha)) continue;
    if (/for\s+\/f\b/i.test(linha))
      problems.push(
        `${name} captura saida com "for /f"; a URL pode virar 127.0.0.1 e nao abrir no outro PC.`,
      );
    if (/%(BASE|SIM|OFICIAL)%/.test(linha))
      problems.push(
        `${name} usa a variavel de URL %...%; ela nao vem mais do .env e pode estar vazia.`,
      );
    // "%~dp0" sozinho, entre aspas, e argumento quebrado no Windows. A variavel
    // sempre termina em barra, e a barra na sequencia da aspa de fechamento vira
    // aspa escapada no parser de argumentos: o script recebe a pasta terminada
    // em aspas, existsSync devolve false para tudo e a instalacao aborta com
    // "pacote incompleto" mesmo com todos os arquivos presentes. Isso aconteceu
    // de verdade e so apareceu rodando o INSTALAR.bat sob Wine. A forma correta
    // e "%~dp0."; "cd /d" e interno do cmd e nao sofre desse problema.
    if (/(?<![\\/])"%~dp0"/i.test(linha.replace(/\s/g, "")))
      problems.push(
        `${name} passa "%~dp0" como argumento; use "%~dp0." (o ponto evita a barra escapada).`,
      );
  }
  // O INSTALAR nao pode abrir abas: quem abre e o .bat do modo, na janela que
  // ele lanca. Abrir nos dois daria quatro abas em vez de duas.
  if (
    name === "INSTALAR.bat" &&
    /start\s+"[^"]*"\s+"[^"]*(studio|overlay\/program)/i.test(bat)
  )
    problems.push(
      "INSTALAR.bat abre abas alem do .bat do modo; o operador receberia quatro abas.",
    );
}

// O atalho oficial deve iniciar o servidor, nunca apenas consultar um menu.
if (
  !readFileSync(join(payload, "INICIAR.bat"), "utf8").includes(
    "INICIAR-OFICIAL.bat",
  )
)
  problems.push("Atalho principal nao inicia o oficial.");
if (
  !readFileSync(join(payload, "INICIAR-OFICIAL.bat"), "utf8").includes(
    "launch-official.mjs",
  )
)
  problems.push("Launcher oficial ausente.");

// O .iss so pode ser conferido de verdade no Windows. Mas os caminhos que ele
// aponta nao dependem do Windows, e um erro aqui só apareceria na hora de
// compilar, longe daqui. O Inno Setup resolve caminho relativo a partir da
// pasta do proprio .iss, entao a checagem e feita com essa mesma regra.
const issPath = join(root, "scripts/ElectionBroadcast2026.iss");
if (!existsSync(issPath))
  problems.push("scripts/ElectionBroadcast2026.iss sumiu.");
else {
  const iss = readFileSync(issPath, "utf8");
  const defines = new Map(
    [...iss.matchAll(/^#define\s+(\w+)\s+"([^"]+)"/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const issDir = dirname(issPath);
  // O .iss foi escrito para o Windows, onde "\" e separador de pasta. Aqui
  // ".." so funciona se normalizarmos as barras, senao "..\artifacts" vira um
  // unico segmento e a checagem passaria sem ver o problema.
  const resolveIss = (value) =>
    resolve(
      issDir,
      value
        .replace(/\{#(\w+)\}/g, (_, name) => defines.get(name) ?? "")
        .replace(/[\\/]+/g, sep),
    );

  const stageDef = defines.get("StageDir");
  if (!stageDef) problems.push("O .iss nao define StageDir.");
  else {
    const stageDir = resolveIss(stageDef);
    if (!existsSync(stageDir))
      problems.push(`O .iss aponta StageDir para ${stageDir}, que nao existe.`);
  }

  const outDef = defines.get("OutputDir");
  if (outDef) {
    const outDir = resolveIss(outDef);
    // O Inno Setup cria a pasta de saida, mas nao deve ser a propria raiz do
    // projeto: um engano ali suja a arvore versionada.
    if (outDir === root || !outDir.startsWith(root + sep))
      problems.push(`OutputDir do .iss fora do projeto: ${outDir}`);
  }

  // Toda Source tem de existir no staging, senao o instalador sai sem arquivos.
  for (const m of iss.matchAll(/^Source:\s*"([^"]+)"/gm)) {
    const source = resolveIss(m[1].replace(/\\\*$/, ""));
    if (!existsSync(source.replace(/\*$/, "")))
      problems.push(`O .iss usa Source "${m[1]}", que nao existe em ${source}`);
  }
}

// Todo goto precisa apontar para um rotulo que existe no mesmo arquivo.
for (const name of BAT_FILES) {
  const text = readFileSync(join(payload, name), "utf8");
  const labels = new Set(
    [...text.matchAll(/^:(\w+)/gm)].map((match) => match[1].toLowerCase()),
  );
  for (const match of text.matchAll(/goto :?(\w+)/gi)) {
    const label = match[1].toLowerCase();
    if (!labels.has(label))
      problems.push(
        `${name} tem "goto :${label}" sem o rotulo correspondente.`,
      );
  }
}

// O servidor compilado nao pode mais depender da arvore de fontes.
const bundled = readFileSync(join(payload, "dist/server/main.js"), "utf8");
if (bundled.includes("apps/server/migrations"))
  problems.push(
    "dist/server/main.js ainda le migrations de apps/server/migrations.",
  );
if (!bundled.includes("CREATE TABLE kv"))
  problems.push(
    "dist/server/main.js nao tem o SQL embutido; o banco nao abriria.",
  );

if (problems.length) {
  console.error("");
  for (const problem of problems) console.error("  - " + problem);
  fail(`${problems.length} problema(s) no pacote. Nada foi compactado.`);
}
const bytes = entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
log(
  `      ${entries.length} arquivos, ${(bytes / 1e6).toFixed(1)} MB, zero links simbolicos`,
);
log("      binarios em formato Windows (PE) confirmados");

// --------------------------------------------------------------- 8. compactar
step(8, "Compactando");
const files = {};
for (const entry of entries) {
  if (entry.link) continue;
  files[`${FOLDER}/${entry.path.split(sep).join("/")}`] = new Uint8Array(
    readFileSync(join(payload, entry.path)),
  );
}
const archive = zipSync(files, { level: 9 });
mkdirSync(artifacts, { recursive: true });
const zipName = "ElectionBroadcast2026-win-x64.zip";
writeFileSync(join(artifacts, zipName), archive);
const digest = createHash("sha256").update(archive).digest("hex");
writeFileSync(join(artifacts, zipName + ".sha256"), `${digest}  ${zipName}\n`);

// Confere o que realmente vai para o cliente: extrai de novo e compara.
const extractedZip = unzipSync(archive);
const zipNames = Object.keys(extractedZip).filter((n) => !n.endsWith("/"));
const stageNames = Object.keys(files);
const lost = stageNames.filter((n) => !zipNames.includes(n));
if (lost.length)
  fail(`${lost.length} arquivo(s) sumiram na compactacao: ${lost[0]}`);

const report = {
  generatedAt: new Date().toISOString(),
  node: NODE_VERSION,
  betterSqlite3: sqliteVersion,
  files: zipNames.length,
  uncompressedBytes: bytes,
  zipBytes: archive.length,
  zipSha256: digest,
  links: links.length,
};
writeFileSync(
  join(artifacts, "package-report.json"),
  JSON.stringify(report, null, 2),
);
log(`      artifacts/${zipName}`);
log(
  `      ${zipNames.length} arquivos, ${(archive.length / 1e6).toFixed(1)} MB compactado`,
);
log(`      sha256 ${digest}`);
log("");
log("  Esta tudo pronto. No Windows, faca o duplo clique em:");
log("      COMPILAR-EXE.bat");
log("");
log("  Ele baixa o Inno Setup 6 se preciso e gera:");
log("      artifacts/Instalar-ElectionBroadcast2026.exe");
log("");
log("  Esse .exe e o arquivo que voce envia para o cliente.");
log("  Guia em docs/ENVIAR-AO-CLIENTE.md");
