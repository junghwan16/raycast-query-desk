import assert from "node:assert/strict";
import { test } from "node:test";
import { validateReadQuery } from "../src/sql";

test("accepts SELECT, CTEs, real comments, and punctuation in literals", () => {
  const sql =
    "/* source */ WITH a AS (SELECT 'semi;colon' AS x) SELECT 'a''b' FROM a; -- done";
  for (const engine of ["mysql", "athena"] as const)
    assert.equal(validateReadQuery(sql, engine), sql);
  assert.equal(
    validateReadQuery("SELECT 1--trino comment", "athena"),
    "SELECT 1--trino comment",
  );
});

test("rejects mutations, locking, command wrappers, stacked statements, and executable comments", () => {
  const queries = [
    "UPDATE t SET n = 1",
    "WITH a AS (SELECT 1) DELETE FROM t",
    "UNLOAD (SELECT 1) TO 's3://example'",
    "SELECT 1; SELECT 2",
    "SELECT 1;/* whitespace */ DROP TABLE t",
    "SELECT 1 INTO OUTFILE '/tmp/out'",
    "SELECT * FROM t FOR UPDATE",
    "SELECT * FROM t LOCK IN SHARE MODE",
    "SELECT @x := 1",
    "SELECT /*!50000 1 */",
    "SELECT /*+ SET_VAR(max_execution_time=0) */ 1",
    "USING EXTERNAL FUNCTION test RETURNS INT LAMBDA 'not-a-query' SELECT test()",
    "SELECT 'unterminated",
  ];
  for (const sql of queries) {
    for (const engine of ["mysql", "athena"] as const)
      assert.throws(() => validateReadQuery(sql, engine), Error, sql);
  }
});
