"use client";

import { normalizeSandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import {
  FrameCachePersistence,
  frameCacheStorageKey,
} from "@viz/app/lib/frame-cache-persistence";
import { POD_FUNCTION_REFERENCE_REGEX } from "@viz/app/lib/pod-function-slug";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type { UserIdentityState } from "@viz/app/types";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { type KeyedMutator, SWRConfig, unstable_serialize } from "swr";
import useSWRMutation from "swr/mutation";

interface PodFunctionContextValue {
  dataAPI: VisualizationDataAPI;
  persistence: FrameCachePersistence | null;
}

interface PodFunctionHooksProviderProps {
  children?: ReactNode;
  dataAPI: VisualizationDataAPI;
  // Stable identifier of the rendered content (e.g. "viz-<fileId>"). When set and the viewer
  // is an authenticated workspace member, function outputs persist across opens in
  // localStorage, namespaced by identifier and viewer. Absent: per-mount cache only.
  identifier?: string;
}

export interface UsePodFunctionOptions {
  // Set to false for must-be-fresh data: the result is then never persisted to, nor served
  // from, the cross-open cache. The per-mount SWR cache still applies.
  persist?: boolean;
}

export interface UsePodFunctionResult {
  data: unknown;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<unknown>;
}

export interface UsePodFunctionMutationResult {
  data: unknown;
  error: Error | undefined;
  isMutating: boolean;
  reset: () => void;
  trigger: (input: unknown) => Promise<unknown>;
}

export type UseUserIdentityResult = UserIdentityState & {
  error: Error | undefined;
  isLoading: boolean;
};

type PodFunctionQueryKey = readonly ["pod-function", string, unknown];
type PodFunctionMutationKey = readonly ["pod-function-mutation", string];
const POD_FUNCTION_QUERY_DEDUPING_INTERVAL_MS = 2_000;

const PodFunctionContext = createContext<PodFunctionContextValue | null>(null);

const EMPTY_FALLBACK: Record<string, unknown> = {};

async function noopMutate(): Promise<undefined> {
  return undefined;
}

function resolvePodFunction(slug: string | null): {
  functionId: string | null;
  error?: Error;
} {
  if (slug === null) {
    return { functionId: null };
  }
  if (!POD_FUNCTION_REFERENCE_REGEX.test(slug)) {
    return {
      functionId: null,
      error: new Error(
        "Pod Function hooks require a fully qualified <podId>/<slug> reference."
      ),
    };
  }

  return { functionId: slug };
}

function getLocalStorage(): Storage | null {
  // Accessing localStorage can throw (disabled storage, sandboxed iframe without
  // allow-same-origin); persistence is best-effort so treat that as unavailable.
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch (_error) {
    return null;
  }
}

interface PersistedCacheState {
  fallback: Record<string, unknown>;
  persistence: FrameCachePersistence;
}

export function PodFunctionHooksProvider({
  children,
  dataAPI,
  identifier,
}: PodFunctionHooksProviderProps) {
  const [cache] = useState(() => new Map());
  const [persisted, setPersisted] = useState<PersistedCacheState | null>(null);

  // Boot the cross-open cache: resolve the viewer, then hydrate their persisted entries as
  // SWR fallback. Hooks mount and fetch immediately; hydration only fills the interim
  // renders, so a slow or silent host merely leaves the cache cold.
  useEffect(() => {
    if (!identifier) {
      return;
    }
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }

    let cancelled = false;
    let persistence: FrameCachePersistence | null = null;
    const flushNow = () => persistence?.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
      }
    };

    const boot = async () => {
      let identity: UserIdentityState;
      try {
        identity = await dataAPI.getUserIdentity();
      } catch (_error) {
        // No host answered (headless render, legacy embedder): stay cold.
        return;
      }
      if (cancelled || !identity.isAuthenticated) {
        // The viz origin is shared: never persist anything for unauthenticated viewers.
        return;
      }

      persistence = new FrameCachePersistence({
        cache,
        storage,
        storageKey: frameCacheStorageKey(identifier, identity.user.sId),
      });
      const hydrated = persistence.hydrate();

      // Debounced writes lose the tail on navigation; flush when the page hides.
      window.addEventListener("pagehide", flushNow);
      document.addEventListener("visibilitychange", onVisibilityChange);

      setPersisted({
        fallback: Object.fromEntries(hydrated),
        persistence,
      });
    };
    void boot();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (persistence) {
        persistence.flush();
        persistence.dispose();
      }
    };
  }, [dataAPI, identifier, cache]);

  // The SWR provider is only read when SWRConfig mounts; later value updates only carry the
  // fallback, which hooks re-read on every render.
  const swrConfig = useMemo(
    () => ({
      provider: () => cache,
      fallback: persisted?.fallback ?? EMPTY_FALLBACK,
    }),
    [cache, persisted]
  );
  const contextValue = useMemo(
    () => ({ dataAPI, persistence: persisted?.persistence ?? null }),
    [dataAPI, persisted]
  );

  return createElement(
    PodFunctionContext.Provider,
    { value: contextValue },
    createElement(SWRConfig, { value: swrConfig }, children)
  );
}

