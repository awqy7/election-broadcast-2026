# Entrega para o cliente

## O que é

Um instalador que leva o programa pronto para o PC do servidor da transmissão.
Sem Node, sem npm, sem internet na instalação, sem senha de administrador.

O operador abre o painel no navegador, escolhe a cena e manda para o ar. O
sistema entrega duas abas com URL e não se integra a nenhum outro programa.

## Arquivos

| Arquivo                                     | Para quem                           |
| ------------------------------------------- | ----------------------------------- |
| `Instalar-ElectionBroadcast2026.exe`        | Cliente final. É o que ele recebe.  |
| `Instalar-ElectionBroadcast2026.exe.sha256` | Conferência de integridade.         |
| `MANUAL-OPERADOR.txt`                       | Vai junto na instalação.            |
| `ElectionBroadcast2026-win-x64.zip`         | Backup. Só usar se o `.exe` falhar. |

## Como gerar

```bash
pnpm install
node scripts/build-delivery.mjs
```

O script roda `format:check`, `lint`, `typecheck`, `test` e `build` antes de
qualquer coisa. Se um desses falhar, ele para: **não existe pacote com teste
quebrado**.

Depois, no Windows, dê dois cliques em **`COMPILAR-EXE.bat`**, na raiz do
projeto. Ele baixa o Inno Setup 6 se preciso e gera o `.exe`.

O passo a passo para o cliente está em
[ENVIAR-AO-CLIENTE.md](ENVIAR-AO-CLIENTE.md).

## O que o pacote contém

```
Instalar-ElectionBroadcast2026.exe
  e quando o operador instala:
    runtime/node/node.exe          Node 22 portátil (o que faz o programa rodar)
    node_modules/                  dependências, sem link simbólico
      better-sqlite3/...           driver do banco, compilado para Windows x64
    dist/server/main.js            servidor
    dist/web/                      painel do operador
    INSTALAR.bat                   configuração inicial
    INICIAR.bat                    menu do dia a dia
    INICIAR-OFICIAL.bat            modo ao vivo (abre as duas abas)
    INICIAR-SIMULADO.bat           modo de ensaio
    MANUAL-OPERADOR.txt
    docs/
```

## Decisões que sustentam o pacote

**Sem link simbólico.** O pnpm organiza `node_modules` com links simbólicos, e
o Windows só cria link simbólico com administrador ou com o Modo Desenvolvedor.
Extrair essa árvore no PC do cliente quebraria. Por isso o pacote é montado com
`node-linker=hoisted`, que gera uma árvore plana, e `node_modules/.bin` é
removido por não ser usado em execução.

**Driver do banco trocado.** `better-sqlite3` é nativo. Compilado no Linux de
build, o `.node` não roda no Windows. O empacotador baixa o artefato oficial
`win32-x64` do mesmo release e verifica o cabeçalho `PE`.

**Só o `node.exe`.** O pacote dispensa `npm`, `npx` e `corepack` em execução.
Cortar o resto reduz o instalador em dezenas de megabytes.

**Installer sem privilégio.** `PrivilegesRequired=lowest` e instalação em
`%LOCALAPPDATA%`. Um prompt de UAC no meio de uma transmissão é problema.

**Sem inicialização automática.** O servidor precisa ser aberto todo dia e em
um modo específico (ensaio ou oficial). Um atalho na inicialização do Windows
esconderia essa escolha e poderia subir em modo errado.

**Duas abas, nada mais.** O instalador abre só o painel e a saída. O sistema não
fala com nenhum programa de transmissão: não há API de terceiro, rota de
controle nem botão que atue fora do navegador. A verificação do empacotador
falha a build se a palavra `vMix` reaparecer em qualquer arquivo entregue.

**Endereço de rede vem do `.env`.** O servidor fica ligado apenas no IP privado
detectado, e não em `0.0.0.0`. Isso evita expor o painel por uma rede de
visitante no Wi-Fi do local. Os `.bat` leem o endereço do `.env` para mostrar a
URL certa, já que `127.0.0.1` não responde quando o socket está preso ao IP da
placa.

**Chave gerada na máquina do cliente.** O `.env` e o `CHAVE-DE-ACESSO.txt` não
viajam no pacote. A chave é criada na primeira execução e preservada nas
reinstalações, para não derrubar a sessão de quem já estava usando.

## Verificações que o empacotador faz

Antes de compactar, e falha se algo estiver errado:

- zero link simbólico em todo o pacote;
- `better_sqlite3.node` e `node.exe` com assinatura `PE` válida e 64 bits;
- nenhum caminho de dependência da plataforma de build (linux-x64, darwin-arm64);
- nenhum `.env`, `CHAVE-DE-ACESSO.txt` ou `data` no pacote;
- os 4 `.bat`, o `dist` compilado e o manual presentes;
- `dist/server/main.js` com o SQL embutido e sem referência a
  `apps/server/migrations`;
- o ZIP reextraído bate arquivo a arquivo com a pasta de origem.

## Teste no Windows

O que **não** dá para verificar no Linux:

1. O `.exe` compila e instala sem pedir administrador.
2. `better_sqlite3.node` carrega de fato (só o cabeçalho `PE` é conferido aqui).
3. Os `.bat` funcionam no `cmd.exe`.
4. As duas abas abrem e a URL da LAN responde no segundo computador.
5. A URL da saída carrega transparente na máquina da transmissão.

Checklist completo em [VALIDATION.md](VALIDATION.md).
