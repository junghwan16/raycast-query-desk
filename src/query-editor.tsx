import { randomUUID } from "node:crypto";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import {
  HISTORY_LIMIT,
  type Connection,
  type QueryRecord,
  type Run,
  type SavedQuery,
} from "./model";
import { runQuery } from "./query";
import { ResultView } from "./result-view";
import { storageError, update, useStore } from "./store";

export function SaveQueryForm({
  source,
  existing,
}: {
  source: Omit<QueryRecord, "id">;
  existing?: SavedQuery;
}) {
  const { pop } = useNavigation();
  const busy = useRef(false);
  async function save(values: { name: string }) {
    if (busy.current) return;
    const name = values.name.trim();
    if (!name) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Enter a query name",
      });
      return;
    }
    busy.current = true;
    try {
      const entry = { ...source, id: existing?.id ?? randomUUID(), name };
      await update((state) => ({
        ...state,
        saved: existing
          ? state.saved.map((item) => (item.id === existing.id ? entry : item))
          : [entry, ...state.saved],
      }));
      pop();
    } catch {
      await storageError();
    } finally {
      busy.current = false;
    }
  }

  return (
    <Form
      navigationTitle="Save Query"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Query" onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        autoFocus
        defaultValue={existing?.name}
      />
      <Form.Description title="Connection" text={source.connectionName} />
    </Form>
  );
}

type Props = { connection: Connection; initial?: string; saved?: SavedQuery };

export function QueryEditor({ connection, initial, saved }: Props) {
  const { data } = useStore();
  const [sql, setSql] = useState(
    () => initial ?? saved?.sql ?? data.drafts[connection.id] ?? "",
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);
  const { push } = useNavigation();

  useEffect(() => () => request.current?.abort(), []);

  function change(value: string) {
    setSql(value);
    setError(undefined);
    void update((state) => ({
      ...state,
      drafts: { ...state.drafts, [connection.id]: value },
    })).catch(storageError);
  }

  function source(value: string): Omit<QueryRecord, "id"> {
    return {
      connectionId: connection.id,
      connectionName: connection.name,
      sql: value,
    };
  }

  async function execute(values: { sql: string }) {
    if (request.current || !values.sql.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setRunning(true);
    setError(undefined);
    try {
      const runningQuery = runQuery(connection, values.sql, controller.signal);
      const run: Run = {
        ...source(values.sql),
        id: randomUUID(),
        executedAt: Date.now(),
      };
      void update((state) => ({
        ...state,
        drafts: { ...state.drafts, [connection.id]: values.sql },
        history: [run, ...state.history].slice(0, HISTORY_LIMIT),
      })).catch(storageError);
      const result = await runningQuery;
      if (!controller.signal.aborted)
        push(<ResultView result={result} title={connection.name} />);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error ? failure.message : "The query failed.",
        );
      }
    } finally {
      request.current = undefined;
      setRunning(false);
    }
  }

  return (
    <Form
      navigationTitle={saved?.name ?? connection.name}
      isLoading={running}
      actions={
        <ActionPanel>
          {running ? (
            <Action
              title="Cancel Query"
              icon={Icon.XMarkCircle}
              onAction={() => request.current?.abort()}
            />
          ) : (
            <Action.SubmitForm
              title="Run Query"
              icon={Icon.Play}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              onSubmit={execute}
            />
          )}
          {sql.trim() && !running && (
            <Action
              title={saved ? "Update Saved Query" : "Save Query"}
              icon={Icon.Bookmark}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
              onAction={() =>
                push(<SaveQueryForm source={source(sql)} existing={saved} />)
              }
            />
          )}
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="sql"
        title="SQL"
        value={sql}
        onChange={change}
        autoFocus
        placeholder="SELECT …"
        error={error}
      />
      <Form.Description
        title="Target"
        text={
          connection.engine === "mysql"
            ? `${connection.host}:${connection.port}/${connection.database}`
            : `${connection.profile} · ${connection.region} · ${connection.catalog}.${connection.database}`
        }
      />
    </Form>
  );
}
