# Solução de problemas

| Sintoma / código                    | Ação                                                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio solicita chave               | A chave está em `CHAVE-DE-ACESSO.txt` e no `.env` (`ADMIN_ACCESS_KEY`). Se você não usa o instalador, o servidor cria `data/admin-access-key.txt`. Não use senha do Windows. |
| Login expirou após reinício         | Sessões são locais ao processo; entre novamente. Output público continua somente leitura.                                                                                    |
| TSE_DNS_ERROR                       | Verifique DNS e conexão do PC do servidor.                                                                                                                                   |
| TSE_TIMEOUT                         | Aguarde backoff; confira link. Não reduza intervalo.                                                                                                                         |
| TSE_HTTP_ERROR / 404                | Resultado pode não ter sido publicado. Confira EA11/EA12; não tente códigos adivinhados.                                                                                     |
| TSE_RATE_LIMIT / 403 / 429          | Suspenda consultas extras. Motor aguarda ao menos 10 minutos globalmente e respeita Retry-After.                                                                             |
| TSE_SCHEMA_INVALID                  | Último snapshot é preservado. Exporte backup/logs e compare documento com especificação oficial vigente.                                                                     |
| TSE_STALE / timestamp regressivo    | Snapshot anterior de CDN foi rejeitado. Aguarde novo documento e monitore.                                                                                                   |
| MUNICIPALITY_NOT_FOUND              | Verifique UF e nome em `.env` e presença no EA12. Nunca substitua por IBGE.                                                                                                  |
| DATABASE_ERROR                      | Confira espaço, permissão, backup e se outra instância usa a base. Não apague banco durante a live.                                                                          |
| SSE_DISCONNECTED                    | Cliente mantém gráfico. Confira servidor/porta/LAN; EventSource reconecta automaticamente.                                                                                   |
| Aguardando dados oficiais           | Ainda não existe snapshot válido; não equivale a zero votos.                                                                                                                 |
| Aguardando início da totalização    | EA20 válido informou `and=n`.                                                                                                                                                |
| Aguardando liberação oficial        | EA20 informou `dv=n`; aguarde autorização na própria fonte.                                                                                                                  |
| Sem foto                            | Silhueta preserva layout. Fotos não recebem polling.                                                                                                                         |
| A saída não mostra nada             | Confira se a aba `/overlay/program` está aberta, se deu TAKE e se a janela preta do programa continua de pé.                                                                 |
| Mudança do Studio não entra no ar   | O controle edita preview; clique TAKE e confira se HOLD está ativo.                                                                                                          |
| Diagnóstico de saída desconectada   | Abra a aba `/overlay/program`; o preview do painel não conta como conexão de saída.                                                                                          |
| UI antiga após alteração do código  | Recompile ou use DEV_WEB=true em desenvolvimento.                                                                                                                            |
| better-sqlite3 não carrega          | `O Driver do banco de dados` na instalação. Só Windows 64 bits; antivírus pode ter bloqueado `better_sqlite3.node`.                                                          |
| Painel não abre por `127.0.0.1`     | O servidor escuta só no IP privado da rede, então loopback não responde. Use o IP mostrado por `INICIAR-OFICIAL.bat`.                                                        |
| `O programa demorou para responder` | O `INSTALAR.bat` esperou 90s. Normalmente o `.exe` foi extraído para dentro do ZIP, ou o antivírus apagou arquivos.                                                          |
| A saída some da transmissão         | A janela preta do programa fechou. Ela precisa ficar aberta o dia inteiro.                                                                                                   |

## Evidências úteis

Exporte `/api/admin/export` usando a sessão do Studio. O ZIP contém banco consistente, configurações, snapshots e últimos logs, sem chave de acesso e sem cache pesado de fotos. Logs estruturados também aparecem no terminal. Preserve o horário do incidente e a versão do código.

Para conferir saída transparente no navegador, coloque uma imagem atrás da aba da saída. O fundo branco dentro do módulo é intencional; o canvas fora dele é transparente.
