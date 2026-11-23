import { readFile } from "node:fs/promises";
import { createConnection, type FieldPacket } from "mysql2";
import {
  isLoopback,
  ROW_LIMIT,
  type Cell,
  type Column,
  type MySqlConnection,
  type QueryResult,
} from "./model";

const numericTypes = new Set([0, 1, 2, 3, 4, 5, 8, 9, 13, 246]);

function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return "0x" + value.toString("hex");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function columnsFor(fields: FieldPacket[]): Column[] {
  return fields.map(({ name, type }) => ({
    name,
    kind: numericTypes.has(type ?? -1) ? "number" : "text",
  }));
}

export async function runMySql(
  config: MySqlConnection,
  sql: string,
  signal: AbortSignal,
): Promise<QueryResult> {
  if (config.tls === "loopback" && !isLoopback(config.host)) {
    throw new Error("A connection without TLS must use a loopback host.");
  }
  const ca =
    config.tls === "custom" ? await readFile(config.caPath ?? "") : undefined;
  signal.throwIfAborted();

  return new Promise((resolve, reject) => {
    const connection = createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl:
        config.tls === "loopback"
          ? undefined
          : { ca, rejectUnauthorized: true, verifyIdentity: true },
      connectTimeout: 5_000,
      rowsAsArray: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      jsonStrings: true,
      multipleStatements: false,
    });
    const rows: Cell[][] = [];
    let columns: Column[] = [];
    let settled = false;
    const timer = setTimeout(
      () => fail(new Error("MySQL query timed out.")),
      20_000,
    );

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      connection.destroy();
    }

    function fail(error: unknown) {
      if (settled) return;
      cleanup();
      reject(error);
    }

    function abort() {
      fail(signal.reason);
    }

    function finish(truncated: boolean) {
      if (settled) return;
      cleanup();
      resolve({ columns, rows, truncated });
    }

    signal.addEventListener("abort", abort, { once: true });
    connection.on("error", fail);
    if (signal.aborted) return abort();

    connection.query(
      "SET SESSION MAX_EXECUTION_TIME = 15000",
      (timeoutError) => {
        if (timeoutError) return fail(timeoutError);
        if (settled) return;
        connection.query("START TRANSACTION READ ONLY", (transactionError) => {
          if (transactionError) return fail(transactionError);
          if (settled) return;
          connection
            .query({ sql })
            .on("error", fail)
            .on("fields", (fields: FieldPacket[]) => {
              columns = columnsFor(fields);
            })
            .on("result", (row: unknown) => {
              if (settled) return;
              if (!Array.isArray(row))
                return fail(new Error("The query did not return rows."));
              if (rows.length === ROW_LIMIT) return finish(true);
              rows.push(row.map(cell));
            })
            .on("end", () => finish(false));
        });
      },
    );
  });
}
