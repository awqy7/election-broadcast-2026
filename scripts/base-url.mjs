// Resolve, dentro do Node, a URL base que o operador deve abrir.
//
// Por que isso existe em vez de o .bat capturar a saida com "for /f":
// o "for /f" do cmd executa o comando num PIPE. Funciona no Windows, mas
// passa a ser um ponto unico de falha: qualquer diferenca de quoting, um
// aviso a mais na saida, ou um Node que nao escreva em pipe (o Wine, por
// exemplo, faz o stdout do Node falhar com EBADF) e a variavel fica vazia.
// Aí o .bat cai no fallback 127.0.0.1, que NAO abre no outro PC, e o
// operador cai numa pagina de erro sem entender por quê.
//
// Resolvendo aqui dentro, o .bat nao precisa saber a URL: o script imprime
// e abre as abas sozinho.
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import {
  parseEnv,
  pickLanAddress,
  buildUrls,
  resolverRaiz,
} from "./setup-core.mjs";

/**
 * @param appDir pasta do programa instalado
 * @param port   porta do modo (8787 oficial, 8788 ensaio)
 */
export function resolveBase(appDir, port) {
  const envPath = join(resolverRaiz(appDir), ".env");
  const values = existsSync(envPath)
    ? parseEnv(readFileSync(envPath, "utf8"))
    : new Map();

  const lan = pickLanAddress(networkInterfaces());
  return buildUrls(values.get("HOST"), port, lan?.address).base;
}

// As duas abas que o operador precisa. Nao ha terceira.
export const ABAS = ["/studio", "/overlay/program"];

/** Espera /health responder. Devolve true quando respondeu. */
export async function esperarPronto(base, tentativas) {
  for (let i = 0; i < tentativas; i++) {
    const vivo = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(1500),
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (vivo) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Chamado direto pela linha de comando, imprime so a URL base, uma linha.
// Modo de uso: node env-url.mjs <pasta-do-programa> <porta>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [appDir = ".", porta = "8787"] = process.argv.slice(2);
  process.stdout.write(`${resolveBase(appDir, porta)}\n`);
}
