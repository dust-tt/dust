// One engine worker + client per viewer session, with the POISONED recovery
// recipe from the repo README: when the wasm instance traps the client is
// terminal, so `reset()` destroys it, spawns a fresh worker and hands back a
// new client identity (which remounts everything keyed on it).

import { useCallback, useEffect, useRef, useState } from "react";

import { SheetEngineClient } from "@dust/sheet-engine-client";

function createClient(): SheetEngineClient {
  const worker = new Worker(new URL("./engine-worker.ts", import.meta.url), {
    type: "module",
  });
  return new SheetEngineClient(worker);
}

export function useEngineClient(): {
  client: SheetEngineClient;
  /** Bumps on every reset; key remount-sensitive subtrees on it. */
  generation: number;
  /** Destroy the current client (terminating its worker) and start fresh. */
  reset: () => void;
} {
  const [generation, setGeneration] = useState(0);
  const clientRef = useRef<SheetEngineClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = createClient();
  }

  const reset = useCallback(() => {
    clientRef.current?.destroy();
    clientRef.current = createClient();
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []);

  return { client: clientRef.current, generation, reset };
}
