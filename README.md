> Compatibilidade de overlay 1.0.2: removida dependência de `Array.at()`; build para Chromium 86+. Diagnóstico em `/overlay/check`. Veja [orientações para navegador incorporado](docs/BROWSER_COMPATIBILITY.md).

> Instalador Windows 1.0.1: o atalho principal inicia diretamente o **OFICIAL**. A primeira abertura configura o sistema; falhas ficam em `data/startup.log` e a janela permanece aberta. O simulado exige abertura explícita pelo atalho separado.

# Election Broadcast 2026

## Baixar o instalador para Windows

O programa pronto está na [página de releases](https://github.com/awqy7/election-broadcast-2026/releases/latest):

- **`Instalar-ElectionBroadcast2026.exe`** (~28 MB) — é o arquivo para o cliente final. Dois cliques e instala.
- **`ElectionBroadcast2026-win-x64.zip`** (~44 MB) — plano B, para quem não puder usar instalador. Precisa ser extraído numa pasta, não aberto de dentro do ZIP.

O instalador **não é assinado**. O Windows vai mostrar o aviso azul de programa
desconhecido; o cliente clica em **Mais informações** e depois em **Executar
assim mesmo**. Não é problema do arquivo.

Confira o SHA-256 do que você recebeu antes de instalar:

```powershell
certutil -hashfile .\Instalar-ElectionBroadcast2026.exe SHA256
```

> **Entrega para quem vai operar:** comece por [docs/ENTREGA_CLIENTE.md](docs/ENTREGA_CLIENTE.md).

Sistema local de gráficos eleitorais. Node persistente, Fastify, SQLite, React/Vite e SSE. Os resultados oficiais são baixados exclusivamente pelo servidor do TSE. Studio e saída não consultam a fonte diretamente.

O sistema entrega **duas abas com URL** e não se integra a nenhum outro programa: não há API de terceiro, nem botão que controle algo fora do navegador. Quem recebe a transmissão cola a URL da saída na máquina dele.

## Instalar no Windows

Para o cliente final, use o instalador: `docs/ENTREGA_CLIENTE.md`. Ele traz o Node
portátil junto e não pede administrador.

Para desenvolver na sua própria máquina (Linux/macOS/Windows), você precisa de Node 22.12+ e pnpm:

1. `pnpm install`
2. Extraia ou mantenha o projeto numa pasta local gravável. Evite OneDrive/pastas de rede para SQLite.
3. Abra PowerShell nessa pasta:

```powershell
npm install -g pnpm@10.34.6
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm build
pnpm start
```

O driver SQLite tem binário pré-compilado para plataformas compatíveis; se npm solicitar compilação, instale as ferramentas C++ do Visual Studio Build Tools e Python. Não é necessário Docker, banco externo, serviço em nuvem nem chave TSE.

Abra `http://127.0.0.1:8787/studio`. Se `ADMIN_ACCESS_KEY` estiver vazia, o servidor cria uma chave em `data/admin-access-key.txt`. Abra **esse arquivo local** e use seu conteúdo no login. Não publique o arquivo nem a pasta `data`. É possível definir a chave no `.env` (mínimo 16 caracteres). A senha do computador não é usada.

A sessão dura 16 horas, é HttpOnly e precisa ser refeita após reiniciar o servidor. O overlay continua somente leitura, sem login. O preview requer a sessão do operador.

## Ensaio antes da transmissão

No `.env`, defina `DATA_MODE=mock`. Reinicie com `pnpm start` e acesse `/test`. O ambiente simulado tem sua própria base `data/mock/election.db`; o oficial usa `data/tse/election.db`. Nunca há fallback entre eles. Todas as cenas simuladas recebem identificação visível, inclusive no output.

O painel permite alterar votos, liderança, progresso, simular fonte offline, timeout, JSON inválido/parcial, foto ausente, substituição, anulação, anulado sub judice e segundo turno. A progressão automática percorre 0/3/12/25/48/67/82/95/99/100%; pause para ensaios controlados. Os nomes sintéticos existem apenas no gerador mock.

Em produção, volte para `DATA_MODE=tse` e reinicie. Os arquivos em `docs/specs/*-live.json` são evidências de teste capturadas da fonte e **não são fallback de produção**.

## Operação

1. Selecione abrangência e cargo.
2. Escolha TOP, individual, comparação, apuração ou ticker.
3. Para individual/comparação, selecione candidatos na tabela. A busca ignora acentos e caixa.
4. Confira o preview. Alterações de cena permanecem no preview até TAKE.
5. TAKE envia a composição para `/overlay/program`; CLEAR a retira imediatamente.
6. HOLD congela os dados do programa, inclusive após reinício. Desative HOLD antes de um novo TAKE.

Atalhos: `1…5` selecionam cenas, `Espaço` faz TAKE, `Esc` faz CLEAR. Atalhos são ignorados enquanto se digita em campos. Favoritos são atalhos e não alteram a ordenação do TOP. Empates são ordenados por número somente para estabilidade visual.

A URL da saída é **`http://IP-DO-SERVIDOR:8787/overlay/program`**, dimensão **1920 × 1080**. Mantenha a aba aberta. Ela é a única coisa que vai para a outra máquina. Veja [DOIS-ENDERECOS](docs/DOIS-ENDERECOS.md).

## Configuração

| Variável                    | Padrão / efeito                                              |
| --------------------------- | ------------------------------------------------------------ |
| DATA_MODE                   | `tse` oficial; `tse-sim` testes TSE; `mock` ensaio local     |
| HOST / PORT                 | `127.0.0.1` / `8787`                                         |
| ADMIN_ACCESS_KEY            | Chave local gerada quando vazia                              |
| DATA_DIR                    | `data`; diretório gravável para persistência                 |
| TSE_HOST                    | `resultados.tse.jus.br`, somente hosts TSE HTTPS             |
| TSE_POLL_INTERVAL_MS        | `10000`, mínimo 2500; jitter adicional                       |
| TSE_MIN_REQUEST_INTERVAL_MS | `1000`, mínimo 500; fila única incluindo fotos e diagnóstico |
| TSE_TIMEOUT_MS              | `8000`                                                       |
| DEFAULT_UF                  | `mg`                                                         |
| DEFAULT_MUNICIPALITY_NAME   | `Teófilo Otoni`, resolvido no EA12                           |

Os presets da interface são destinados à emissora em MG. O construtor de URLs e o resolvedor aceitam outras UFs/municípios. Configuração visual e marca opcional ficam em `/studio/settings`. As cores das barras são decorativas por posição.

Para LAN, aponte `HOST` para o IP privado da máquina. O instalador faz isso sozinho e mantém o servidor preso a esse IP, em vez de `0.0.0.0`, para não expor o painel por outra rede. Em rede fechada não é preciso abrir firewall; se o Windows perguntar, permita em **Rede privada** apenas. Não encaminhe a porta no roteador. O tráfego local é HTTP; use rede confiável. Sessão do Studio e APIs mutáveis são autenticadas e verificação de origem protege comandos no navegador.

## Desenvolvimento e verificações

```sh
pnpm dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm dev` usa Vite integrado com atualização de código e oferece a mesma porta do servidor. `pnpm start` utiliza o build de produção em `dist/web`.

As imagens de referência estão em `tests/e2e/golden`. `pnpm test:golden` atualiza as referências; revise-as antes de aceitar mudanças. Fontes do sistema variam entre Windows e Linux; regenere goldens somente após revisão na plataforma de teste adotada.

## Diagnóstico, backup e produção

`GET /health` fornece saúde, último fetch, alteração, snapshot, freshness, métricas e conexões. No Studio, abra o painel técnico e execute diagnóstico. PASS significa teste executado com sucesso; WARN pode significar resultado ainda não publicado, ausência de output conectado ou fonte simulada. Não trate WARN automaticamente como aprovação operacional.

Use `scripts/start-production.ps1` ou `scripts/start-production.bat` após instalar e compilar. O script PowerShell reinicia o processo após falha, com espera progressiva. Ctrl+C encerra a operação.

**Exportar backup** gera ZIP autenticado com cópia consistente SQLite, configuração, snapshots e logs recentes. Fotos não são incluídas. Para restaurar: pare o servidor, extraia `election.db` para a pasta do modo indicada no `manifest.json`, preserve uma cópia da base anterior e reinicie. Nunca restaure um backup mock na pasta oficial. O motor verifica a origem ao carregar snapshots.

Leia [arquitetura](docs/ARCHITECTURE.md), [integração TSE](docs/TSE_INTEGRATION.md), [runbook](docs/ELECTION_DAY_RUNBOOK.md) e [solução de problemas](docs/TROUBLESHOOTING.md).

## Simulado hospedado pelo TSE

Execute `pnpm build` e `pnpm start:sim` em um segundo terminal. Abra
http://127.0.0.1:8788/studio e use a mesma chave local. O oficial continua na
porta 8787; o simulado tem banco, snapshots, fotos e estado separados em
`data/tse-sim`. O overlay de ensaio é http://127.0.0.1:8788/overlay/program.
Studio e overlay exibem a identificação SIMULAÇÃO permanentemente.

Este modo consulta o servidor de testes do próprio Tribunal, não gera votos
localmente. Datas, eleições e diretórios são validados pelo EA11; o município
é resolvido pelo EA12. Não existe fallback para mock ou produção. O comando
`start:sim` usa `SIM_PORT` (padrão 8788). As duas abas continuam disponíveis
para ensaio, na mesma porta.

Segundo a [página técnica do TSE](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados),
as últimas janelas de progressão foram em 28 e 29/09/2026, das 14h às 16h.
Arquivos que continuam publicados podem estar finalizados e sem mudanças.
Para testar crescimento, troca de líder e falhas sob controle do operador,
use o modo `mock`; `/test` permanece bloqueado no simulado TSE e no oficial.

## Fotos dos candidatos

Ao carregar um cargo, o servidor enfileira todas as fotos daquele resultado.
Prioriza o TOP e a seleção manual, baixa uma por vez pelo limite global e
atualiza Studio/overlay sem refresh. Fotos já salvas são reutilizadas.
Em cargos com milhares de candidatos, prepare o cache com antecedência;
um limite de uma requisição por segundo significa dezenas de minutos.

O Studio mostra quantas fotos estão em cache, na fila ou indisponíveis.
**Rever fotos ausentes** permite nova tentativa das falhas depois de pelo
menos 10 minutos. Não há polling individual de fotos. Três falhas consecutivas
pausam o lote por 10 minutos para evitar bloqueio da fonte; fotos pendentes
podem retomar quando o cargo voltar a ser consultado. Fotos que o TSE não
publicou continuam com avatar neutro, sem inventar ou substituir a identidade.
Os caches oficial e simulado permanecem separados.
