import { useEffect, useState } from "react";
import type { Output } from "../../../packages/shared";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Request": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
export function useOutput(preview = false) {
  const [output, setOutput] = useState<Output | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let epoch = "",
      sequence = -1;
    const source = new EventSource(`/api/events${preview ? "?preview=1" : ""}`);
    const update = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as Output & { epoch: string };
        if (next.epoch === epoch && next.sequence < sequence) return;
        epoch = next.epoch;
        sequence = next.sequence;
        setOutput(next);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };
    for (const type of [
      "connection",
      "broadcast-state",
      "result-update",
      "warning",
    ])
      source.addEventListener(type, update as EventListener);
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [preview]);
  return { output, connected };
}
