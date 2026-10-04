import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Todos os caminhos de runtime partem da raiz da aplicacao, nunca do diretorio
// atual. Funciona igual no bundle (dist/server/main.js -> raiz) e no
// desenvolvimento (packages/core -> raiz), o que permite iniciar o servidor
// com duplo clique em .bat sem depender de onde o processo foi lancado.
export const APP_ROOT = resolve(here, "..", "..");
export const WEB_ROOT = resolve(APP_ROOT, "dist", "web");
export const DATA_ROOT = resolveData(process.env.DATA_DIR ?? "data");

function resolveData(configured: string) {
  return isAbsolute(configured) ? configured : resolve(APP_ROOT, configured);
}

export const webRootExists = () => existsSync(resolve(WEB_ROOT, "index.html"));
