"use client";

import type { HtmlRepo, HtmlReposPayload } from "@/types/github";

export type StarsStore = {
  url: string;
  payload: HtmlReposPayload | null;
  repositories: HtmlRepo[];
  error: string | null;
  pendingExtract: boolean;
};

const listeners = new Set<() => void>();

let store: StarsStore = {
  url: "",
  payload: null,
  repositories: [],
  error: null,
  pendingExtract: false,
};

const serverSnapshot: StarsStore = {
  url: "",
  payload: null,
  repositories: [],
  error: null,
  pendingExtract: false,
};

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function assign(next: StarsStore) {
  store = next;
  emit();
}

export function subscribeStarsStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStarsStore() {
  return store;
}

export function getStarsStoreServerSnapshot() {
  return serverSnapshot;
}

export function setStarsStore(partial: Partial<StarsStore>) {
  assign({ ...store, ...partial });
}

export function updateStarsRepos(
  updater: (current: HtmlRepo[]) => HtmlRepo[],
) {
  assign({ ...store, repositories: updater(store.repositories) });
}

export function queueStarsExtract(login: string) {
  const trimmed = login.trim().replace(/^@/, "");
  assign({
    url: `https://github.com/${trimmed}`,
    payload: null,
    repositories: [],
    error: null,
    pendingExtract: true,
  });
}

export function clearStarsStore() {
  assign({
    url: "",
    payload: null,
    repositories: [],
    error: null,
    pendingExtract: false,
  });
}
