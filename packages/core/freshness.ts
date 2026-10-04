export class FreshnessMonitor {
  constructor(
    public delayedMs = 30000,
    public staleMs = 90000,
    public offlineMs = 180000,
  ) {}
  state(
    lastSuccess: string | null,
    lastChanged: string | null,
    now = Date.now(),
  ): "FRESH" | "DELAYED" | "STALE" | "OFFLINE" {
    if (!lastSuccess || now - Date.parse(lastSuccess) > this.offlineMs)
      return "OFFLINE";
    if (now - Date.parse(lastSuccess) > this.staleMs) return "STALE";
    if (!lastChanged || now - Date.parse(lastChanged) > this.delayedMs)
      return "DELAYED";
    return "FRESH";
  }
}
