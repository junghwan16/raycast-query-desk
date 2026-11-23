import stringWidth from "string-width";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryResult } from "../src/model";
import {
  columnPages,
  previewTable,
  fencedText,
  fixedWidthTable,
  markdownTable,
  rowOrder,
  slackTable,
  slackClipboard,
} from "../src/results";

const result: QueryResult = {
  columns: [
    { name: "status|reason", kind: "text" },
    { name: "id", kind: "number" },
  ],
  rows: [
    ["실패\n코드```", "9007199254740993"],
    ["취소", "9007199254740992"],
    ["완료", null],
  ],
  truncated: false,
};

test("sorting preserves large integer order and keeps NULL last", () => {
  assert.deepEqual(
    rowOrder(result, { column: 1, direction: "asc" }),
    [1, 0, 2],
  );
  assert.deepEqual(
    rowOrder(result, { column: 1, direction: "desc" }),
    [0, 1, 2],
  );
});

test("copy puts headers and selected rows in the given order and escapes separators", () => {
  const rows = [result.rows[1], result.rows[0]];
  const md = markdownTable(result.columns, rows);
  assert.match(md, /status\\\|reason/);
  assert.match(md, /취소[^\n]+\n[^\n]+실패↵코드/);
  const slack = slackTable(result.columns, rows).split("\n");
  assert.equal(slack[0], "```");
  assert.equal(slack.at(-1), "```");
  assert.equal(
    slack.slice(1, -1).filter((line) => line.includes("```")).length,
    0,
  );
  assert.ok(
    fencedText(fixedWidthTable(result.columns, rows)).startsWith("````\n"),
  );
});

test("Slack clipboard preserves non-ASCII data in HTML and escapes markup", () => {
  const content = slackClipboard([{ name: "a", kind: "text" }], [["<한글>"]]);
  assert.match(content.html, /&lt;&#54620;&#44544;&gt;/);
  assert.match(content.text, /<한글>/);
});

test("wide results fit in bounded column pages and keep sorted row identities", () => {
  const wide: QueryResult = {
    columns: Array.from({ length: 12 }, (_, i) => ({
      name: `필드_${i}_a_very_long_column_name`,
      kind: "text",
    })),
    rows: [
      Array.from({ length: 12 }, () => "긴 값 ".repeat(45)),
      Array.from({ length: 12 }, () => "🙂".repeat(50)),
    ],
    truncated: false,
  };
  const pages = columnPages(wide);
  assert.ok(pages.length > 1);
  assert.deepEqual(
    pages.flatMap(({ start, end }) =>
      Array.from({ length: end - start }, (_, i) => start + i),
    ),
    wide.columns.map((_, index) => index),
  );
  for (const page of pages) {
    const rendered = previewTable(wide, page, [1, 0], new Set([0])).split("\n");
    assert.ok(rendered.every((line) => stringWidth(line) <= 64));
    assert.match(rendered[2], /^  1/);
    assert.match(rendered[3], /^✓ 2/);
    assert.ok(rendered.some((line) => line.includes("…")));
  }
  assert.equal(wide.rows[0][0], "긴 값 ".repeat(45));
  assert.ok(
    markdownTable(wide.columns, [wide.rows[0]]).includes(wide.rows[0][0]),
  );
});
