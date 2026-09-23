"use client";

import { normalizeSandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import { isFrameFunctionReference } from "@viz/app/lib/frame-function-slug";
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

interface FrameFunctionContextValue {
  dataAPI: VisualizationDataAPI;
}

interface FrameFunctionHooksProviderProps extends FrameFunctionContextValue {
  children?: ReactNode;
}

export interface UseFrameFunctionResult {
  data: unknown;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<unknown>;
}

export interface UseFrameFunctionMutationResult {
  data: unknown;
  error: Error | undefined;
  /** True while a triggered mutation is in flight. Prefer this name. */
  isMutating: boolean;
  /**
   * Alias of {@link isMutating}. Kept so Frame UIs written against query-style
   * `isLoading` still typecheck.
   */
  isLoading: boolean;
  reset: () => void;
  trigger: (input: unknown) => Promise<unknown>;
}

export type UseUserIdentityResult = UserIdentityState & {
  error: Error | undefined;
  isLoading: boolean;
};

type FrameFunctionQueryKey = readonly ["frame-function", string, unknown];
type FrameFunctionMutationKey = readonly ["frame-function-mutation", string];
const FRAME_FUNCTION_QUERY_DEDUPING_INTERVAL_MS = 2_000;

const FrameFunctionContext = createContext<FrameFunctionContextValue | null>(
  null
);

async function noopMutate(): Promise<undefined> {
  return undefined;
}

function resolveFrameFunction(slug: string | null): {
  functionId: string | null;
  error?: Error;
} {
  if (slug === null) {
    return { functionId: null };
  }
  if (!isFrameFunctionReference(slug)) {
    return {
      functionId: null,
      error: new Error(
        `'${slug}' is not a function name: Frame Function hooks take a bare name this ` +
          "Frame's manifest declares, such as 'list-notes'."
      ),
    };
  }

  return { functionId: slug };
}

export function FrameFunctionHooksProvider({
  children,
  dataAPI,
}: FrameFunctionHooksProviderProps) {
  const [cache] = useState(() => new Map());
  const swrConfig = useMemo(() => ({ provider: () => cache }), [cache]);
  const contextValue = useMemo(() => ({ dataAPI }), [dataAPI]);

  return createElement(
    FrameFunctionContext.Provider,
    { value: contextValue },
    createElement(SWRConfig, { value: swrConfig }, children)
  );
}

function useFrameFunctionContext(): FrameFunctionContextValue {
  const context = useContext(FrameFunctionContext);
  if (!context) {
    throw new Error("Frame Function hooks must run inside a Frame wrapper.");
  }

  return context;
}

export const useFrameDataAPI = () => useFrameFunctionContext().dataAPI;

export function useFrameFunction(
  slug: string | null,
  input: unknown
): UseFrameFunctionResult {
  const { dataAPI } = useFrameFunctionContext();
  const resolution = useMemo(() => resolveFrameFunction(slug), [slug]);
  const functionId = resolution.functionId;
  const key: FrameFunctionQueryKey | null = functionId
    ? ["frame-function", functionId, input]
    : null;
  const result = useSWR<unknown, Error, FrameFunctionQueryKey | null>(
    key,
    async ([, functionId, functionInput]) => {
      try {
        return await dataAPI.callFunction(functionId, functionInput);
      } catch (error) {
        throw normalizeSandboxFunctionCallError(error);
      }
    },
    {
      dedupingInterval: FRAME_FUNCTION_QUERY_DEDUPING_INTERVAL_MS,
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
  const { dataAPI } = useFrameFunctionContext();
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

export function useFrameFunctionMutation(
  slug: string | null
): UseFrameFunctionMutationResult {
  const { dataAPI } = useFrameFunctionContext();
  const resolution = useMemo(() => resolveFrameFunction(slug), [slug]);
  const functionId = resolution.functionId;
  const key: FrameFunctionMutationKey | null = functionId
    ? ["frame-function-mutation", functionId]
    : null;
  const result = useSWRMutation<
    unknown,
    Error,
    FrameFunctionMutationKey | null,
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
        throw new Error("Cannot trigger a disabled Frame Function mutation.");
      }

      return result.trigger(input);
    },
    [resolution.error, resolution.functionId, result.trigger]
  );

  const isMutating = key !== null && !mutationKeyChanged && result.isMutating;

  return {
    data: mutationKeyChanged ? undefined : result.data,
    error: resolution.error ?? (mutationKeyChanged ? undefined : result.error),
    isMutating,
    isLoading: isMutating,
    reset: result.reset,
    trigger,
  };
}
