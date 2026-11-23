import { setTimeout as delay } from "node:timers/promises";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { fromIni } from "@aws-sdk/credential-providers";
import {
  ROW_LIMIT,
  type AthenaConnection,
  type Column,
  type QueryResult,
} from "./model";

const numberType =
  /^(?:tinyint|smallint|integer|int|bigint|real|float|double|decimal)(?:\b|\()/i;

export async function runAthena(
  config: AthenaConnection,
  sql: string,
  signal: AbortSignal,
): Promise<QueryResult> {
  const client = new AthenaClient({
    region: config.region,
    profile: config.profile,
    credentials: fromIni({ profile: config.profile }),
  });
  const request = {
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
  };
  let id: string | undefined;
  let terminal = false;

  try {
    request.abortSignal.throwIfAborted();
    // If the user cancels during Start, get its ID so the remote query can also be stopped.
    const started = await client.send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: {
          Catalog: config.catalog,
          Database: config.database,
        },
        WorkGroup: config.workgroup,
        ResultConfiguration: config.outputLocation
          ? { OutputLocation: config.outputLocation }
          : undefined,
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    id = started.QueryExecutionId;
    if (!id) throw new Error("Athena did not return a query execution ID.");
    request.abortSignal.throwIfAborted();

    for (;;) {
      const check = await client.send(
        new GetQueryExecutionCommand({ QueryExecutionId: id }),
        request,
      );
      const status = check.QueryExecution?.Status;
      if (status?.State === "SUCCEEDED") {
        terminal = true;
        break;
      }
      if (status?.State === "FAILED" || status?.State === "CANCELLED") {
        terminal = true;
        throw new Error(
          status.StateChangeReason ??
            `Athena query ${status.State.toLowerCase()}.`,
        );
      }
      await delay(800, undefined, { signal: request.abortSignal });
    }

    const columns: Column[] = [];
    const rows: QueryResult["rows"] = [];
    let token: string | undefined;
    let firstPage = true;
    do {
      const page = await client.send(
        new GetQueryResultsCommand({
          QueryExecutionId: id,
          MaxResults: ROW_LIMIT + 1 - rows.length + (firstPage ? 1 : 0),
          NextToken: token,
        }),
        request,
      );
      if (firstPage) {
        for (const col of page.ResultSet?.ResultSetMetadata?.ColumnInfo ?? []) {
          columns.push({
            name: col.Label ?? col.Name ?? "",
            kind: numberType.test(col.Type ?? "") ? "number" : "text",
          });
        }
      }
      const pageRows = page.ResultSet?.Rows ?? [];
      // Athena SELECT results start with one header row on the first page.
      for (const row of firstPage ? pageRows.slice(1) : pageRows) {
        rows.push(
          columns.map((_, index) => row.Data?.[index]?.VarCharValue ?? null),
        );
      }
      firstPage = false;
      token = page.NextToken;
    } while (token && rows.length <= ROW_LIMIT);

    return {
      columns,
      rows: rows.slice(0, ROW_LIMIT),
      truncated: rows.length > ROW_LIMIT,
    };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (request.abortSignal.aborted) throw new Error("Athena query timed out.");
    throw error;
  } finally {
    if (id && !terminal) {
      await client
        .send(new StopQueryExecutionCommand({ QueryExecutionId: id }), {
          abortSignal: AbortSignal.timeout(3_000),
        })
        .catch(() => {});
    }
    client.destroy();
  }
}
