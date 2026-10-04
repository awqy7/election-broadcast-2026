import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Output } from "../shared";
export class SseHub {
  clients = new Map<ServerResponse, boolean>();
  epoch = randomUUID();
  timer: NodeJS.Timeout;
  constructor(private output: (preview: boolean) => Output) {
    this.timer = setInterval(() => {
      for (const client of this.clients.keys()) {
        if (client.writableLength > 1_000_000) client.destroy();
        else client.write(": heartbeat\n\n");
      }
    }, 15000);
    this.timer.unref();
  }
  add(res: ServerResponse, preview: boolean) {
    this.clients.set(res, preview);
    res.on("close", () => this.clients.delete(res));
    res.write("retry: 2000\n\n");
    this.send(res, "connection", preview);
  }
  send(res: ServerResponse, event: string, preview: boolean) {
    const data = this.output(preview);
    if (res.writableLength > 1_000_000) {
      res.destroy();
      return;
    }
    res.write(
      `id: ${this.epoch}:${data.sequence}\nevent: ${event}\ndata: ${JSON.stringify({ ...data, epoch: this.epoch })}\n\n`,
    );
  }
  publish(event: string) {
    for (const [res, preview] of this.clients) this.send(res, event, preview);
  }
  close() {
    clearInterval(this.timer);
    for (const c of this.clients.keys()) c.end();
  }
}
