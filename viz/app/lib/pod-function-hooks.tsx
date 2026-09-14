"use client";

import { normalizeSandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import { isPodFunctionReference } from "@viz/app/lib/pod-function-slug";
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
import useSWR, { type KeyedMutator, SWRConfig } from "swr";
import useSWRMutation from "swr/mutation";

interface PodFunctionContextValue {
  dataAPI: VisualizationDataAPI;
}

interface PodFunctionHooksProviderProps extends PodFunctionContextValue {
  children?: ReactNode;
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
  if (!isPodFunctionReference(slug)) {
    return {
      functionId: null,
      error: new Error(
        "Pod Function hooks require a <podId>/<slug> reference, or a bare function name " +
          "from a Frame that lives in an app folder."
      ),
    };
  }

  return { functionId: slug };
}

export function PodFunctionHooksProvider({
  children,
  dataAPI,
}: PodFunctionHooksProviderProps) {
  const [cache] = useState(() => new Map());
  const swrConfig = useMemo(() => ({ provider: () => cache }), [cache]);
  const contextValue = useMemo(() => ({ dataAPI }), [dataAPI]);

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
  input: unknown
): UsePodFunctionResult {
  const { dataAPI } = usePodFunctionContext();
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

  return {
    data: key === null ? undefined : result.data,
    error: resolution.error ?? (key === null ? undefined : result.error),
    isLoading: key !== null && result.isLoading,
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
      isFrameAuthor: false,
      isPodEditor: false,
      isPodMember: false,
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
