import { BULK_PORT, type BulkEvent, type BulkItem, type BulkRequest } from "../core/messages.ts";

export type BulkResult = Extract<BulkEvent, { type: "result" }>;

/** Run several topic writes sequentially in the service worker, streaming progress. */
export function runBulk(items: BulkItem[], onProgress: (done: number, total: number, current: string) => void): Promise<BulkResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const port = chrome.runtime.connect({ name: BULK_PORT });
    port.onMessage.addListener((event: BulkEvent) => {
      if (event.type === "progress") onProgress(event.done, event.total, event.current);
      else if (event.type === "result") {
        settled = true;
        resolve(event);
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) reject(new Error("The extension stopped before the operation finished. Reload the page to see the current state."));
    });
    const req: BulkRequest = { type: "bulk.setProject", items };
    port.postMessage(req);
  });
}
