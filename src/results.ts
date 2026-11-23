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

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function clip(value: string, width: number) {
  if (stringWidth(value) <= width) return value;
  let result = "";
  let used = 0;
  for (const { segment } of segmenter.segment(value)) {
    used += stringWidth(segment);
    if (used >= width) break;
    result += segment;
  }
  return result + "…";
}

function renderTable(columns: Column[], table: string[][], widths: number[]) {
  const border = widths.map((width) => "─".repeat(width)).join("─┼─");
  const lines = table.map((row, rowIndex) =>
    row
      .map((value, index) => {
        const cell = clip(value, widths[index]);
        const padding = " ".repeat(widths[index] - stringWidth(cell));
        return rowIndex > 0 && columns[index].kind === "number"
          ? padding + cell
          : cell + padding;
      })
      .join(" │ ")
      .trimEnd(),
  );
  return [lines[0], border, ...lines.slice(1)].join("\n");
}

export function fixedWidthTable(columns: Column[], rows: Cell[][]) {
  const table = [columns.map(({ name }) => name), ...rows].map((row) =>
    row.map(singleLine),
  );
  const widths = columns.map((_, index) =>
    Math.max(...table.map((row) => stringWidth(row[index]))),
  );
  return renderTable(columns, table, widths);
}

const TABLE_WIDTH = 64;
const ROW_NUMBER_WIDTH = 5;
const SEPARATOR_WIDTH = 3;
const MAX_INITIAL_COLUMN_WIDTH = 20;

type ColumnPage = { start: number; end: number; widths: number[] };

export function columnPages(result: QueryResult) {
  const widths = result.columns.map(({ name }, index) =>
    Math.max(
      1,
      stringWidth(singleLine(name)),
      ...result.rows.map((row) => stringWidth(singleLine(row[index]))),
    ),
  );
  const pages: ColumnPage[] = [];
  let start = 0;
  while (start < widths.length) {
    let used = ROW_NUMBER_WIDTH;
    let end = start;
    const visibleWidths: number[] = [];
    for (; end < widths.length; end++) {
      const width = Math.min(widths[end], MAX_INITIAL_COLUMN_WIDTH);
      if (used + SEPARATOR_WIDTH + width > TABLE_WIDTH) break;
      used += SEPARATOR_WIDTH + width;
      visibleWidths.push(width);
    }
    for (let i = 0; i < visibleWidths.length && used < TABLE_WIDTH; i++) {
      const extra = Math.min(
        widths[start + i] - visibleWidths[i],
        TABLE_WIDTH - used,
      );
      visibleWidths[i] += extra;
      used += extra;
    }
    pages.push({ start, end, widths: visibleWidths });
    start = end;
  }
  return pages;
}

export function previewTable(
  result: QueryResult,
  page: ColumnPage,
  order: number[],
  selected: ReadonlySet<number>,
) {
  const columns: Column[] = [
    { name: "Row", kind: "text" },
    ...result.columns.slice(page.start, page.end),
  ];
  const table = [
    columns.map(({ name }) => singleLine(name)),
    ...order.map((row, position) => [
      (selected.has(row) ? "✓ " : "  ") + String(position + 1),
      ...result.rows[row].slice(page.start, page.end).map(singleLine),
    ]),
  ];
  return renderTable(columns, table, [ROW_NUMBER_WIDTH, ...page.widths]);
}

export function compactRow(row: Cell[]) {
  return clip(row.map(singleLine).join("  ·  "), 64) || "(empty row)";
}

export function fencedText(body: string) {
  let maxBackticks = 2;
  for (const { 0: group } of body.matchAll(/`+/g)) {
    maxBackticks = Math.max(maxBackticks, group.length);
  }
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
