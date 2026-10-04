# Validação da entrega — 03/10/2026

Ambiente executado: Linux x64, Node 22.22.1, pnpm 10.34.6, Chromium do Playwright. O PC Windows/vMix da emissora não está disponível neste ambiente.

## Comandos executados

| Verificação                         | Resultado                                                   |
| ----------------------------------- | ----------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | PASS                                                        |
| `pnpm format` / `pnpm format:check` | PASS                                                        |
| `pnpm lint`                         | PASS                                                        |
| `pnpm typecheck`                    | PASS                                                        |
| `pnpm test`                         | PASS: 30 testes em 3 arquivos                               |
| `pnpm build`                        | PASS: frontend e servidor compilados                        |
| `pnpm test:e2e`                     | PASS: 6 cenários, incluindo cinco comparações golden        |
| `pnpm dev` em porta isolada         | PASS: health e login do Studio abriram, sem erro JavaScript |
| Servidor de produção e `/health`    | PASS: server/database/tse = ok                              |
| `node scripts/verify-local.mjs`     | PASS: 11 verificações, sem erros JavaScript                 |

A suíte cobre contratos oficiais capturados, herança de partido, ordenação, percentual oficial, estados, isolamento preview/programa, HOLD persistido, reinício, rejeição de snapshots regressivos/inválidos, cache, 304, backoff, limite global, autenticação/origem, backup ZIP, foto e API vMix contra servidor local de teste.

O Playwright exercita busca, TOP → individual → comparação, TAKE/CLEAR, HOLD durante alteração, reconexão SSE e os cinco overlays. Foram capturados screenshots 1920×1080 e verificações de viewport com larguras 960, 634 e 480 (aproximadamente 50%, 33% e 25%). A cor computada de body é transparente e `artifacts/overlay-official-waiting.png` tem RGBA com alfa zero fora do módulo.

## Fonte oficial

EA11, EA12, EA14, EA15 e EA20 responderam e foram validados pelo motor. Município foi descoberto por nome no EA12; nenhuma adivinhação de código. Consultas repetidas confirmaram 304 e uso dos validadores HTTP. Foram preservadas oito fotos oficiais em cache local durante a validação.

Abrangências/cargos confrontados na fonte real: Governador em Teófilo Otoni e Minas Gerais; Presidente em Teófilo Otoni e Brasil. Na verificação, todos informavam pré-apuração (`and=n`). Nenhum voto de fixture foi usado em modo oficial. Situações de mudança de liderança, resultado final/segundo turno, substituição e falhas foram verificadas em simulação/contratos de teste, não apresentadas como ocorrências da eleição real.

O estado DELAYED observado no relatório significa fonte acessível sem novo conteúdo. Não houve erro de processo nos logs revisados; os últimos fetches oficiais eram 304 sem erro. O relatório guarda os horários exatos e não deve ser interpretado como monitoramento futuro.

## Evidências

- `artifacts/local-verification.json`: diagnóstico e recursos oficiais consultados.
- `artifacts/studio-official-1920x1080.png`: Studio com fonte oficial.
- `artifacts/overlay-official-waiting.png`: output transparente pré-apuração.
- `tests/e2e/golden/{top4,candidate,compare2,progress,ticker}.png`: regressão visual mock.
- `test-results/studio-1920x1080.png` e `test-results/legibility-*.png`: capturas de ensaio; regeneradas por Playwright.

## Validações externas que permanecem

1. Instalação e ensaio no **PC Windows/vMix real**, incluindo transparência, canal Overlay, API local e desempenho sob carga de transmissão. O teste de API usou um servidor HTTP de teste; não equivale a operar o aplicativo vMix.
2. Conferência dos dados oficiais com votação, parcial/final e situações eleitorais **quando o TSE iniciar a totalização**. O contrato pré-apuração já foi verificado; não é possível afirmar que estados futuros da fonte foram observados ao vivo.

Não há inferência de vencedor, fallback mock no oficial nem tarefas críticas marcadas como TODO. A homologação broadcast deve seguir `ELECTION_DAY_RUNBOOK.md` antes de colocar resultados no ar.

## Revisão para entrega ao cliente — simulado TSE e controles

