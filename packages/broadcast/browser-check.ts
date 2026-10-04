// Deliberately classic JavaScript: this page must work even when the app bundle cannot load.
export const browserCheckHtml = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Diagnóstico do navegador</title>
<style>body{margin:32px;background:#fff;color:#142d46;font:24px Arial,sans-serif}h1{font-size:32px}p{line-height:1.5}code{background:#eef3f8;padding:4px}#agent{font-size:16px;word-break:break-all}</style></head>
<body><h1>Diagnóstico do navegador de transmissão</h1>
<p>Esta página é para diagnóstico. A saída da transmissão é <code>/overlay/program</code>.</p>
<p id="javascript">JavaScript: NÃO EXECUTADO</p><p id="engine">Motor: aguardando</p>
<p id="http">Servidor HTTP: aguardando</p><p id="events">Conexão SSE: aguardando</p>
<p id="program">Programa: aguardando</p><p id="agent"></p>
<script>
(function () {
  function text(id, value) { document.getElementById(id).textContent = value; }
  text('javascript', 'JavaScript: OK');
  text('agent', navigator.userAgent);
  var match = /(?:Chrome|Chromium)\\/(\\d+)/.exec(navigator.userAgent);
  text('engine', match ? 'Motor Chromium: ' + match[1] + (Number(match[1]) < 86 ? ' — selecione uma versão 86 ou superior.' : ' — versão dentro do alvo de compatibilidade.') : 'Motor: confira a versão do navegador incorporado (alvo: Chromium 86+).');
  function render(output) {
    if (!output || !output.state) return;
    text('program', 'Programa: ' + (output.state.visible ? 'NO AR' : 'FORA DO AR — pressione TAKE no Studio') + ' | cena: ' + output.state.scene + ' | modo: ' + output.dataMode);
  }
  var request = new XMLHttpRequest();
  request.open('GET', '/api/output'); request.timeout = 5000;
  request.onload = function () {
    if (request.status !== 200) { text('http', 'Servidor HTTP: erro ' + request.status); return; }
    try { render(JSON.parse(request.responseText)); text('http', 'Servidor HTTP: OK'); }
    catch (e) { text('http', 'Servidor HTTP: resposta inválida'); }
  };
  request.onerror = request.ontimeout = function () { text('http', 'Servidor HTTP: sem acesso; confira IP, porta e firewall.'); };
  request.send();
  if (!window.EventSource) { text('events', 'Conexão SSE: navegador sem suporte a EventSource'); return; }
  var source = new EventSource('/api/events');
  function update(event) {
    try { var output = JSON.parse(event.data); render(output); text('events', 'Conexão SSE: OK | revisão ' + output.state.revision); }
    catch (e) { text('events', 'Conexão SSE: mensagem inválida'); }
  }
  source.addEventListener('connection', update);
  source.addEventListener('broadcast-state', update);
  source.addEventListener('result-update', update);
  source.onerror = function () { text('events', 'Conexão SSE: interrompida; reconectando'); };
  window.addEventListener('beforeunload', function () { source.close(); });
})();
</script></body></html>`;
