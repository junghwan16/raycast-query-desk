import { LocalStorage, showToast, Toast } from "@raycast/api";
import { useSyncExternalStore } from "react";
import { type Connection, type Run, type SavedQuery } from "./model";

export type State = {
  connections: Connection[];
  drafts: Record<string, string>;
  saved: SavedQuery[];
  history: Run[];
};

const initial: State = { connections: [], drafts: {}, saved: [], history: [] };
const key = "query-desk.v1";
let state = initial;
let loaded = false;
let loadError: string | undefined;
let pending = Promise.resolve();
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load() {
  return (loading ??= LocalStorage.getItem<string>(key)
    .then((raw) => {
      if (raw) state = JSON.parse(raw) as State;
      loaded = true;
    })
    .catch(() => {
      loadError = "Query Desk could not read its local data.";
    })
    .finally(publish));
}

export function useStore() {
  void load();
  const data = useSyncExternalStore(subscribe, () => state);
  const ready = useSyncExternalStore(subscribe, () => loaded);
  const error = useSyncExternalStore(subscribe, () => loadError);
  return { data, ready, error };
}

export function update(change: (previous: State) => State) {
  if (!loaded) return Promise.reject(new Error("Local data is unavailable."));
  const write = pending
    .catch(() => {})
    .then(async () => {
      const next = change(state);
      await LocalStorage.setItem(key, JSON.stringify(next));
      state = next;
      publish();
    });
  pending = write;
  return write;
}

export function storageError() {
  return showToast({
    style: Toast.Style.Failure,
    title: "Couldn't save Query Desk data",
  });
}