- Ambiente `tse-sim` conectado a `resultados-sim.tse.jus.br/simulado/simulado2026`, com bancos, fotos, snapshots e cookies separados do oficial.
- `node scripts/verify-simulation.mjs`: 11 PASS e nenhum erro JavaScript. EA11/EA12/EA14/EA15/EA20 validados.
- Sete combinações de cargo/abrangência: todos os cinco cargos de Teófilo Otoni, Governador/MG e Presidente/Brasil. Arquivos retornados com votos e 100% de seções; geração em 29/09/2026. São resultados simulados, não votos da eleição oficial.
- Regressão corrigida: Individual não acende COMPARAR; ao entrar em comparação, o candidato atual não é removido por engano. Trocar comparação por Individual mantém somente um selecionado.
- Testes de navegador também cobrem seleção máxima de quatro, remoção/limpeza, favoritos, composição, atalhos, todos os botões do painel mock, upload/remoção de logo, identidade, diagnóstico, exportação e logout.
- Upload de logo preserva campos de identidade ainda não salvos.
- Limite de API local separa leitura (1200/min) e comandos (240/min), por IP; login continua com 8/min. Assets não consomem cota. Evita bloqueio dos controles sob uso intenso. Limite global de consultas TSE permanece independente e inalterado.
- Comandos da API vMix testados contra servidor HTTP de teste; botões permanecem desabilitados quando integração não está configurada.
- `artifacts/simulation-verification.json` e capturas `studio-simulado-tse-1920x1080.png`, `overlay-simulado-tse.png` registram a validação.

Para instalar e ensaiar no computador do cliente, siga `docs/ENTREGA_CLIENTE.md`.
Os scripts Windows foram revisados, mas só a execução na máquina Windows/vMix pode concluir essa homologação externa.

## Conferência do pacote

ZIP extraído em diretório temporário limpo, sem reutilizar `node_modules` nem
banco da instalação principal. `pnpm install --frozen-lockfile` baixou as
330 dependências e instalou o binário SQLite; `pnpm build` passou.
A cópia extraída iniciou em modo mock e passou na verificação de SQLite,
login, Studio, comando TAKE, SSE e overlay transparente via Chromium.
O ensaio de instalação usou rede; instalação offline não é prometida.
O ZIP foi verificado quanto à integridade e não contém `data`, chaves,
`.env` local nem dependências nativas copiadas de Linux.

## Revisão das fotos

O motor agora prepara todas as fotos dos cargos consultados, com prioridade
para TOP e seleção manual, fila serial e cache persistente. O Studio mostra
progresso e falhas. Nova tentativa explícita respeita 10 minutos por falha;
três falhas consecutivas suspendem o lote para proteger a fonte. Não há
polling de fotos individuais. Testes cobrem cache, recuperação de ausência,
respeito ao intervalo e interrupção do lote com falhas. A suíte passou com
30 testes e os mesmos seis cenários Playwright. Fotos não publicadas pelo
TSE não podem ser garantidas pelo sistema.

A verificação de navegador desta revisão confirmou 11/11 fotos oficiais de
Governador em Teófilo Otoni, todas decodificadas. No simulado de Deputado
Federal, o resultado continha 1.272 candidatos; a fila estava progredindo,
sem falhas, e não foi apresentada como totalmente concluída. Evidências em
`artifacts/photo-verification.json` e `artifacts/photos-*-1920x1080.png`.

## Pacote de instalação Windows — 03/10/2026

`node scripts/build-delivery.mjs` monta o pacote e falha se qualquer verificação
não passar. Resultado desta rodada:

| Verificação                                                      | Resultado                                    |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `format:check`, `lint`, `typecheck`, `test` (64 testes), `build` | PASS                                         |
| Instalação de produção com `node-linker=hoisted`                 | PASS: 3955 arquivos, **zero link simbólico** |
| Driver do banco substituído pelo artefato oficial                | PASS: `better_sqlite3@12.11.1` win32-x64     |
| `runtime/node/node.exe` do Node `v22.23.3`                       | PASS: 86,97 MB                               |
| Assinatura PE dos dois binários                                  | PASS: AMD64, PE32+, DLL e EXE                |
| Caminhos da plataforma de build no pacote                        | PASS: nenhum `linux-x64`/`darwin-*`          |
| Ausência de `.env`, `CHAVE-DE-ACESSO.txt` e `data`               | PASS                                         |
| SQL embutido em `dist/server/main.js`                            | PASS                                         |
| ZIP reextraído comparado com a pasta de origem                   | PASS: 3955/3955 arquivos                     |
| Tamanho compactado                                               | 45,4 MB                                      |
| Reexecução do instalador preservando a chave                     | PASS                                         |