function usePodFunctionContext(): PodFunctionContextValue {
  const context = useContext(PodFunctionContext);
  if (!context) {
    throw new Error("Pod Function hooks must run inside a Frame wrapper.");
  }

  return context;
}

export function usePodFunction(
  slug: string | null,
  input: unknown,
  options?: UsePodFunctionOptions
): UsePodFunctionResult {
  const { dataAPI, persistence } = usePodFunctionContext();
  const persistEnabled = options?.persist ?? true;
  const resolution = useMemo(() => resolvePodFunction(slug), [slug]);
  const functionId = resolution.functionId;
  const key: PodFunctionQueryKey | null = functionId
    ? ["pod-function", functionId, input]
    : null;
  const result = useSWR<unknown, Error, PodFunctionQueryKey | null>(
    key,
    async ([, functionId, functionInput]) => {
      try {
        return await dataAPI.callFunction(functionId, functionInput);
      } catch (error) {
        throw normalizeSandboxFunctionCallError(error);
      }
    },
    {
      dedupingInterval: POD_FUNCTION_QUERY_DEDUPING_INTERVAL_MS,
      errorRetryCount: 0,
      keepPreviousData: true,
      refreshInterval: 0,
      revalidateIfStale: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );
  const mutate = functionId ? result.mutate : noopMutate;

  const serializedKey = key === null ? null : unstable_serialize(key);
  const data = key === null ? undefined : result.data;

  useEffect(() => {
    if (!persistence || serializedKey === null) {
      return;
    }
    if (!persistEnabled) {
      // Opt-out also clears anything a previous (persisting) version of the frame stored.
      persistence.dropEntry(serializedKey);
      return;
    }
    if (data !== undefined) {
      persistence.recordEntry(serializedKey);
    }
  }, [persistence, persistEnabled, serializedKey, data]);

  return {
    data,
    error: resolution.error ?? (key === null ? undefined : result.error),
    // Fallback (and previous-key) data counts as loaded: frames branch on isLoading for
    // skeletons, and painting cached data is the point of the cross-open cache.
    isLoading: key !== null && result.isLoading && data === undefined,
    isValidating: key !== null && result.isValidating,
    mutate,
  };
}

export function useUserIdentity(): UseUserIdentityResult {
  const { dataAPI } = usePodFunctionContext();
  const result = useSWR<UserIdentityState, Error>(
    "workspace-user-identity",
    () => dataAPI.getUserIdentity(),
    {
      errorRetryCount: 0,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  if (!result.data) {
    return {
      error: result.error,
      isAuthenticated: false,
      isWorkspaceMember: false,
      isLoading: !result.error,
      user: null,
    };
  }

  return {
    ...result.data,
    error: result.error,
    isLoading: false,
  };
}

export function usePodFunctionMutation(
  slug: string | null
): UsePodFunctionMutationResult {
  const { dataAPI } = usePodFunctionContext();
  const resolution = useMemo(() => resolvePodFunction(slug), [slug]);
  const functionId = resolution.functionId;
  const key: PodFunctionMutationKey | null = functionId
    ? ["pod-function-mutation", functionId]
    : null;
  const result = useSWRMutation<
    unknown,
    Error,
    PodFunctionMutationKey | null,
    unknown
  >(
    key,
    async ([, functionId], { arg }) => {
      try {
        return await dataAPI.callFunction(functionId, arg);
      } catch (error) {
        throw normalizeSandboxFunctionCallError(error);
      }
    },
    { populateCache: false, revalidate: false, throwOnError: true }
  );
  const mutationFunctionIdRef = useRef(functionId);
  const mutationKeyChanged = mutationFunctionIdRef.current !== functionId;

  useEffect(() => {
    if (mutationFunctionIdRef.current !== resolution.functionId) {
      mutationFunctionIdRef.current = resolution.functionId;
      result.reset();
    }
  }, [resolution.functionId, result.reset]);

  const trigger = useCallback(
    async (input: unknown) => {
      if (resolution.error) {
        throw resolution.error;
      }
      if (!resolution.functionId) {
        throw new Error("Cannot trigger a disabled Pod Function mutation.");
      }

      return result.trigger(input);
    },
    [resolution.error, resolution.functionId, result.trigger]
  );

  return {
    data: mutationKeyChanged ? undefined : result.data,
    error: resolution.error ?? (mutationKeyChanged ? undefined : result.error),
    isMutating: key !== null && !mutationKeyChanged && result.isMutating,
    reset: result.reset,
    trigger,
  };
}
