"use client";

import type { HtmlFollower, HtmlFollowersPayload } from "@/types/github";

export type ExploreStore = {
  url: string;
  payload: HtmlFollowersPayload | null;
  users: HtmlFollower[];
  error: string | null;
};

const listeners = new Set<() => void>();

let store: ExploreStore = {
  url: "",
  payload: null,
  users: [],
  error: null,
};

const serverSnapshot: ExploreStore = {
  url: "",
  payload: null,
  users: [],
  error: null,
};

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function assign(next: ExploreStore) {
  store = next;
  emit();
}

export function subscribeExploreStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getExploreStore() {
  return store;
}

export function getExploreStoreServerSnapshot() {
  return serverSnapshot;
}

export function setExploreStore(partial: Partial<ExploreStore>) {
  assign({ ...store, ...partial });
}

export function updateExploreUsers(
  updater: (current: HtmlFollower[]) => HtmlFollower[],
) {
  assign({ ...store, users: updater(store.users) });
}

export function clearExploreStore() {
  assign({
    url: "",
    payload: null,
    users: [],
    error: null,
  });
}
