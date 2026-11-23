import Decimal from "decimal.js";
import stringWidth from "string-width";
import type { Cell, Column, QueryResult } from "./model";

export type Sort = { column: number; direction: "asc" | "desc" };

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareNumbers(left: string, right: string) {
  try {
    return new Decimal(left).comparedTo(right) || 0;
  } catch {
    return collator.compare(left, right);
  }
}

export function rowOrder(result: QueryResult, sort?: Sort) {
  const indices = result.rows.map((_, index) => index);
  if (!sort) return indices;
  const { column, direction } = sort;
  return indices.sort((a, b) => {
    const left = result.rows[a][column];
    const right = result.rows[b][column];
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    const compare =
      result.columns[column].kind === "number"
        ? compareNumbers
        : collator.compare;
    return compare(left, right) * (direction === "asc" ? 1 : -1);
  });
}

function singleLine(value: Cell) {
  return (value ?? "NULL")
    .replace(/\r\n|\r|\n/g, "↵")
    .replace(/\t/g, "⇥")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�");
}

function markdownCell(value: Cell) {
  return singleLine(value).replace(/[\\|`*_~<>\[\]!&]/g, "\\$&");
}

export function markdownTable(columns: Column[], rows: Cell[][]) {
  const line = (values: Cell[]) =>
    "| " + values.map(markdownCell).join(" | ") + " |";
  return [
    line(columns.map(({ name }) => name)),
    line(columns.map(({ kind }) => (kind === "number" ? "---:" : "---"))),
    ...rows.map(line),
  ].join("\n");
}

function clip(value: string, width: number) {
  if (stringWidth(value) <= width) return value;
  let result = "";
  let used = 0;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(value)) {
    used += stringWidth(segment);
    if (used >= width) break;
    result += segment;
  }
  return result + "…";
}

export function fixedWidthTable(
  columns: Column[],
  rows: Cell[][],
  maxWidth?: number,
) {
  const plain = [columns.map(({ name }) => name), ...rows].map((row) =>
    row.map(singleLine),
  );
  const table = maxWidth
    ? plain.map((row) => row.map((cell) => clip(cell, maxWidth)))
    : plain;
  const widths = columns.map((_, index) =>
    Math.max(...table.map((row) => stringWidth(row[index]))),
  );
  const border = widths.map((width) => "─".repeat(width)).join("─┼─");
  const lines = table.map((row) =>
    row
      .map((cell, index) => {
        const padding = " ".repeat(widths[index] - stringWidth(cell));
        return columns[index].kind === "number"
          ? padding + cell
          : cell + padding;
      })
      .join(" │ ")
      .trimEnd(),
  );
  return [lines[0], border, ...lines.slice(1)].join("\n");
}

export function fencedText(body: string) {
  const maxBackticks = Math.max(
    2,
    ...(body.match(/`+/g) ?? []).map(({ length }) => length),
  );
  const fence = "`".repeat(maxBackticks + 1);
  return [fence, body, fence].join("\n");
}

export function slackTable(columns: Column[], rows: Cell[][]) {
  // Slack uses a fixed-length delimiter, so split runs of literal backticks.
  const body = fixedWidthTable(columns, rows).replace(/`{3,}/g, (run) =>
    [...run].join("\u200b"),
  );
  return ["```", body, "```"].join("\n");
}

export function slackClipboard(columns: Column[], rows: Cell[][]) {
  const body = fixedWidthTable(columns, rows);
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /[^\x20-\x7e\n]/gu,
      (character) => `&#${character.codePointAt(0)};`,
    );
  return {
    text: slackTable(columns, rows),
    html: `<pre><code>${escaped}</code></pre>`,
  };
}
