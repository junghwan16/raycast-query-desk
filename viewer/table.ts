import type { QueryResult } from "../src/model";
import {
  markdownTable,
  rowOrder,
  slackClipboard,
  type Sort,
} from "../src/results";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        copy?: { postMessage(value: ClipboardContent): void };
      };
    };
  }
}

type ClipboardContent = { text: string; html?: string };
type ViewerState = { title: string; result: QueryResult };
type CellPosition = { row: number; column: number };

function element<T extends HTMLElement>(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const data = element<HTMLScriptElement>("result-data");
const { result, title }: ViewerState = JSON.parse(
  new TextDecoder().decode(
    Uint8Array.from(atob(data.textContent ?? ""), (character) =>
      character.charCodeAt(0),
    ),
  ),
);
data.remove();

const rows = element<HTMLTableSectionElement>("rows");
const headers = element<HTMLTableRowElement>("headers");
const columns = element<HTMLTableColElement>("columns");
const table = headers.closest("table")!;
const empty = element("empty");
const filter = element<HTMLInputElement>("find");
const summary = element("summary");
const status = element("status");
const selection = element("selection");
const slack = element<HTMLButtonElement>("copy-slack");
const markdown = element<HTMLButtonElement>("copy-markdown");
const inspector = element("inspector");
const field = element("field");
const position = element("position");
const valueView = element("value");

const checked = new Set<number>();
let sort: Sort | undefined;
let visible = rowOrder(result);
let lastChecked: number | undefined;
let cellPosition: CellPosition | undefined;
let announced: ReturnType<typeof setTimeout> | undefined;

element("connection").textContent = title;
element("connection").title = title;
document.title = `${title} · Omok`;

function displayLabel(column: number) {
  return result.columns[column].name || `Column ${column + 1}`;
}

function tell(message: string) {
  clearTimeout(announced);
  status.textContent = message;
  announced = setTimeout(() => {
    status.textContent = "";
  }, 2_300);
}

async function copy(content: ClipboardContent, message: string) {
  try {
    if (window.webkit?.messageHandlers?.copy)
      window.webkit.messageHandlers.copy.postMessage(content);
    else await navigator.clipboard.writeText(content.text);
    tell(message);
  } catch {
    tell("Could not copy to the clipboard");
  }
}

function copyRows(kind: "slack" | "markdown") {
  const output = rowOrder(result, sort)
    .filter((index) => checked.has(index))
    .map((index) => result.rows[index]);
  if (!output.length) return;
  const contents =
    kind === "slack"
      ? slackClipboard(result.columns, output)
      : { text: markdownTable(result.columns, output) };
  void copy(
    contents,
    `Copied ${output.length} ${output.length === 1 ? "row" : "rows"}`,
  );
}

slack.onclick = () => copyRows("slack");
markdown.onclick = () => copyRows("markdown");

const indexColumn = document.createElement("col");
indexColumn.className = "row-index";
columns.append(indexColumn);
const indexHeader = document.createElement("th");
indexHeader.scope = "col";
const checkAll = document.createElement("input");
checkAll.type = "checkbox";
checkAll.setAttribute("aria-label", "Select all filtered rows");
checkAll.title = "Select all filtered rows";
indexHeader.append(checkAll);
headers.append(indexHeader);
checkAll.onchange = () => {
  for (const row of visible) {
    if (checkAll.checked) checked.add(row);
    else checked.delete(row);
  }
  lastChecked = undefined;
  updateSelection();
};

const cellWidths = result.columns.map(({ name, kind }, index) => {
  const sample = Math.max(
    name.length,
    ...result.rows
      .slice(0, 30)
      .map((row) => row[index]?.slice(0, 80).length ?? 4),
  );
  return Math.max(
    kind === "number" ? 108 : 126,
    Math.min(300, sample * 7.2 + 32),
  );
});

function resizeTable() {
  table.style.width = `${72 + cellWidths.reduce((sum, width) => sum + width, 0)}px`;
}

const headingCells = result.columns.map((_, index) => {
  const column = document.createElement("col");
  column.style.width = `${cellWidths[index]}px`;
  columns.append(column);
  const cell = document.createElement("th");
  cell.scope = "col";
  const button = document.createElement("button");
  button.title = `Sort by ${displayLabel(index)}`;
  const name = document.createElement("span");
  name.className = "column-name";
  name.textContent = displayLabel(index);
  const arrow = document.createElement("span");
  arrow.className = "sort-arrow";
  arrow.setAttribute("aria-hidden", "true");
  button.append(name, arrow);
  button.onclick = () => {
    sort =
      sort?.column === index
        ? {
            column: index,
            direction: sort.direction === "asc" ? "desc" : "asc",
          }
        : { column: index, direction: "asc" };
    lastChecked = undefined;
    renderRows();
  };

  const resize = document.createElement("span");
  resize.className = "resize";
  resize.title = "Drag to resize";
  resize.onpointerdown = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = cellWidths[index];
    resize.setPointerCapture(event.pointerId);
    resize.onpointermove = (move) => {
      cellWidths[index] = Math.max(
        72,
        Math.min(620, startWidth + move.clientX - startX),
      );
      column.style.width = `${cellWidths[index]}px`;
      resizeTable();
    };
  };
  resize.onlostpointercapture = () => {
    resize.onpointermove = null;
  };
  cell.append(button, resize);
  headers.append(cell);
  return { cell, arrow };
});