### Prova de que o pacote funciona

O ZIP foi extraído em diretório limpo e, trocando **apenas** o
`better_sqlite3.node` pelo binário Linux (todo o resto idêntico ao que vai para
o Windows), o programa foi iniciado a partir da pasta extraída:

| Checagem                                          | Resultado                  |
| ------------------------------------------------- | -------------------------- |
| `/health`                                         | server ok, db ok           |
| Caminhos resolvidos                               | relativos à pasta extraída |
| `GET /studio`                                     | HTTP 200                   |
| Login com a chave gerada pelo próprio `setup.mjs` | HTTP 200                   |
| `GET /api/studio` sem cookie / com cookie         | 401 / 200                  |
| `/test` fora do modo `mock`                       | 404 com mensagem           |
| `GET /api/events` (SSE do overlay)                | evento `state` recebido    |
| Erros ou fatais no log                            | 0                          |

Isto isola a única dependência de plataforma: todo o JavaScript, resolução de
caminhos, banco, autenticação e streaming funcionam a partir do ZIP.

### Bugs encontrados e corrigidos nesta rodada

1. `pickLanAddress` devolvia IP público quando não havia rede privada. Isso
   escreveria um `HOST` público no `.env` e exporia o painel. Agora só endereços
   privados são aceitos; sem rede local, o programa fica no loopback.
2. O aviso de pasta dentro de `Program Files` nunca disparava: o caminho era
   normalizado para `/` e o padrão comparava `\\`.
3. Os quatro `.bat` mostravam e testavam `127.0.0.1` mesmo com o servidor preso
   ao IP da rede, onde o loopback não responde. Passaram a ler o endereço do
   `.env` via `scripts/env-url.mjs`.
4. `node_modules/.bin` carregava links simbólicos de pacotes com executável que
   não são usados em execução; removidos do pacote.
5. `artifacts/` não estava nas listas de ignore do ESLint e do Prettier, o que
   fazia o lint varrer o staging inteiro.

Os quatro primeiros só apareceram porque há testes: `tests/setup.test.ts` com 34
casos para as funções do instalador.

### Validações externas que permanecem

1. Compilar `scripts/ElectionBroadcast2026.iss` no Inno Setup 6 e confirmar que
   o `.exe` instala sem pedir administrador.
2. Carregar de fato `better_sqlite3.node` no Windows. Aqui só o cabeçalho `PE`
   foi conferido; **o binário nunca foi executado em Windows**.
3. Executar os quatro `.bat` no `cmd.exe`, incluindo o `for /f` que lê a URL.
4. Confirmar que o PC do vMix, na mesma rede, abre `/overlay/program`.
5. Confirmar que `node.exe` sozinho basta, sem DLLs adicionais do pacote Node.

Estes itens exigem o PC Windows e não podem ser concluídos no Linux.

## Remoção do acoplamento com vMix — 03/10/2026

O sistema não deve falar com nenhum programa de transmissão. Ele entrega duas
abas com URL, e quem recebe a transmissão cola a URL da saída na máquina dele.

### O que saiu

| Arquivo                        | Removido                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `packages/broadcast/vmix.ts`   | arquivo inteiro (`VmixController`)                                                                                    |
| `apps/server/app.ts`           | import, instância, `GET /api/vmix/status`, `POST /api/vmix/:action`, campo `vmix` no `/health`, rota da lista pública |
| `apps/web/src/studio.tsx`      | tipo `vmix` no health, selo `VMIX` na faixa de status, botões `VMIX TAKE` / `VMIX CLEAR`                              |
| `apps/web/src/style.css`       | `.vmix-actions` → `.output-actions`                                                                                   |
| `packages/core/diagnostics.ts` | tipo e dependência `vmix`, verificação `vMix` do diagnóstico                                                          |
| `packages/shared/index.ts`     | `VMIX_OFFLINE`                                                                                                        |
| `apps/server/main.ts`          | `VMIX_ENABLED=false` no modo simulado; log "Entrada do vMix" → "Aba da saida"                                         |
| `scripts/setup-core.mjs`       | cinco variáveis `VMIX_*` do `.env`; rótulo do resumo                                                                  |
| `scripts/show-info.mjs`        | rótulos das URLs                                                                                                      |
| quatro `.bat`                  | `set VMIX_ENABLED=false` e toda menção em texto                                                                       |
| `tests/services.test.ts`       | teste do backend vMix                                                                                                 |
| `docs/VMIX_SETUP.md`           | renomeado para `docs/DOIS-ENDERECOS.md` e reescrito                                                                   |

