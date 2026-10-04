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

## Passo 3: escolher o modo

Use `INICIAR.bat`. Ele traz um menu:

| Opção               | Quando usar                                                |
| ------------------- | ---------------------------------------------------------- |
| **1 — ENSAIO**      | Treinar. Dados de teste do TSE, aviso `SIMULACAO` na tela. |
| **2 — OFICIAL**     | Transmitir. Dados verdadeiros do TSE, sem aviso.           |
| **3 — DIAGNÓSTICO** | Quando algo não está funcionando.                          |

O menu **não** sobe o servidor: ele apenas abre o painel se o programa já
estiver rodando. Quem sobe é `INICIAR-OFICIAL.bat` ou `INICIAR-SIMULADO.bat`,
que abrem a janela preta do servidor e depois abrem as duas abas.

Janela preta aberta = no ar. Fechar = fora do ar.

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
