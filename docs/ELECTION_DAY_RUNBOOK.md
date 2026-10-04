# Runbook do dia da eleição

## Antes da transmissão

- [ ] PC conectado à energia/UPS; suspensão automática desativada (o instalador faz isso, mas confira).
- [ ] Internet principal testada.
- [ ] Internet de contingência testada.
- [ ] Horário e fuso Windows sincronizados (America/Sao_Paulo).
- [ ] Programa instalado pelo `.exe`; **não** atualizar nem reinstalar durante a live.
- [ ] Chave do Studio anotada em papel, fora do alcance da câmera.
- [ ] Painel abrindo pelo **IP do servidor**, e não por `127.0.0.1`.
- [ ] `INICIAR-OFICIAL.bat` aberto e respondendo; janela preta fica aberta o dia todo.
- [ ] Studio informa **OFICIAL**, sem faixa SIMULAÇÃO.
- [ ] `/health`: server/database OK.
- [ ] Diagnóstico: DNS/HTTPS TSE, EA11, EA12 e município resolvido.
- [ ] Diagnóstico EA20 conferido; pré-apuração aceita como espera, não erro.
- [ ] Foto ou silhueta conferida.
- [ ] URL da saída conferida **pelo IP do servidor**, 1920×1080, sem mexer no endereço.
- [ ] Transparência sobre câmera e legibilidade em monitor reduzido conferidas.
- [ ] Preview correto; guia segura não aparece no output.
- [ ] TAKE, CLEAR, HOLD e reconexão ensaiados fora do ar.
- [ ] Botões TAKE e CLEAR do painel testados com a saída observada.
- [ ] Cache recuperado em ensaio de reinício.
- [ ] Backup exportado para outra unidade.

## Durante

Monitore TSE, freshness, última consulta, última alteração, último snapshot, SSE e a saída real. FRESH/DELAYED diferenciam atualização recente de fonte acessível sem alteração. STALE/OFFLINE pedem checagem da fonte/rede. A ausência de mudança não autoriza inferir encerramento.

- Mudanças de cargo/abrangência são preparadas no preview e confirmadas com TAKE.
- Não confunda votos locais para Presidente com resultado nacional; confirme cabeçalho.
- HOLD congela conteúdo. A sinalização amarela no Studio deve estar claramente visível.
- Diante de falha TSE, preserve último resultado e informe a equipe editorial. Não substitua por mock.
- Não aumente polling nem reinicie repetidamente para tentar contornar bloqueio 403/429.
- Se o gráfico estiver editorialmente inadequado para continuar, use CLEAR imediato.
- Não edite banco, reinstale dependências ou troque versões durante a transmissão.

## Recuperação

**O programa foi encerrado:** a janela preta fechou. Abra `INICIAR-OFICIAL.bat`
de novo, refaça login no Studio. O overlay reconecta sozinho e recebe o estado
persistido. Confira programa, HOLD, timestamp e origem antes de novos comandos.

**A janela preta sumiu mas a transmissão continua com o último quadro:** isso é
esperado. O programa de transmissão congela o último frame. Suba o programa
de novo.

**Painel não abre no navegador:** confira se está usando o IP do servidor e não
`127.0.0.1`. O servidor escuta só no IP privado da rede. `INICIAR.bat` → `3`
mostra o endereço certo e se o programa está respondendo.

**TSE indisponível:** confira internet/DNS e erro no diagnóstico. Não limpe cache. O último snapshot permanece. Em bloqueio HTTP respeite cooldown.

**A aba da saída fechou:** reabra a URL da saída. O painel pode ficar aberto; quem
reconecta sozinho é a saída.

**Troca para PC reserva:** pare a instância anterior (janela preta) antes de
iniciar a nova, senão as duas disputam o mesmo banco. Instale o programa no PC
reserva, copie a pasta `data` da instalação antiga e confirme o IP novo no
PC. Nunca opere duas instâncias escrevendo na mesma base SQLite.

## Após

- [ ] CLEAR dado e saída fora do ar.
- [ ] ZIP de banco/configurações/snapshots/logs exportado.
- [ ] Registre incidentes e horários, sem conclusões não oficiais.
- [ ] Encerre servidor com Ctrl+C.
- [ ] Preserve versão do código e lockfile utilizados.