### O que ficou, de propósito

- `GET /overlay/program` e as demais rotas `/overlay/*`: são as URLs que o
  operador entrega. Servir a página não é integrar-se a nada.
- O botão **Abrir a saída** no painel: é um link para a própria aba 2.
- O texto "transmissão" nos manuals e no runbook: é o destino da URL, não uma
  integração.

### Trava permanente

`build-delivery.mjs` falha se a palavra `vMix` reaparecer em qualquer `.bat`,
script de instalação, `MANUAL-OPERADOR.txt`, `dist/server/main.js` ou no bundle
do navegador. A primeira execução dessa trava pegou o manual, que ainda
descrevia a configuração antiga.

Também passam a ser verificados, porque só falhariam na máquina do cliente:

- todo script `scripts\*.mjs` citado por um `.bat` existe no pacote;
- todo `goto` de um `.bat` tem rótulo correspondente;
- os quatro `.bat` são ASCII puro, já que o `cmd.exe` não tem como declarar a
  codificação do arquivo.

### Verificação

| Checagem                                           | Resultado        |
| -------------------------------------------------- | ---------------- |
| `format:check`, `lint`, `typecheck`                | PASS             |
| `pnpm test`                                        | PASS: 63 testes  |
| `pnpm test:e2e`                                    | PASS: 6 cenários |
| `pnpm build`                                       | PASS             |
| varredura `vmix` em código, `.bat`, manual, bundle | 0 ocorrências    |
| Travisão: e2e exige que não exista botão `/VMIX/i` | PASS             |

Os registros deste arquivo que citam vMix em rodadas anteriores descrevem
código que **não existe mais**. Estão mantidos por honestidade do histórico,
não como descrição do sistema atual.

## Verificações do instalador Inno Setup — 03/10/2026

O `.exe` não pode ser compilado no Linux, então o `.iss` é conferido por
análise estática antes de qualquer Windows ser involved.

### Bug encontrado e corrigido

`scripts/ElectionBroadcast2026.iss` apontava `StageDir` para
`runtime-stage\ElectionBroadcast2026`, caminho que **não existe**: o staging é
montado em `artifacts/runtime-stage/`. Pior, o Inno Setup resolve caminhos
relativos a partir da pasta do próprio `.iss`, que é `scripts\`, então
`OutputDir=artifacts` também resolveria para `scripts\artifacts`.

O instalador teria compilado com a lista de arquivos vazia e gerado um `.exe`
que não instala nada. Só apareceria na máquina do cliente.

Corrigido para `..\artifacts\runtime-stage\ElectionBroadcast2026` e
`..\artifacts`, com comentário no arquivo explicando o porquê.

### Verificações automáticas

`build-delivery.mjs` agora resolve os `#define` e os `Source:` do `.iss`
emulando a resolução de caminhos do Windows e falha quando:

- `StageDir` não aponta para o staging real;
- algum `Source:` não existe;
- `OutputDir` cai fora do projeto.

A checagem foi testada nos dois sentidos: quebrando `StageDir` de propósito,
o build falha com o caminho errado na mensagem; restaurando, passa.

### `ArchitecturesAllowed`

Troca de `x64compatible` para `x64`. O primeiro token só existe a partir do
Inno Setup 6.3; o segundo vale em todas as versões 6, o que evita o instalador
falhar numa máquina com a 6.2 instalada.

### Vazamento de caminho da máquina de build

`node_modules/.modules.yaml` do pnpm carregava o caminho absoluto do usuário
de quem montou o pacote, dentro do artefato entregue. O arquivo é bookkeeping interno do pnpm e não serve para nada em
execução; foi removido do pacote, junto com a remoção de `node_modules/.bin`.

O build agora falha se o `homedir()` ou a raiz do projeto aparecerem em
qualquer arquivo de texto do pacote. A busca é pelo caminho **real** desta
máquina, e não por um padrão `/home/*`: pacotes publicados trazem no próprio
código o caminho de casa dos autores upstream — `/home/fred` em
`sqlite3.c`, `/home/leonardo` em testes do `fastify-plugin` — e uma busca ampla
acusaria falsamente o projeto upstream, não um vazamento nosso.

