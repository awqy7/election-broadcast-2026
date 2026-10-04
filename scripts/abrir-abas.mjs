// Espera o servidor responder e so entao abre as duas abas.
//
// Roda em paralelo com o .bat de modo, que ocupa a janela em primeiro plano
// com o laco de reinicio. Se a espera ficasse no .bat antes do laco, ela
// rodaria contra um servidor que ainda nao existe: atrasaria a partida e
// abriria as abas com "nao foi possivel acessar o site".
//
// A URL e resolvida aqui dentro, lendo o .env, em vez de o .bat capturar a
// saida com "for /f". Ver o comentario em base-url.mjs.
//
// Modo de uso: node abrir-abas.mjs <pasta-do-programa> <porta> [tentativas]
import { spawn } from "node:child_process";
import { ABAS, esperarPronto, resolveBase } from "./base-url.mjs";

const [appDir = ".", porta = "8787", tentativas = "60"] = process.argv.slice(2);
const base = resolveBase(appDir, porta);
const total = Number(tentativas) || 60;

// Imprime os enderecos antes de esperar, para que aparecam na tela mesmo se o
// servidor nao subir: e a informacao que o operador precisa para agir.
console.log(`\n  Painel:  ${base}/studio`);
console.log(`  Saida:   ${base}/overlay/program\n`);

const pronto = await esperarPronto(base, total);

// Servidor fora do ar: nao adianta abrir aba nenhuma, o operador veria pagina
// de erro e culparia a rede. O .bat mostra a orientacao de reiniciar.
if (!pronto) process.exit(1);

function abrir(url) {
  // rundll32 com FileProtocolHandler e a forma mais confiavel de handing uma
  // URL ao navegador padrao: nao depende das aspas do "start" do cmd, que
  // embaralha quando a URL tem & ou % em caminho de rede.
  return new Promise((pronto) => {
    if (process.platform !== "win32") {
      // Fora do Windows (desenvolvimento e testes) nao ha navegador para
      // abrir; mostrar o que teria aberto continua util.
      console.log(`   abrir: ${url}`);
      return pronto();
    }
    const filho = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      stdio: "ignore",
      detached: true,
    });
    filho.on("error", () => {
      // Sem rundll32 (raro): tenta o caminho classico do cmd.
      spawn("cmd.exe", ["/c", "start", "", url], {
        stdio: "ignore",
        detached: true,
      }).unref();
      pronto();
    });
    filho.unref();
    pronto();
  });
}

for (const aba of ABAS) await abrir(`${base}${aba}`);
