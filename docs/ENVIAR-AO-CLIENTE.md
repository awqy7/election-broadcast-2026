# Enviar para o cliente

## O que você envia

Um arquivo só:

```
artifacts/Instalar-ElectionBroadcast2026.exe
```

É isso. O cliente dá dois cliques, escolhe a pasta, e o programa se instala e
configura sozinho. Sem Node, sem internet, sem senha de administrador.

## Como chegar até ele

O `.exe` é compilado no Windows, então precisa de uma máquina Windows com o
Inno Setup 6 — pode ser a sua, não precisa ser a do cliente.

**Passo 1.** No seu Windows, abra o Explorer e vá até a pasta do projeto.

**Passo 2.** Dê dois cliques em **`COMPILAR-EXE.bat`**.

Ele faz tudo sozinho:

1. procura o Inno Setup 6.7.3 e baixa, se não estiver instalado;
2. compila o instalador (alguns minutos);
3. mostra o tamanho e o código SHA256 do `.exe`.

Precisa de internet só no primeiro uso. Não pede administrador.

A versão do Inno Setup está **fixada** em 6.7.3, que é a que o `.iss` foi
validado. Baixar "a última" traria mudanças não testadas.

**Passo 3.** Envie `artifacts\Instalar-ElectionBroadcast2026.exe` para o cliente.

## Como saber que deu certo

- O arquivo aparece em `artifacts\`.
- Tem **cerca de 28 MB** (28.986.288 bytes na versão validada). Instaladores muito
  pequenos indicam compilação falha.
- A janela mostra `INSTALADOR PRONTO` e o SHA256. Anote esse código e mande
  junto no e-mail: é com ele que se confirma que o cliente recebeu o mesmo
  arquivo que foi testado aqui.

## O que o cliente vê

1. Aviso azul do Windows. Clique em **Mais informações** e depois em
   **Executar assim mesmo**. É o aviso normal de programa sem certificado
   pago, e o programa é gratuito.
2. Escolhe a pasta. Suggested é `%LOCALAPPDATA%\ElectionBroadcast2026`.
3. O programa se configura, mostra a **CHAVE DE ACESSO** e abre **duas abas**:
   o painel e a saída.
4. Anota a chave. Para o dia, usa `INICIAR-OFICIAL.bat`.

## Se algo falhar

| Mensagem                                                   | O que fazer                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `o pacote ainda nao foi montado`                           | Rode antes `node scripts\build-delivery.mjs` no terminal.                    |
| `nao consegui baixar o Inno Setup`                         | Baixe em <https://jrsoftware.org/isinfo.php> e rode de novo.                 |
| `o download veio com N bytes, que nao e um instalador`     | O site devolveu página de erro em vez do instalador. Baixe na página acima.  |
| `o Inno Setup foi instalado mas o compilador nao apareceu` | O compilador pode ter ido para outro lugar. Me diga o caminho de `ISCC.exe`. |

## Antes de mandar para o cliente de verdade

Rode o ensaio completo numa máquina Windows antes. Fica em
[VALIDATION.md](VALIDATION.md), na lista "Validações externas que permanecem".

## Plano B: sem compilar nada

Se você não quiser usar o `.exe`, o ZIP funciona do mesmo jeito:

```
artifacts/ElectionBroadcast2026-win-x64.zip
```

O cliente extrai numa pasta (não de dentro do ZIP) e dá dois cliques em
`INSTALAR.bat`. É a mesma instalação, com um passo a mais. Não é tão limpo
quanto o instalador, porque o Windows mostra a marca "pasta compactada" e o
cliente precisa saber extrair em vez de instalar.
