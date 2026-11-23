export type MySqlConnection = {
  id: string;
  name: string;
  engine: "mysql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  tls: "system" | "custom" | "loopback";
  caPath?: string;
};

export type AthenaConnection = {
  id: string;
  name: string;
  engine: "athena";
  profile: string;
  region: string;
  workgroup: string;
  catalog: string;
  database: string;
  outputLocation?: string;
};

export type Connection = MySqlConnection | AthenaConnection;

export type QueryRecord = {
  id: string;
  connectionId: string;
  connectionName: string;
  sql: string;
};

export type SavedQuery = QueryRecord & { name: string };
export type Run = QueryRecord & { executedAt: number };

export type Cell = string | null;
export type Column = { name: string; kind: "text" | "number" };
export type QueryResult = {
  columns: Column[];
  rows: Cell[][];
  truncated: boolean;
};

export const ROW_LIMIT = 100;
export const HISTORY_LIMIT = 50;

export function isLoopback(host: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase());
}
