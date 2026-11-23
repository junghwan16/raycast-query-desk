import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runQuery } from "../src/query";
import type { AthenaConnection } from "../src/model";

test("Athena SDK sends the selected workgroup, consumes pages, and requests cancellation", async (context) => {
  const temp = await mkdtemp(join(tmpdir(), "query-desk-aws-"));
  context.after(() => rm(temp, { recursive: true, force: true }));
  const credentials = join(temp, "credentials");
  const configFile = join(temp, "config");
  await writeFile(
    credentials,
    "[query-desk-fixture]\naws_access_key_id = fixture\naws_secret_access_key = synthetic\n",
  );
  await writeFile(configFile, "");
  const calls: Array<{ type: string; input: Record<string, unknown> }> = [];
  let cancel = false;
  let notifyStarted: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString()) as Record<
      string,
      unknown
    >;
    const type =
      String(request.headers["x-amz-target"]).split(".").at(-1) ?? "";
    calls.push({ type, input });
    let payload = {};
    if (type === "StartQueryExecution")
      payload = { QueryExecutionId: "fixture-query" };
    if (type === "GetQueryExecution") {
      payload = {
        QueryExecution: { Status: { State: cancel ? "RUNNING" : "SUCCEEDED" } },
      };
      if (cancel) setTimeout(notifyStarted, 20);
    }
    if (type === "GetQueryResults") {
      const Data = [{ VarCharValue: "42" }, {}];
      payload = input.NextToken
        ? { ResultSet: { Rows: [{ Data }] } }
        : {
            NextToken: "page2",
            ResultSet: {
              ResultSetMetadata: {
                ColumnInfo: [
                  { Name: "count", Type: "bigint" },
                  { Name: "note", Type: "varchar" },
                ],
              },
              Rows: [
                { Data: [{ VarCharValue: "count" }, { VarCharValue: "note" }] },
                { Data },
              ],
            },
          };
    }
    response.setHeader("content-type", "application/x-amz-json-1.1");
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const overrides = {
    AWS_ENDPOINT_URL_ATHENA: `http://127.0.0.1:${address.port}`,
    AWS_SHARED_CREDENTIALS_FILE: credentials,
    AWS_CONFIG_FILE: configFile,
    AWS_EC2_METADATA_DISABLED: "true",
  };
  for (const [key, value] of Object.entries(overrides)) {
    const previous = process.env[key];
    process.env[key] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const config: AthenaConnection = {
    id: "fixture",
    engine: "athena",
    name: "Athena fixture",
    region: "us-east-1",
    profile: "query-desk-fixture",
    workgroup: "development",
    catalog: "AwsDataCatalog",
    database: "fixture",
  };
  const result = await runQuery(
    config,
    "SELECT 42, null",
    AbortSignal.timeout(5_000),
  );
  assert.deepEqual(result, {
    columns: [
      { name: "count", kind: "number" },
      { name: "note", kind: "text" },
    ],
    rows: [
      ["42", null],
      ["42", null],
    ],
    truncated: false,
  });
  assert.equal(calls[0].input.WorkGroup, "development");
  assert.deepEqual(calls[0].input.QueryExecutionContext, {
    Catalog: "AwsDataCatalog",
    Database: "fixture",
  });
  assert.equal(
    calls.findLast(({ type }) => type === "GetQueryResults")?.input.NextToken,
    "page2",
  );
  cancel = true;
  const controller = new AbortController();
  const pending = runQuery(config, "SELECT 42", controller.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await started;
  controller.abort();
  await rejected;
  assert.equal(calls.at(-1)?.type, "StopQueryExecution");
});
