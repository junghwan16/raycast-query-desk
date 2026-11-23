import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Icon,
  List,
} from "@raycast/api";
import { ConnectionForm } from "./connection-form";
import { QueryEditor, SaveQueryForm } from "./query-editor";
import { type Connection, type Run, type SavedQuery } from "./model";
import { storageError, update, useStore } from "./store";

function connectionLabel(connection: Connection) {
  return connection.engine === "mysql"
    ? `MySQL · ${connection.host}:${connection.port}/${connection.database}`
    : `Athena · ${connection.workgroup} · ${connection.catalog}.${connection.database}`;
}

async function removeConnection(connection: Connection) {
  if (
    !(await confirmAlert({
      title: `Delete “${connection.name}”?`,
      message:
        "Its draft will be removed. Saved queries and recent SQL for this connection will stay in their lists.",
      primaryAction: {
        title: "Delete Connection",
        style: Alert.ActionStyle.Destructive,
      },
    }))
  )
    return;

  await update((state) => {
    const drafts = { ...state.drafts };
    delete drafts[connection.id];
    return {
      ...state,
      drafts,
      connections: state.connections.filter(({ id }) => id !== connection.id),
    };
  }).catch(storageError);
}

async function removeSaved(query: SavedQuery) {
  if (
    !(await confirmAlert({
      title: `Delete “${query.name}”?`,
      primaryAction: {
        title: "Delete Saved Query",
        style: Alert.ActionStyle.Destructive,
      },
    }))
  )
    return;

  await update((state) => ({
    ...state,
    saved: state.saved.filter(({ id }) => id !== query.id),
  })).catch(storageError);
}

async function removeRun(run: Run) {
  await update((state) => ({
    ...state,
    history: state.history.filter(({ id }) => id !== run.id),
  })).catch(storageError);
}

function queryLabel(sql: string) {
  return sql.trim().replace(/\s+/g, " ").slice(0, 100);
}

function QueryList({ kind }: { kind: "saved" | "history" }) {
  const { data } = useStore();
  const records: Array<SavedQuery | Run> = data[kind];
  const title = kind === "saved" ? "Saved Queries" : "Recent Runs";
  return (
    <List
      navigationTitle={title}
      searchBarPlaceholder="Search by name, connection, or SQL…"
    >
      <List.EmptyView
        icon={kind === "saved" ? Icon.Bookmark : Icon.Clock}
        title={kind === "saved" ? "No saved queries" : "No recent runs"}
      />
      {records.map((record) => {
        const connection = data.connections.find(
          (entry) => entry.id === record.connectionId,
        );
        const saved = "name" in record ? record : undefined;
        return (
          <List.Item
            key={record.id}
            icon={saved ? Icon.Bookmark : Icon.Clock}
            title={saved?.name ?? queryLabel(record.sql)}
            subtitle={
              connection?.name ??
              `${record.connectionName} · connection deleted`
            }
            keywords={[
              ...record.sql.split(/\s+/),
              record.connectionName,
              connection?.name ?? "",
            ]}
            accessories={
              "executedAt" in record
                ? [{ date: new Date(record.executedAt) }]
                : undefined
            }
            actions={
              <ActionPanel>
                {connection && (
                  <Action.Push
                    title="Open SQL"
                    icon={Icon.Pencil}
                    target={
                      <QueryEditor
                        connection={connection}
                        initial={record.sql}
                        saved={saved}
                      />
                    }
                  />
                )}
                {!saved && (
                  <Action.Push
                    title="Save Query"
                    icon={Icon.Bookmark}
                    target={
                      <SaveQueryForm
                        source={{
                          connectionId: record.connectionId,
                          connectionName:
                            connection?.name ?? record.connectionName,
                          sql: record.sql,
                        }}
                      />
                    }
                  />
                )}
                <Action.CopyToClipboard
                  title="Copy SQL"
                  content={record.sql}
                  concealed
                />
                {saved && (
                  <Action
                    title="Delete Saved Query"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => removeSaved(saved)}
                  />
                )}
                {"executedAt" in record && (
                  <Action
                    title="Remove from Recent Runs"
                    icon={Icon.Trash}
                    onAction={() => removeRun(record)}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function menuActions() {
  return (
    <ActionPanel.Section>
      <Action.Push
        title="Add Connection"
        icon={Icon.Plus}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={<ConnectionForm />}
      />
      <Action.Push
        title="Open Saved Queries"
        icon={Icon.Bookmark}
        target={<QueryList kind="saved" />}
      />
      <Action.Push
        title="Open Recent Runs"
        icon={Icon.Clock}
        target={<QueryList kind="history" />}
      />
    </ActionPanel.Section>
  );
}

export default function QueryDesk() {
  const { data, ready, error } = useStore();
  if (error)
    return (
      <List>
        <List.EmptyView icon={Icon.ExclamationMark} title={error} />
      </List>
    );
  return (
    <List isLoading={!ready} searchBarPlaceholder="Search connections…">
      {ready && (
        <>
          {!!data.connections.length && (
            <List.Section title="Connections">
              {data.connections.map((entry) => (
                <List.Item
                  key={entry.id}
                  icon={Icon.HardDrive}
                  title={entry.name}
                  subtitle={connectionLabel(entry)}
                  keywords={[entry.database, entry.engine]}
                  actions={
                    <ActionPanel>
                      <Action.Push
                        title="Write SQL"
                        icon={Icon.Pencil}
                        target={<QueryEditor connection={entry} />}
                      />
                      <Action.Push
                        title="Edit Connection"
                        icon={Icon.Gear}
                        target={<ConnectionForm existing={entry} />}
                      />
                      {menuActions()}
                      <Action
                        title="Delete Connection"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => removeConnection(entry)}
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}
          <List.Section title="Manage">
            <List.Item
              title="Add Connection"
              icon={Icon.Plus}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Add Connection"
                    target={<ConnectionForm />}
                  />
                </ActionPanel>
              }
            />
            <List.Item
              title="Saved Queries"
              icon={Icon.Bookmark}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Saved Queries"
                    target={<QueryList kind="saved" />}
                  />
                </ActionPanel>
              }
            />
            <List.Item
              title="Recent Runs"
              icon={Icon.Clock}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Recent Runs"
                    target={<QueryList kind="history" />}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
        </>
      )}
    </List>
  );
}
