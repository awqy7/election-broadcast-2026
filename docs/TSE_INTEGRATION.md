# Integração TSE 2026

Fontes oficiais consultadas em 22/10/2026:

- [Portal técnico 2026 e FAQ](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)
- [Documentos EA11, EA12, EA14, EA15, EA20 e instruções](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados)
- [EA20, revisão 10/07/2026](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/tse-ea20-arquivo-de-resultado-unificado)
- [EA11 oficial](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json)

As evidências JSON de `specs` vieram dos endpoints oficiais e servem para testes de contrato, nunca para alimentar produção automaticamente. Os PDFs do portal recusaram o download direto neste ambiente; seus schemas foram consultados no portal e confrontados com JSON oficial real.

## Descoberta

1. EA11 é obtido em `/oficial/comum/config/ele-c.json`.
2. Seleciona-se o ciclo `ele2026`, o turno configurado em `TSE_ROUND` e a presença do cargo 1. Datas, pleito e eleições vêm do documento; 1º turno: `3220`, federal `6257`, estadual `6259`; 2º turno: `3221` (25/10/2026), federal `6258`, estadual `6260`.
3. `arq[].dir` determina diretórios para `cm`, `u`, `ab`, `ft`. Tokens resolvidos só podem apontar para HTTPS no host TSE configurado.
4. EA12 `mun-e00<estadual>-cm.json` fornece municípios. A comparação normaliza acentos, caixa e espaços. O código encontrado para Teófilo Otoni é persistido com nome, UF e IDG; não existe código de produção embutido no resolvedor. No 2º turno o EA12 estadual só publica as UFs com disputa de governo (AC, AM, DF, ES, RN e TO); se a UF padrão não estiver lá, o sistema mantém o município em cache e segue com o mapa nacional, sem inventar cidade.
5. EA20 usa o código descoberto, cargo com quatro dígitos e eleição com seis dígitos no nome do arquivo. A pasta da eleição usa o identificador fornecido pelo EA11.
6. O mapa oficial consulta os 27 EA20 estaduais de Presidente (`<uf>/<uf>-c0001-e006258-u.json`), um por vez a cada `TSE_MAP_POLL_INTERVAL_MS` (padrão 2000 ms). O resultado é mantido em memória separada do resultado do cargo; UFs ausentes ficam neutras, nunca com dados sintéticos. Não há detalhamento municipal de Presidente nessa fonte.

## Dados e semântica

Candidatos vêm de `carg → agr → par → cand`. Partido é herdado de `par`. `vap` determina ordenação; `pvap` é preservado, aceitando vírgula decimal. As barras usam o percentual oficial absoluto. Não há quociente visual em relação ao líder.

`and=n` é pré-apuração. `and=f` e `tf=s` têm significados distintos: conclusão de recebimento/totalização da abrangência não implica finalização judicial da eleição. `md` é condicional e sua ausência vira null; não significa resultado calculado pelo sistema. `e=s` pode indicar eleito ou segundo turno. A interface mostra `st` quando preenchido; não transforma isoladamente `e` em “eleito”. `dvt`, substituídos e vices/suplentes são preservados. `dv=n` impede apresentação da votação no overlay.

Campos obrigatórios de identidade, votos, percentual, metadados e seções ausentes rejeitam o arquivo. Campos adicionais são aceitos. Campos documentados como condicionais (destinação antes da parcial, `md`, `subs`, `vs`) aceitam ausência. Nenhuma ausência de snapshot é convertida em zero.

## Acompanhamento e cadência

EA14 e EA15 da eleição estadual sinalizam alterações por UF/município com data/hora e seções. O scheduler usa a entrada relevante, não IDG global. Faz reconciliação EA20 ao menos a cada 60 segundos, pois arquivos podem chegar à CDN em momentos diferentes. Presidente usa polling EA20 direto porque o acompanhamento estadual não é evidência suficiente para o resultado federal.

O limite divulgado pelo TSE é 100 requisições/s por IP; nosso padrão é no máximo uma por segundo somando ingestão, fotos e diagnósticos, e o scheduler padrão aguarda 10 segundos mais jitter. 304 também conta. Evite abrir várias instâncias na mesma rede e não reduza intervalos durante falhas.

## Fotos e proveniência

Fotos: diretório `ft` do EA11, UF do cargo (`br` para Presidente), arquivo `<sqcand>.jpeg`. Cache em `data/tse/cache/photos`. JPEG é validado pelo cabeçalho e limitado a 2 MB. Ausência usa silhueta e registro persistido para não repetir polling. Após corrigir uma ausência de publicação, reinicie com limpeza seletiva dos registros `photo-missing:*` somente fora do ar e após backup, se necessário.

Cada resultado carrega sourceResource, sourceIdg, sourceGeneratedAt, receivedAt e hash. Snapshot contém JSON normalizado e documento ingerido. Não há fonte de portal terceiro, scraping, OCR ou consulta individual de votos.

## Validação eleitoral ainda necessária

O 2º turno já está publicado em pré-apuração (0,00%) para Presidente (`6258`) e para as UFs com disputa de governo. Isso valida contrato, fotos e conectividade; a totalização real só aparece no dia. O mapa carrega as 27 UFs e o selo TSE OFICIAL; ausência de votos é exibida como “AGUARDANDO”, não como zero inventado. Os cenários de mudança de liderança, parcial, anulação e substituição continuam exercitados pelo modo mock. Verifique o diagnóstico oficial novamente antes da transmissão e monitore eventuais mudanças de leiaute anunciadas pelo TSE.

## Ambiente de testes TSE 2026

Fonte: https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados
(consulta em 03/10/2026).

- Origem HTTPS: `resultados-sim.tse.jus.br`.
- Prefixo: `/simulado`; ambiente: `simulado2026`.
- Pleito 17801; eleições federal 21270, estadual 21272, municipal/conselho 21274.
- EA11: `/simulado/simulado2026/comum/config/ele-c.json`.
- A data do pleito publicada no EA11 de teste é 26/04/2026; não é a data da eleição oficial.
- `f=s` obrigatório em arquivos simulados; `f=o` obrigatório no oficial.
- `DATA_MODE=tse-sim` produz `environment=simulado2026`, `source=TSE`.
- `pnpm start:sim` inicia uma instância independente em 8788.
- Evidência do contrato EA11 em `docs/specs/ea11-sim.json`, usada somente em testes.

Não se presume que o TSE continue gerando progressão fora das janelas publicadas.