### `COMPILAR-EXE.bat`

Script ASCII na raiz que roda no Windows e faz o passo final sozinho: baixa o
Inno Setup 6 se não estiver instalado, compila o `.iss` e confere se o `.exe`
apareceu. Sem duplo clique em botão dentro de interface.

### Permanece dependente de Windows

1. O `.iss` compila sem erro de sintaxe.
2. `ISCC.exe` é encontrado nos caminhos padrão.
3. O `.exe` instala sem pedir administrador.
4. O binário `better_sqlite3.node` carrega no Windows.

### Ordem de subida do servidor e das abas

`INICIAR-OFICIAL.bat` e `INICIAR-SIMULADO.bat` esperavam `/health` **antes** de
cair no laço que sobe o servidor. Em partida fria isso custava de 30 a 60
segundos parados, e as duas abas eram abertas com o programa ainda fora do ar
— exatamente o que o comentário ao lado dizia evitar. Quem usasse no dia
veria "não foi possível acessar o site" e culparia a rede.

O servidor ocupa a janela em primeiro plano por causa do laço de reinício, então
a espera não pode ficar no mesmo `.bat` antes dele. Criado
`scripts/abrir-abas.mjs`, disparado com `start "" /b` em paralelo: ele espera o
`/health`, e só então abre as duas abas. Se o servidor não subir, ele sai com
código 1 sem abrir nada, para o operador ver a mensagem do `.bat` em vez de uma
página de erro.

O `.bat` do menu passou a abrir as duas abas também, e não só o painel.

`build-delivery.mjs` verifica a ordem: o auxiliar tem de ser chamado antes do
`dist\server\main.js`, e `wait-for-health.mjs` não pode reaparecer em primeiro
plano nos `.bat` de modo. Verificado nos dois sentidos — restaurando a espera
antiga e invertendo a ordem, o build falha com o motivo correspondente.

O auxiliar foi testado contra um servidor real de teste, subindo e derrubado no
próprio teste: servidor no ar abre as duas abas; servidor fora não abre nada e
sai com 1; barras duplicadas no fim da URL não viram `//`; e quando o servidor
só sobe depois, as abas abrem assim que ele responde (medido em 2798ms).

### Docs dentro do pacote

`docs/` inteiro ia junto, incluindo `ARCHITECTURE.md`, `ENTREGA_CLIENTE.md`,
`ENVIAR-AO-CLIENTE.md`, `TSE_INTEGRATION.md` e este `VALIDATION.md`. É
histórico de engenharia: não ajuda na operação e expõe decisões internas para
quem vai usar o programa.

Agora o pacote leva só `DOIS-ENDERECOS.md`, `INSTALACAO-WINDOWS.md`,
`TROUBLESHOOTING.md` e `ELECTION_DAY_RUNBOOK.md`.

Isso apareceu porque a checagem de caminho de build acusou
`docs/VALIDATION.md`, que eu mesmo havia escrito citando o caminho do usuário
ao descrever o vazamento de `.modules.yaml`. A trava funcionando pegou o erro
na origem.

## Validação real do instalador no Windows via Wine — 04/10/2026

O Wine 10 foi instalado e o instalador foi executado de verdade: silêncio,
`INSTALAR.bat`, servidor, rede, autenticação e desinstalação. Foi a primeira
vez que o fluxo inteiro do ponto de vista do cliente rodou, e ele estava
quebrado por três bugs que nenhuma revisão de código havia pego.

### `"%~dp0" sozinho vira aspa escapada (quebrava a instalação)

`INSTALAR.bat` abortava logo no primeiro passo:

```
[1/6] Conferindo os arquivos do programa
FALHOU: O pacote esta incompleto. Faltou: Servidor compilado (dist/server/main.js), ...
```

Os quatro arquivos existiam. A causa é o parser de argumentos do Windows:
`%~dp0` sempre termina em barra, e uma barra na sequência da aspa de
fechamento é tratada como aspa escapada. O script recebia
`C:\...\ElectionBroadcast2026"` — com uma aspa no fim —, o `resolve()`
aceitava, e `existsSync` devolvia falso para tudo.

