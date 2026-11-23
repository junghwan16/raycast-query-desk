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
import { useState } from "react";
import type { QueryResult } from "./model";
import {
  fencedText,
  fixedWidthTable,
  markdownTable,
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

function rowLabel(row: QueryResult["rows"][number]) {
  return (
    row
      .map((value) => (value ?? "NULL").replace(/\s+/g, " ").slice(0, 80))
      .join("  │  ") || "(empty row)"
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
            title={rowLabel(result.rows[index])}
            icon={selected.has(index) ? Icon.CheckCircle : Icon.Circle}
            accessories={[{ text: String(position + 1) }]}
            actions={
              <ActionPanel>
                <Action
                  title={selected.has(index) ? "Deselect Row" : "Select Row"}
                  onAction={() => toggle(index)}
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
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const { pop, push } = useNavigation();
  const order = rowOrder(result, sort);
  const heading = `${order.length} ${order.length === 1 ? "row" : "rows"}${result.truncated ? " shown · more rows available" : ""} · ${selected.size} selected`;
  const content = result.columns.length
    ? fencedText(
        fixedWidthTable(
          result.columns,
          order.map((index) => result.rows[index]),
          32,
        ),
      )
    : "No result columns.";
  const orderLabel = sort
    ? `Current order: column ${sort.column + 1} · ${sort.direction === "asc" ? "ascending" : "descending"}`
    : "Current order: query order";

  return (
    <Detail
      navigationTitle={title}
      markdown={`### ${heading}\n\n${orderLabel}\n\n${content}`}
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
                  push(<SortPicker result={result} onSort={setSort} />)
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
          {copyActions(result, order, selected)}
          <Action title="Edit SQL" icon={Icon.Pencil} onAction={pop} />
        </ActionPanel>
      }
    />
  );
}
