# Instalação no Windows

O programa chega pronto. Não precisa instalar Node, npm, Python nem banco de
dados, e não pede senha de administrador.

## Requisitos

- Windows 10 ou 11, 64 bits.
- Roughly 300 MB livres na pasta de instalação.
- Estar na **mesma rede** do computador que recebe a transmissão, se as abas
  forem abertas de outra máquina.

## Passo 1: instalar

Dê dois cliques em `Instalar-ElectionBroadcast2026.exe`.

Se aparecer o aviso azul do Windows ("O Windows protegeu seu PC"), clique em
**Mais informações** e depois em **Executar assim mesmo**. É o aviso normal para
programas que não assinam com certificado pago; este aqui é gratuito.

Escolha a pasta. A suggestion é `%LOCALAPPDATA%\ElectionBroadcast2026`, que fica
no seu usuário e **não** exige administrador.

> Não instale dentro de OneDrive, Dropbox ou Google Drive. A sincronização
> corrompe o banco de dados. O instalador avisa se a pasta tiver esse problema.

Ao terminar, o programa se configura sozinho: testa o banco, cria a chave de
acesso, desliga a suspensão do Windows e mostra o endereço do painel. Deixe
essa janela aberta até aparecer o texto **CHAVE DE ACESSO**.

## Passo 2: anotar a chave

A chave aparece na tela e fica salva em `CHAVE-DE-ACESSO.txt`, na pasta do
programa. É ela que libera o painel.

Anote em papel. O arquivo também está lá se precisar de novo.

## Passo 3: iniciar o oficial

Use o atalho **Election Broadcast 2026** ou `INICIAR.bat`. Na versão 1.0.1,
a configuração inicial acontece automaticamente e o servidor inicia em
**OFICIAL**, sem menu e sem abrir o simulado. O Studio só abre depois que
`/health` confirmar o ambiente oficial. Se já estiver ativo, a instância é
reutilizada. Uma configuração antiga `DATA_MODE=mock` ou `tse-sim` não altera
o modo deste atalho.

Mantenha a janela aberta. Em caso de falha, leia a mensagem e envie
`data/startup.log` ao suporte. O iniciador faz no máximo três tentativas e
mantém o terminal aberto. Um IP antigo indisponível utiliza localhost;
para restaurar acesso LAN, ajuste `HOST` no `.env`.

O ensaio só é iniciado explicitamente por `INICIAR-SIMULADO.bat`.

## Passo 4: as duas abas

O programa entrega duas abas com URL:

1. **Painel** — `http://IP-DO-SERVIDOR:8787/studio`, onde você opera.
2. **Saída** — `http://IP-DO-SERVIDOR:8787/overlay/program`, a URL que vai para
   a transmissão.

O instalador abre as duas sozinho. A URL da saída é a mesma em todos os dias;
quem troca a cena é o painel.

Detalhes em [DOIS-ENDERECOS.md](DOIS-ENDERECOS.md).

Detalhes em [DOIS-ENDERECOS.md](DOIS-ENDERECOS.md).

## Passo 5: antes de transmitir

Siga [ELECTION_DAY_RUNBOOK.md](ELECTION_DAY_RUNBOOK.md).

## Problemas na instalação

| Mensagem                                             | O que fazer                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `o Node que acompanha o programa nao foi encontrado` | Reinstale. O antivírus pode ter apagado arquivos.            |
| `O pacote esta incompleto`                           | Reinstale; a pasta ficou pela metade.                        |
| `Driver do banco de dados indisponível`              | Windows 32 bits ou antivírus bloqueou `better_sqlite3.node`. |
| `fora do disco local do Windows`                     | Aviso apenas. Preferir `C:\`, mas funciona.                  |
| `Pasta dentro de serviço de nuvem`                   | Erro. Instale fora da pasta sincronizada.                    |

Se nada resolver, rode `INICIAR.bat` → `3` e anote o que aparece.
