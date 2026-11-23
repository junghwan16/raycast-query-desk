import assert from "node:assert/strict";
import { test } from "node:test";
import { runQuery } from "../src/query";
import { type MySqlConnection } from "../src/model";

const fixturePort = process.env.QUERY_DESK_TEST_MYSQL_PORT;

test(
  "real MySQL streams typed, bounded rows with duplicate column names",
  { skip: !fixturePort },
  async () => {
    const connection: MySqlConnection = {
      id: "fixture",
      name: "Fixture MySQL",
      engine: "mysql",
      host: "127.0.0.1",
      port: Number(fixturePort),
      user: "query_desk_reader",
      password: "",
      database: "query_desk_fixture",
      tls: "loopback",
    };
    const signal = AbortSignal.timeout(5_000);
    const result = await runQuery(
      connection,
      "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 103) SELECT n AS x, CAST(n AS CHAR) AS x, NULL AS blank FROM seq ORDER BY n",
      signal,
    );
    assert.deepEqual(
      result.columns.map(({ name }) => name),
      ["x", "x", "blank"],
    );
    assert.deepEqual(
      result.columns.slice(0, 2).map(({ kind }) => kind),
      ["number", "text"],
    );
    assert.deepEqual(result.rows[0], ["1", "1", null]);
    assert.equal(result.rows.length, 100);
    assert.equal(result.truncated, true);
    const empty = await runQuery(
      connection,
      "SELECT 1 AS x WHERE FALSE",
      signal,
    );
    assert.deepEqual(empty, {
      columns: [{ name: "x", kind: "number" }],
      rows: [],
      truncated: false,
    });
  },
);
