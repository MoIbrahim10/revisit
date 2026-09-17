import { PgBoss } from "pg-boss";
import { pool } from "./db";

export const REVIEW_QUEUE = "review-company";
const globalQueue = globalThis as unknown as { revisitQueue?: Promise<PgBoss> };
export function getQueue(): Promise<PgBoss> {
  if (!globalQueue.revisitQueue) {
    globalQueue.revisitQueue = (async () => {
      const boss = new PgBoss({ db: { executeSql: (text, values) => pool.query(text, values) }, schema: "revisit_queue", schedule: false });
      boss.on("error", (error) => console.error(JSON.stringify({ event: "queue_error", message: error.message })));
      await boss.start();
      await boss.createQueue(REVIEW_QUEUE, { retryLimit: 2, retryDelay: 2, retryBackoff: true, expireInSeconds: 240, heartbeatSeconds: 30 });
      return boss;
    })().catch((error) => { globalQueue.revisitQueue = undefined; throw error; });
  }
  return globalQueue.revisitQueue;
}

export async function stopQueue(): Promise<void> {
  if (globalQueue.revisitQueue) {
    await (await globalQueue.revisitQueue).stop();
    globalQueue.revisitQueue = undefined;
  }
}
