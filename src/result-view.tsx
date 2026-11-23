import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useMemo, useState } from "react";
import type { QueryResult } from "./model";
import {
  columnPages,
  compactRow,
  fencedText,
  markdownTable,
  previewTable,
  rowOrder,
  slackClipboard,
  type Sort,
} from "./results";

function SortPicker({
  result,
  onSort,
}: {
  result: QueryResult;
  onSort: (value?: Sort) => void;
}) {
  const { pop } = useNavigation();
  function select(sort?: Sort) {
    onSort(sort);
    pop();
  }
  return (
    <List navigationTitle="Sort Result">
      <List.Item
        title="Query Order"
        icon={Icon.ArrowCounterClockwise}
        actions={
          <ActionPanel>
            <Action title="Use Query Order" onAction={() => select()} />
          </ActionPanel>
        }
      />
      {result.columns.map(({ name }, column) => (
        <List.Item
          key={column}
          title={name || `Column ${column + 1}`}
          subtitle={`Column ${column + 1}`}
          actions={
            <ActionPanel>
              <Action
                title="Sort Ascending"
                icon={Icon.ArrowUp}
                onAction={() => select({ column, direction: "asc" })}
              />
              <Action
                title="Sort Descending"
                icon={Icon.ArrowDown}
                onAction={() => select({ column, direction: "desc" })}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ColumnPicker({
  result,
  onSelect,
}: {
  result: QueryResult;
  onSelect: (column: number) => void;
}) {
  const { pop } = useNavigation();
  return (
    <List navigationTitle="Go to Column" searchBarPlaceholder="Find a column…">
      {result.columns.map(({ name }, column) => (
        <List.Item
          key={column}
          title={name || "(unnamed)"}
          subtitle={`Column ${column + 1}`}
          actions={
            <ActionPanel>
              <Action
                title="Show Column"
                onAction={() => {
                  onSelect(column);
                  pop();
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function RowInspector({
  result,
  row,
  position,
}: {
  result: QueryResult;
  row: number;
  position: number;
}) {
  return (
    <List
      navigationTitle={`Row ${position + 1}`}
      searchBarPlaceholder="Find a field…"
      isShowingDetail
    >
      {result.columns.map(({ name }, index) => {
        const value = result.rows[row][index];
        const title = name || `Column ${index + 1}`;
        return (
          <List.Item
            key={index}
            title={title}
            subtitle={value === null ? "NULL" : undefined}
            detail={
              <List.Item.Detail
                markdown={
                  value === null
                    ? "`NULL`"
                    : value === ""
                      ? "*Empty string*"
                      : fencedText(value)
                }
              />
            }
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Full Value"
                  content={value ?? "NULL"}
                  concealed
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function copyActions(
  result: QueryResult,
  order: number[],
  selected: ReadonlySet<number>,
) {
  if (!selected.size) return null;
  const selectedRows = order
    .filter((index) => selected.has(index))
    .map((index) => result.rows[index]);

  async function copy(kind: "markdown" | "slack") {
    const content =
      kind === "markdown"
        ? markdownTable(result.columns, selectedRows)
        : slackClipboard(result.columns, selectedRows);
    await Clipboard.copy(content, { concealed: true });
    await showToast({
      style: Toast.Style.Success,
      title: `Copied ${selectedRows.length} ${selectedRows.length === 1 ? "row" : "rows"}`,
    });
  }

  return (
    <ActionPanel.Section>
      <Action
        title="Copy Selected Rows for Slack"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        onAction={() => copy("slack")}
      />
      <Action
        title="Copy Selected Rows as Markdown"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
        onAction={() => copy("markdown")}
      />
    </ActionPanel.Section>
  );
}

type SelectionProps = {
  result: QueryResult;
  order: number[];
  initial: ReadonlySet<number>;
  onChange: (selection: Set<number>) => void;
};

function RowPicker({ result, order, initial, onChange }: SelectionProps) {
  const [selected, setSelected] = useState(initial);
  const { pop } = useNavigation();

  function change(next: Set<number>) {
    setSelected(next);
    onChange(next);
  }

  function toggle(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    change(next);
  }

  return (
    <List
      navigationTitle="Select Rows"
      searchBarPlaceholder="Find rows by value…"
    >
      <List.Section title={`${selected.size} of ${order.length} selected`}>
        {order.map((index, position) => (
          <List.Item
            key={index}
            title={compactRow(result.rows[index])}
            keywords={result.rows[index].flatMap((value) =>
              value === null ? ["NULL"] : [value.slice(0, 512)],
            )}
            icon={selected.has(index) ? Icon.CheckCircle : Icon.Circle}
            accessories={[{ text: String(position + 1) }]}
            actions={
              <ActionPanel>
                <Action
                  title={selected.has(index) ? "Deselect Row" : "Select Row"}
                  onAction={() => toggle(index)}
                />
                <Action.Push
                  title="Inspect Row"
                  icon={Icon.Sidebar}
                  target={
                    <RowInspector
                      result={result}
                      row={index}
                      position={position}
                    />
                  }
                />
                <Action
                  title="Back to Result Table"
                  icon={Icon.ArrowLeft}
                  onAction={pop}
                />
                <Action
                  title="Select All Shown Rows"
                  onAction={() => change(new Set(order))}
                />
                <Action
                  title="Clear Selection"
                  onAction={() => change(new Set())}
                />
                {copyActions(result, order, selected)}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

export function ResultView({
  result,
  title,
}: {
  result: QueryResult;
  title: string;
}) {
  const [sort, setSort] = useState<Sort>();
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const { pop, push } = useNavigation();
  const order = rowOrder(result, sort);
  const pages = useMemo(() => columnPages(result), [result]);
  const page = pages[pageIndex];
  const heading = `${order.length} ${order.length === 1 ? "row" : "rows"}${result.truncated ? " shown · more rows available" : ""} · ${selected.size} selected`;
  const range =
    page && pages.length > 1
      ? `Columns ${page.start + 1}–${page.end} of ${result.columns.length}`
      : undefined;
  const orderLabel = sort
    ? `Sorted by ${(result.columns[sort.column].name || `column ${sort.column + 1}`).replace(/[\\`*_~<>\[\]!&]/g, "\\$&")} ${sort.direction === "asc" ? "↑" : "↓"}`
    : undefined;
  const labels = [range, orderLabel].filter(Boolean).join(" · ");
  const content = page
    ? fencedText(previewTable(result, page, order, selected))
    : "No result columns.";

  function showColumn(column: number) {
    const index = pages.findIndex(
      ({ start, end }) => start <= column && column < end,
    );
    if (index >= 0) setPageIndex(index);
  }

  function changeSort(next?: Sort) {
    setSort(next);
    if (next) showColumn(next.column);
  }

  return (
    <Detail
      navigationTitle={title}
      markdown={[`### ${heading}`, labels, content]
        .filter(Boolean)
        .join("\n\n")}
      actions={
        <ActionPanel>
          {!!order.length && (
            <ActionPanel.Section>
              <Action
                title="Select Rows"
                icon={Icon.CheckList}
                onAction={() =>
                  push(
                    <RowPicker
                      result={result}
                      order={order}
                      initial={selected}
                      onChange={setSelected}
                    />,
                  )
                }
              />
              <Action
                title="Sort by Column"
                icon={Icon.ArrowUp}
                shortcut={{ modifiers: ["cmd"], key: "s" }}
                onAction={() =>
                  push(<SortPicker result={result} onSort={changeSort} />)
                }
              />
              <Action
                title="Select All Shown Rows"
                onAction={() => setSelected(new Set(order))}
              />
              {!!selected.size && (
                <Action
                  title="Clear Selection"
                  onAction={() => setSelected(new Set())}
                />
              )}
            </ActionPanel.Section>
          )}
          {pages.length > 1 && (
            <ActionPanel.Section title="Columns">
              {pageIndex < pages.length - 1 && (
                <Action
                  title="Next Columns"
                  icon={Icon.ArrowRight}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "arrowRight" }}
                  onAction={() => setPageIndex(pageIndex + 1)}
                />
              )}
              {pageIndex > 0 && (
                <Action
                  title="Previous Columns"
                  icon={Icon.ArrowLeft}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "arrowLeft" }}
                  onAction={() => setPageIndex(pageIndex - 1)}
                />
              )}
              <Action
                title="Go to Column"
                shortcut={{ modifiers: ["cmd"], key: "g" }}
                onAction={() =>
                  push(<ColumnPicker result={result} onSelect={showColumn} />)
                }
              />
            </ActionPanel.Section>
          )}
          {copyActions(result, order, selected)}
          <Action title="Edit SQL" icon={Icon.Pencil} onAction={pop} />
        </ActionPanel>
      }
    />
  );
}
