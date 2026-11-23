import { runAthena } from "./athena";
import { type Connection } from "./model";
import { runMySql } from "./mysql";
import { validateReadQuery } from "./sql";

export function runQuery(
  connection: Connection,
  sql: string,
  signal: AbortSignal,
) {
  const query = validateReadQuery(sql, connection.engine);
  return connection.engine === "mysql"
    ? runMySql(connection, query, signal)
    : runAthena(connection, query, signal);
}
