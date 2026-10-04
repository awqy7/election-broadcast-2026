// Funcoes puras do instalador. Ficam separadas de setup.mjs para serem
// verificadas por testes, sem tocar em disco ou rede.
import { resolve, win32 } from "node:path";

const PRIVATE_IPV4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

// Preferimos a interface de nome mais "comum" quando varias servem. Nomes de
// maquina virtual e VPN aparecem antes da rede real em varias maquinas.
const VIRTUAL_NAME =
  /docker|veth|vmware|virtualbox|hyper-v|vethernet|wsl|zerotier|tailscale|openvpn|hamachi|wireguard|tap|tun|loopback|pseudo|bluetooth/i;

const isPrivateIpv4 = (address) =>
  PRIVATE_IPV4.some((pattern) => pattern.test(address));

/**
 * Escolhe o endereco de rede PRIVADO que o servidor deve escutar.
 *
 * So endereco privado serve. Um IP publico numa placa local e caso de maquina
 * mal configurada, e ligar o servidor nele exporia o painel para fora da rede.
 * Sem nenhum endereco privado devolvemos null, e o programa fica restrito a
 * este computador.
 *
 * @param {Record<string, {address: string, family: string|number, internal?: boolean}[] | undefined>} interfaces
 *   Formato de os.networkInterfaces().
 * @returns {{address: string, iface: string} | null}
 */
export function pickLanAddress(interfaces) {
  const candidates = [];
  for (const [iface, entries] of Object.entries(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      const family =
        typeof entry.family === "string" ? entry.family : "IPv" + entry.family;
      if (family !== "IPv4") continue;
      if (entry.internal) continue;
      if (/^169\.254\./.test(entry.address)) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      candidates.push({
        address: entry.address,
        iface,
        virtual: VIRTUAL_NAME.test(iface),
      });
    }
  }
  if (candidates.length === 0) return null;
  // Entre redes privadas, interface nao virtual tem prioridade; o nome da
  // placa serve de desempate para o resultado ser deterministico.
  candidates.sort(
    (a, b) =>
      Number(a.virtual) - Number(b.virtual) ||
      a.address.localeCompare(b.address),
  );
  const best = candidates[0];
  return { address: best.address, iface: best.iface };
}

export const isPrivateAddress = isPrivateIpv4;

/**
 * Gera a chave de acesso do Studio. Espelha o formato do servidor, que
 * tambem aceita uma chave definida no .env.
 */
export function generateKey(bytes) {
  return bytes.toString("base64url");
}

export const KEY_MIN_LENGTH = 16;

/** Lê um .env em texto, ignorando comentários, linhas em branco e aspas. */
export function parseEnv(text) {
  const out = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    )
      value = value.slice(1, -1);
    out.set(key, value);
  }
  return out;
}

const ENV_TEMPLATE = `# Election Broadcast 2026 - configurado pelo instalador.
# Gerado automaticamente. Apague este arquivo para refazer a instalacao.

# tse = oficial | tse-sim = simulacao do TSE | mock = ensaio local
DATA_MODE=tse
SIM_PORT=8788
# Endereco de rede detectado na instalacao. Use 127.0.0.1 para uso so neste PC.
HOST={HOST}
PORT=8787
# Chave do Studio. Troque por outra de no minimo 16 caracteres se precisar.
ADMIN_ACCESS_KEY={KEY}

TSE_HOST=resultados.tse.jus.br
TSE_POLL_INTERVAL_MS=10000
TSE_MIN_REQUEST_INTERVAL_MS=1000
TSE_TIMEOUT_MS=8000
DEFAULT_UF=mg
DEFAULT_MUNICIPALITY_NAME=Teofilo Otoni
`;

/**
 * Monta o .env final. Gera a chave quando ainda nao existe e nunca sobrescreve
 * uma chave ja instalada, para que reinstalar o programa nao derrube o acesso
 * do operador.
 *
 * @returns {{text: string, key: string, keyPreserved: boolean}}
 */
export function buildEnv({ existing = "", host, key: newKey }) {
  const previous = parseEnv(existing);
  const previousKey = previous.get("ADMIN_ACCESS_KEY") ?? "";
  const preserved = previousKey.length >= KEY_MIN_LENGTH;
  const key = preserved ? previousKey : newKey;
  return {
    text: ENV_TEMPLATE.replace("{HOST}", host).replace("{KEY}", key),
    key,
    keyPreserved: preserved,
  };
}

/**
 * Normaliza o HOST do .env para um endereco que o operador consegue digitar.
 *
 * Isso importa porque o servidor fica ligado apenas no HOST configurado. Se o
 * HOST for um IP concreto da rede, digitar 127.0.0.1 nao funciona, porque o
 * Windows nao entrega pacotes de loopback num socket preso ao IP da placa de
 * rede. Entao a URL que aparece para o operador tem que ser a mesma que o
 * servidor esta escutando.
 *
 * @param configured valor de HOST no .env
 * @param lanAddress IP privado detectado, usado quando o HOST e curinga
 */
export function resolveHost(configured, lanAddress) {
  const host = String(configured ?? "").trim();
  if (!host || host === "0.0.0.0" || host === "::" || host === "[::]")
    return lanAddress || "127.0.0.1";
  if (host.toLowerCase() === "localhost") return "127.0.0.1";
  return host.replace(/^\[/, "").replace(/\]$/, "");
}

/** Como o operador encontra o servidor, seja no PC dele ou em outro da rede. */
export function buildUrls(host, port, lanAddress) {
  const reachable = resolveHost(host, lanAddress);
  const base = `http://${reachable}:${port}`;
  return {
    host: reachable,
    base,
    studio: `${base}/studio`,
    overlay: `${base}/overlay/program`,
    health: `${base}/health`,
  };
}

