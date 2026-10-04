import "dotenv/config";
import { APP_ROOT } from "../../packages/core/paths";
import { createApp } from "./app";
if (process.argv.includes("--dev")) process.env.DEV_WEB = "true";
if (process.argv.includes("--tse-sim")) {
  process.env.DATA_MODE = "tse-sim";
  process.env.PORT = process.env.SIM_PORT ?? "8788";
}
const { app, engine, hub } = await createApp();
const port = Number(process.env.PORT ?? 8787);
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port,
});
const reachable =
  !process.env.HOST || process.env.HOST === "0.0.0.0"
    ? `http://127.0.0.1:${port}`
    : `http://${process.env.HOST}:${port}`;
app.log.info(
  [
    `Instalado em: ${APP_ROOT}`,
    `Studio do operador: ${reachable}/studio`,
    `Aba da saida:     ${reachable}/overlay/program  (1920x1080)`,
    `Diagnostico:       ${reachable}/health`,
    "Chave de acesso:   arquivo CHAVE-DE-ACESSO.txt na pasta do programa",
    "Ctrl+C encerra.",
  ].join("\n"),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    engine.stop();
    hub.close();
    void app.close().then(() => process.exit(0));
  });
