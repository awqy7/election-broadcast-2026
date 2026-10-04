// Espera o servidor responder, sem abrir aba nenhuma.
//
// Usado pelo INSTALAR.bat, que so quer saber quando o programa subiu para
// confirmar a instalacao. Quem abre as abas e o .bat do modo, numa janela
// separada, entao abrir aqui daria duplicata.
//
// A URL tambem e resolvida aqui dentro, pelo mesmo motivo do abrir-abas.mjs:
// nada de "for /f" no .bat.
//
// Modo de uso: node wait-for-health.mjs <pasta-do-programa> <porta> [tentativas]
import { ABAS, esperarPronto, resolveBase } from "./base-url.mjs";

const [appDir = ".", porta = "8787", tentativas = "60"] = process.argv.slice(2);
const base = resolveBase(appDir, porta);
const pronto = await esperarPronto(base, Number(tentativas) || 60);

if (!pronto) process.exit(1);

// Mostra os enderecos para o operador anotar, inclusive a URL da transmissao.
console.log(`\n  Painel:  ${base}${ABAS[0]}`);
console.log(`  Saida:   ${base}${ABAS[1]}`);
