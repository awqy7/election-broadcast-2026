# Overlay em navegador incorporado — versão 1.0.2

## Falha identificada

A versão anterior chamava `location.pathname.split('/').at(-1)` ao abrir
qualquer overlay. `Array.prototype.at` só existe a partir do Chromium 92.
Em motores anteriores, o React abortava a renderização com:

```
TypeError: location.pathname.split(...).at is not a function
```

O erro foi reproduzido antes da correção em teste com essa API removida.
A implementação agora usa `pop()`, com build JavaScript/CSS direcionado ao
Chromium 86, offsets explícitos na área segura do preview e substituição de
propriedades CSS modernas (`translate: 0 8px` substituído por `transform: translateY(8px)`
que exigia Chrome 104+; `border-block` e `aspect-ratio` ajustados para compatibilidade com Chrome 86+).
Isso não altera votos, dados oficiais, autenticação nem a conexão SSE.

A falha explica uma tela vazia em motores antigos, mas não confirma qual
motor o cliente selecionou nem elimina possíveis problemas de rede/GPU.

## Conferência no vMix

1. Adicione **Web Browser Input**, com tamanho **1920 × 1080**.
2. Selecione a versão de navegador mais recente disponível; nesta entrega o
   alvo mínimo é Chromium/V86. Prefira V115 ou superior quando disponível.
3. Use a URL `/overlay/program` mostrada pelo programa. Não use `/studio`
   nem `?preview=1` no computador de transmissão, pois o preview exige login.
4. Se estiver em outro computador, use o IP do servidor. `localhost` aponta
   para o próprio computador do vMix, não para outro PC.
5. No Studio, confira **OFICIAL**, selecione a cena e pressione **TAKE**.
   Após CLEAR o canvas fica transparente por projeto.
6. Depois de atualizar o programa, recarregue ou recrie o Web Browser Input
   para que carregue o JavaScript novo. Atualizar o Chrome do Windows não
   altera automaticamente o motor incorporado do vMix.

## Diagnóstico

Abra temporariamente a mesma base de URL com `/overlay/check` no Web Browser
Input, por exemplo `http://IP-DO-SERVIDOR:8787/overlay/check`. A página usa
JavaScript clássico, independente do bundle React, e mostra:

- User-Agent e versão do Chromium;
- JavaScript executando;
- acesso HTTP ao servidor;
- conexão SSE e revisão recebida;
- programa NO AR ou FORA DO AR e ambiente.

Depois da conferência, volte para `/overlay/program`. A página de diagnóstico
é técnica e não deve ir ao ar. Se nem ela aparecer, conferir URL/rede e a
configuração gráfica do vMix; a documentação do fabricante registra um caso
de tela vazia em notebooks com Nvidia Optimus.

## Fontes

- V8, suporte de `at` a partir do Chrome 92: https://v8.dev/features/at-method
- vMix, Web Browser/CEF e transparência: https://www.vmix.com/help28/WebBrowser.html
- vMix, Nvidia Optimus: https://www.vmix.com/knowledgebase/article.aspx/91/blank-screen-when-using-web-browser-input-on-laptop-with-nvidia-optimus-graphics

O aplicativo vMix do cliente não está disponível aqui. Testes em Chromium
86 verificam o motor do navegador, não a integração gráfica específica do vMix.