function updateSelection() {
  for (const row of rows.rows) {
    const selected = checked.has(Number(row.dataset.row));
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", String(selected));
    row.querySelector<HTMLInputElement>("input")!.checked = selected;
  }
  const count = visible.reduce(
    (total, row) => total + Number(checked.has(row)),
    0,
  );
  checkAll.checked = count > 0 && count === visible.length;
  checkAll.indeterminate = count > 0 && count < visible.length;
  checkAll.disabled = visible.length === 0;
  slack.disabled = markdown.disabled = checked.size === 0;
  selection.textContent =
    checked.size === 0
      ? ""
      : `${checked.size} selected${count < checked.size ? ` · ${checked.size - count} hidden by filter` : ""}`;
}

function toggle(row: number, range: boolean, select: boolean) {
  const last =
    range && lastChecked !== undefined ? visible.indexOf(lastChecked) : -1;
  const current = visible.indexOf(row);
  const affected =
    last >= 0
      ? visible.slice(Math.min(last, current), Math.max(last, current) + 1)
      : [row];
  for (const index of affected) {
    if (select) checked.add(index);
    else checked.delete(index);
  }
  lastChecked = row;
  updateSelection();
}

function openCell(row: number, column: number) {
  cellPosition = { row, column };
  field.textContent = displayLabel(column);
  position.textContent = `Row ${visible.indexOf(row) + 1} · Column ${column + 1}`;
  const value = result.rows[row][column];
  valueView.textContent =
    value === null ? "NULL" : value === "" ? "(empty string)" : value;
  inspector.hidden = false;
  highlightCell();
}

function highlightCell() {
  for (const existing of rows.querySelectorAll(".active-cell"))
    existing.classList.remove("active-cell");
  if (!cellPosition) return;
  const row = rows.querySelector(`[data-row="${cellPosition.row}"]`);
  row
    ?.querySelector(`[data-cell="${cellPosition.column}"]`)
    ?.classList.add("active-cell");
}

function closeCell() {
  cellPosition = undefined;
  inspector.hidden = true;
  highlightCell();
}

element("close-inspector").onclick = closeCell;
element("copy-value").onclick = () => {
  if (cellPosition) {
    void copy(
      { text: result.rows[cellPosition.row][cellPosition.column] ?? "NULL" },
      "Copied cell value",
    );
  }
};

function renderRows() {
  const needle = filter.value.trim().toLowerCase();
  visible = rowOrder(result, sort).filter(
    (index) =>
      !needle ||
      result.rows[index].some((value) =>
        (value ?? "NULL").toLowerCase().includes(needle),
      ),
  );
  const count = result.rows.length;
  summary.textContent = `${needle ? `${visible.length} of ` : ""}${count} ${count === 1 ? "row" : "rows"} · ${result.columns.length} ${result.columns.length === 1 ? "column" : "columns"}${result.truncated ? " · limited to 100 rows" : ""}`;
  empty.hidden = visible.length > 0;
  empty.textContent = needle
    ? "No rows match this filter."
    : "No rows returned.";
  headingCells.forEach(({ cell, arrow }, index) => {
    if (sort?.column === index) {
      cell.setAttribute(
        "aria-sort",
        sort.direction === "asc" ? "ascending" : "descending",
      );
      arrow.textContent = sort.direction === "asc" ? "↑" : "↓";
    } else {
      cell.removeAttribute("aria-sort");
      arrow.textContent = "";
    }
  });
  const fragment = document.createDocumentFragment();
  visible.forEach((index, viewIndex) => {
    const row = document.createElement("tr");
    row.dataset.row = String(index);
    const control = row.insertCell();
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Select row ${viewIndex + 1}`);
    checkbox.onclick = (event) =>
      toggle(index, event.shiftKey, checkbox.checked);
    label.append(checkbox, String(viewIndex + 1));
    control.append(label);
    result.rows[index].forEach((value, col) => {
      const cell = row.insertCell();
      cell.classList.toggle("numeric", result.columns[col].kind === "number");
      cell.classList.toggle("null", value === null);
      cell.dataset.cell = String(col);
      cell.textContent = value ?? "NULL";
      cell.addEventListener("click", () => openCell(index, col));
    });
    fragment.append(row);
  });
  rows.replaceChildren(fragment);
  if (cellPosition && visible.includes(cellPosition.row))
    openCell(cellPosition.row, cellPosition.column);
  else closeCell();
  updateSelection();
}

filter.oninput = () => {
  lastChecked = undefined;
  renderRows();
};
document.addEventListener("keydown", (event) => {
  if (event.metaKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    filter.focus();
    filter.select();
  }
  if (event.key === "Escape" && !inspector.hidden) closeCell();
});

resizeTable();
renderRows();