Não é limitação do Wine: é o comportamento documentado do `CommandLineToArgvW`.
Um `.bat` passa `%~dp0` quase sempre colado a um nome de arquivo
(`"%~dp0scripts\setup.mjs"`), e aí a barra não fica antes da aspa. O defeito só
aparece quando o caminho é passado sozinho, que era exatamente o caso do
argumento da pasta.

Corrigido com `"%~dp0."` nos seis lugares (o ponto some no `resolve()`), mais
`resolverRaiz()` em `setup-core.mjs` como segunda rede: ela descarta aspas e
barras finais. Provado que a segunda rede funciona passando o argumento quebrado
de propósito — o `argv` chega com a aspa e mesmo assim o diagnóstico roda.

`build-delivery.mjs` recusa `"%~dp0"` como argumento, verificando nos dois
sentidos. `cd /d "%~dp0"` é interno do `cmd` e fica de fora.

### `%ProgramFiles(x86)%` fecha a lista do `for`

`COMPILAR-EXE.bat` não achava um Inno Setup que estava instalado e saía
tentando baixar de novo. Em `for %%I in ( "%ProgramFiles(x86)%\..." )`, o
`)` de `(x86)` fecha a lista antes da hora. Confirmado no Windows: a mesma
busca em `if exist` em linha solta acha o arquivo, e o mesmo caminho dentro de
`if (...)` dá erro de sintaxe. Reescrito com `if exist` e o caminho montado
antes em variável.

### `COMPILAR-EXE.bat` lia `%TMP%` e `%IS_TAM%` antes do `set`

Dentro de bloco, `%TMP%` é expandido quando o bloco é lido, antes do `set`
rodar: o download ia para um caminho vazio. Corrigido com
`setlocal EnableDelayedExpansion` e `!`.

### URL do Inno Setup devolvia HTML

`https://jrsoftware.org/download.php/is.exe` responde 200 com uma página de
HTML de 10 KB, e o `cmd` a executava como se fosse o instalador. Versão fixada
em 6.7.3 pela URL direta do release, e o download passa a ser conferido por
tamanho: menos de 1 MB é página de erro, não instalador. Testado nos dois
sentidos (7.200 bytes rejeitado, 1.500.002 aceito).

### O que passou depois das correções

| Verificação                              | Resultado                                             |
| ---------------------------------------- | ----------------------------------------------------- |
| Instalação silenciosa do `.exe`          | saída 0, 3.797 arquivos                               |
| `INSTALAR.bat` completo                  | 6/6 passos, servidor no ar                            |
| `/health`, `/studio`, `/overlay/program` | 200                                                   |
| `/test`                                  | 404                                                   |
| Rota protegida sem sessão                | 401                                                   |
| `INICIAR-SIMULADO.bat`                   | servidor no ar em ~5s, URLs resolvidas pelo IP da LAN |
| `COMPILAR-EXE.bat`                       | saída 0, 28.986.288 bytes                             |
| Desinstalação                            | 3.814 → 17 arquivos                                   |
| `format`, `lint`, `typecheck`, testes    | 73 testes passando                                    |

Sobraram na desinstalação só `.env`, `CHAVE-DE-ACESSO.txt` e `data\` — os
arquivos que o programa cria depois de instalado, onde ficam a chave de acesso
e o cache do TSE. Não há `[UninstallDelete]` de propósito; quem desinstala por
um problema passageiro não perde a chave. Deixei isso comentado no `.iss` para
ninguém "consertar" depois.

### Continua dependente de Windows real

1. Aviso do SmartScreen e o clique em **Mais informações**.
2. Atalhos aparecendo no menu Iniciar e na área de trabalho.
3. O navegador abrindo as duas abas de verdade (no Wine o `rundll32` não abre).
4. `certutil -hashfile` mostrando o SHA256 (falha neste prefixo por falta de
   DLLs de criptografia; existe em todo Windows).
5. Dois computadores físicos na mesma rede, com o segundo abrindo `/studio`.

### Uma armadilha do Wine que vale registrar

O `wineserver` fica preso se um processo launched continuar vivo, e o
`pkill -f wine64` não pega: depois de lançado, o processo aparece no `cmdline`
com o caminho do próprio executável. Esse servidor órfão segurava o prefixo e
fazia toda invocação nova ficar na fila, o que parecia "instalador quebrado" e
era "prefixo travado". Vale derrubar por PID, casando o caminho do prefixo.