/**
 * Problemas de pasta que quebram o SQLite ou a execucao. Retornar uma lista
 * (vazia = tudo certo) permite mostrar avisos em vez de falhar a instalacao:
 * qualquer um desses casos ainda pode funcionar.
 *
 * @returns {{level: "erro"|"aviso", message: string}[]}
 */
export function classifyInstallPath(installDir) {
  const problems = [];
  const dir = String(installDir ?? "");
  const normalized = dir.replace(/\\/g, "/").toLowerCase();

  if (!dir)
    problems.push({ level: "erro", message: "Pasta de instalacao vazia." });
  if (!/^[a-z]:\//i.test(normalized))
    problems.push({
      level: "aviso",
      message: `Pasta fora do disco local do Windows: ${dir}`,
    });
  if (/onedrive|dropbox|google ?drive|nextcloud|box sync/i.test(normalized))
    problems.push({
      level: "erro",
      message:
        "Pasta dentro de servico de nuvem (OneDrive/Dropbox/Google Drive). O banco de dados fica corrompido pela sincronizacao. Instale fora da pasta sincronizada.",
    });
  if (/[^a-z]:\/[^/]*\s[^/]*/i.test(normalized))
    problems.push({
      level: "aviso",
      message: `A pasta tem espaco no nome: ${dir}`,
    });
  // `normalized` ja trocou as barras por "/", entao o padrao precisa usar "/"
  // e nao "\\": com "\\" a comparacao nunca casaria e o aviso nunca sairia.
  if (
    /\/(program files|program files \(x86\)|windows|windows system32)\//i.test(
      normalized,
    )
  )
    problems.push({
      level: "aviso",
      message:
        "Pasta dentro de Program Files ou Windows pode exigir permissao de administrador.",
    });
  return problems;
}

/**
 * Resumo que o instalador imprime e grava em CHAVE-DE-ACESSO.txt.
 *
 * `urlsEnsaio` e opcional para nao quebrar quem so tem um modo. Quando vem, o
 * cartao lista oficial e ensaio: o INSTALAR.bat sobe o ensaio na 8788, mas o
 * operador usa a 8787 no dia da eleicao, e um cartao com uma porta so deixava
 * ele copia um endereco que nao estava no ar.
 */
export function buildSummary({ urls, key, host, privateNetwork, urlsEnsaio }) {
  const lines = [
    "=".repeat(64),
    "  Election Broadcast 2026  -  INSTALADO",
    "=".repeat(64),
    "",
    "CHAVE DE ACESSO DO PAINEL",
    "",
    `    ${key}`,
    "",
    "PAINEL DO OPERADOR - MODO OFICIAL  (INICIAR-OFICIAL.bat)",
    "",
    `    Neste computador:   ${urls.studio}`,
  ];
  if (privateNetwork) {
    lines.push(
      `    De outro PC da rede: ${urls.studio}`,
      "",
      `    Computador servindo: ${host}`,
    );
  }
  if (urlsEnsaio) {
    lines.push(
      "",
      "PAINEL DO OPERADOR - MODO ENSAIO  (INICIAR-SIMULADO.bat)",
      "",
      `    Neste computador:   ${urlsEnsaio.studio}`,
    );
    if (privateNetwork)
      lines.push(`    De outro PC da rede: ${urlsEnsaio.studio}`);
  }
  lines.push(
    "",
    "ABA DA SAIDA  (a URL que vai para a transmissao, 1920 x 1080)",
    "",
    `    Modo oficial: ${urls.overlay}`,
  );
  if (urlsEnsaio) lines.push(`    Modo ensaio:  ${urlsEnsaio.overlay}`);
  lines.push(
    "",
    "=".repeat(64),
    "Para comecar, clique duas vezes em INICIAR-OFICIAL.bat.",
    "Para ensaiar sem risco, use INICIAR-SIMULADO.bat.",
    "=".repeat(64),
    "",
  );
  return lines.join("\r\n");
}

/**
 * Normaliza a pasta do programa recebida pela linha de comando.
 *
 * Existe por causa de uma armadilha real do Windows. "%~dp0" sempre termina em
 * barra, e a barra na sequencia da aspa de fechamento vira aspa escapada no
 * parser de argumentos: o script recebia `C:\pasta\"` em vez de `C:\pasta\`.
 * O Node resolvia isso para um caminho com uma aspa no fim, existsSync
 * devolvia false para tudo, e a instalacao abortava com "pacote incompleto"
 * mesmo com todos os arquivos presentes. O .bat ja manda "%~dp0." para evitar;
 * esta funcao e a segunda rede de seguranca, caso algum .bat volte a mandar
 * o caminho cru.
 *
 * @param {string} entrada caminho vindo de process.argv
 * @returns {string} caminho absoluto, sem aspas e sem barra final
 */
export function resolverRaiz(entrada) {
  const cru = String(entrada ?? ".")
    .replace(/"/g, "")
    .trim();
  const limpo = cru.replace(/[\\/]+$/, "") || ".";
  // Caminho com letra de unidade e UNC e sempre do Windows, mesmo quando o
  // script roda nos testes em Linux. Sem isso, resolve() de posix trataria
  // "C:\pasta" como caminho relativo e prefixaria o diretorio atual.
  return /^[a-z]:[\\/]/i.test(limpo) || limpo.startsWith("\\\\")
    ? win32.resolve(limpo)
    : resolve(limpo);
}
