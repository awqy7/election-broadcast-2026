# Os dois endereços

O sistema entrega **duas abas** com URL. Ele não fala com nenhum outro
programa: quem liga a transmissão em outra máquina faz essa parte por fora.

```
   PC DO SERVIDOR                    PC DA TRANSMISSAO
   ───────────────                   ──────────────────
   Election Broadcast     ──rede──►  programa de transmissão
   janela preta                        recebe a URL da aba 2
   painel   → aba 1
   saída    → aba 2
```

O servidor escuta **só** no IP privado da rede local, nunca em `0.0.0.0`.
Isso evita que o painel fique acessível por outra rede em que o PC se conecte,
como o Wi-Fi de visitante do local.

Como os dois PCs já estão na mesma rede fechada, não é preciso abrir porta no
firewall. Se o Windows perguntar, permita em **Rede privada** e recuse em
**Rede pública**.

## Os dois endereços

| Aba        | Endereço                                     | Para que serve                               |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| 1 — Painel | `http://IP-DO-SERVIDOR:8787/studio`          | O operador escolhe a cena e manda para o ar. |
| 2 — Saída  | `http://IP-DO-SERVIDOR:8787/overlay/program` | A URL que vai para a transmissão.            |

O instalador abre as duas abas sozinho assim que o servidor responde.

O IP do servidor aparece na tela do programa, em `CHAVE-DE-ACESSO.txt` e em
`INICIAR.bat` → `3` (diagnóstico).

## Regras da URL da saída

- **Não mexa no endereço.** Quem troca a cena é o painel. A URL da saída é a
  mesma todos os dias.
- **Não use `127.0.0.1`** se o navegador estiver em outro computador. O
  servidor escuta só no IP da placa de rede, então o loopback não responde.
  Use `127.0.0.1` apenas com o navegador no mesmo computador do programa.
- **Não feche a aba da saída** enquanto estiver transmitindo. É dela que vem o
  quadro.
- **Não use a URL com `preview=1`.** Ela exige login e mostra a moldura de área
  segura, que não vai ao ar.

## Modo de ensaio

O modo de ensaio usa a porta `8788` e mostra o aviso `SIMULACAO` na saída.

| Aba    | Endereço                                     |
| ------ | -------------------------------------------- |
| Painel | `http://IP-DO-SERVIDOR:8788/studio`          |
| Saída  | `http://IP-DO-SERVIDOR:8788/overlay/program` |

## Transparência

A área fora do gráfico é transparente: aparece a cor de fundo do programa de
transmissão, sem retângulo preto ou branco.

Para conferir no navegador, coloque uma imagem atrás da aba da saída. O fundo
branco **dentro** do módulo é intencional; o canvas fora dele é transparente.

## Endereços de teste

`/overlay/top`, `/overlay/candidate`, `/overlay/compare`, `/overlay/progress` e
`/overlay/ticker` forçam a visibilidade de cada cena. Use só para conferir o
visual de cada uma. No ar, é sempre `/overlay/program`.
