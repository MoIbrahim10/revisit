import { Pool, type PoolClient } from "pg";
import { resolve } from "node:path";
import { userInfo } from "node:os";

const globalDb = globalThis as unknown as { revisitPool?: Pool };
export const pool = globalDb.revisitPool ?? new Pool(
  process.env.REVISIT_DATABASE_URL
    ? { connectionString: process.env.REVISIT_DATABASE_URL, max: 5 }
    : { host: resolve(".local/socket"), port: 55433, database: "revisit", user: userInfo().username, max: 5 },
);
globalDb.revisitPool = pool;
pool.on("error", (error) => console.error(JSON.stringify({ event: "database_error", message: error.message })));

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
