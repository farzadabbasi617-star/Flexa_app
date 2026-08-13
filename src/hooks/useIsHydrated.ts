"use client";

import { useSyncExternalStore } from "react";

// `useSyncExternalStore` is the idiomatic way to express "this value flips to
// true once the component hydrates on the client". It lets us gate
// browser-only rendering (localStorage reads, heavy client-only layers) without
// calling setState() synchronously inside an effect, which React and the
// react-hooks/set-state-in-effect rule discourage.
//
// Both snapshot functions and the subscribe callback are defined at module
// scope so their references stay stable across renders (a requirement of
// useSyncExternalStore) and the snapshots are cached constants.

const SERVER_SNAPSHOT = false; // rendered/streamed on the server
const CLIENT_SNAPSHOT = true; // hydrated on the client

const emptySubscribe = () => () => {};

/**
 * Returns `true` once the component has hydrated on the client, `false`
 * otherwise (server render and the first client paint).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => CLIENT_SNAPSHOT,
    () => SERVER_SNAPSHOT,
  );
}
