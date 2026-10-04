# Instalador 1.0.1 — inicialização oficial

Correção de 04/10/2026: o atalho principal anterior abria um menu que somente
consultava um servidor existente. A instalação também abria o simulado por
padrão. O atalho agora configura a primeira execução, inicia o servidor
OFICIAL, verifica `/health` e abre Studio e output. Não inicia testes
automaticamente. Configurações e banco existentes são preservados.

O iniciador reaproveita uma instância oficial já aberta, rejeita outro
ambiente ocupando a porta, trata IP antigo com fallback local e registra
falhas em `data/startup.log`. Há no máximo três tentativas de reinício; a
janela não desaparece em caso de erro. O atalho instalado usa `cmd /D /K`.

## Validação executada

- Formatter, lint, TypeScript e build: PASS.
- Vitest: 75 testes PASS.
- Playwright: 6 cenários PASS, incluindo regressão visual dos cinco overlays.
- Inno Setup 6 compilou o instalador Windows x64.
- Instalador executado silenciosamente em pasta nova com espaços, via Wine 10.
- Primeira abertura pelo `INICIAR.bat`: configura automaticamente, SQLite OK,
  `dataMode=tse`, TSE OK.
- Login, Studio, preview, TAKE/SSE e transparência verificados com Chromium
  contra o servidor Windows instalado; nenhum erro JavaScript.
- Atalho `.lnk` real criado pelo instalador abriu e reutilizou o servidor.
- PORT inválida provocada no ambiente de QA: erro no log e terminal permaneceu
  aberto. Configuração restaurada após o teste.

As verificações do executável foram realizadas com Wine em Linux, não em uma
máquina física Windows do cliente. SmartScreen/antivírus e particularidades
da máquina do cliente não foram avaliados aqui. Não afirmamos ter reproduzido
o erro específico dessa máquina sem seu log.

## Atualizar

Baixe o instalador da versão 1.0.1 no GitHub. Encerre a janela do programa
antigo e instale na mesma pasta. Não apague `data`, `.env` nem
`CHAVE-DE-ACESSO.txt`. Abra o atalho Election Broadcast 2026. Ele inicia o
OFICIAL diretamente; ensaio só pelo arquivo separado `INICIAR-SIMULADO.bat`.
