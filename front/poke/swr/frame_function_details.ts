import type {
  PokeGetFrameFunction,
  PokeGetFrameFunctionSource,
  PokeGetFrameFunctionVersions,
} from "@app/lib/api/poke/frames";
import type {
  PokeGetSandboxFunctionInvocation,
  PokeGetSandboxFunctionMCPActionOutput,
  PokeListSandboxFunctionInvocations,
  PokeSandboxFunctionInvocation,
} from "@app/lib/api/poke/sandbox_functions";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
} from "@app/types/api/sandbox_functions";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface FrameFunctionScope {
  owner: LightWorkspaceType;
  frameId: string;
  functionId: string;
}

function frameFunctionUrl({ owner, frameId, functionId }: FrameFunctionScope) {
  return `/api/poke/workspaces/${owner.sId}/frames/${frameId}/functions/${functionId}`;
}

// The invocations of every version of a function name.
export function frameFunctionNameInvocationsUrl({
  owner,
  frameId,
  slug,
}: {
  owner: LightWorkspaceType;
  frameId: string;
  slug: string;
}) {
  return `/api/poke/workspaces/${owner.sId}/frames/${frameId}/function-names/${slug}/invocations`;
}

export function usePokeFrameFunctionDetails({
  owner,
  frameId,
  functionId,
  disabled,
}: FrameFunctionScope & { disabled?: boolean }) {
  const { fetcher } = useFetcher();
  const frameFunctionFetcher: Fetcher<PokeGetFrameFunction> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    frameFunctionUrl({ owner, frameId, functionId }),
    frameFunctionFetcher,
    { disabled }
  );

  return {
    frameFunction: data?.frameFunction ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeFrameFunctionVersions({
  owner,
  frameId,
  slug,
}: {
  owner: LightWorkspaceType;
  frameId: string;
  slug: string;
}) {
  const { fetcher } = useFetcher();
  const versionsFetcher: Fetcher<PokeGetFrameFunctionVersions> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/frames/${frameId}/function-names/${slug}`,
    versionsFetcher
  );

  return {
    versions: data?.versions ?? null,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}

export function usePokeFrameFunctionSource({
  owner,
  frameId,
  functionId,
  disabled,
}: FrameFunctionScope & { disabled?: boolean }) {
  const { fetcher } = useFetcher();
  const sourceFetcher: Fetcher<PokeGetFrameFunctionSource> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `${frameFunctionUrl({ owner, frameId, functionId })}/source`,
    sourceFetcher,
    { disabled }
  );

  return {
    source: data?.source ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeSandboxFunctionInvocations({
  invocationsUrl,
  limit,
  status,
  origin,
  disabled,
}: {
  invocationsUrl: string;
  limit: number;
  status?: SandboxFunctionInvocationStatus;
  origin?: SandboxFunctionInvocationOrigin;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const invocationsFetcher: Fetcher<PokeListSandboxFunctionInvocations> =
    fetcher;

  const params = new URLSearchParams({ limit: limit.toString() });
  if (status) {
    params.set("status", status);
  }
  if (origin) {
    params.set("origin", origin);
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `${invocationsUrl}?${params.toString()}`,
    invocationsFetcher,
    { disabled }
  );

  return {
    invocations: data?.items ?? emptyArray<PokeSandboxFunctionInvocation>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeSandboxFunctionInvocation({
  owner,
  frameId,
  functionId,
  invocationId,
  disabled,
}: FrameFunctionScope & { invocationId: string; disabled?: boolean }) {
  const { fetcher } = useFetcher();
  const invocationFetcher: Fetcher<PokeGetSandboxFunctionInvocation> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `${frameFunctionUrl({ owner, frameId, functionId })}/invocations/${invocationId}`,
    invocationFetcher,
    { disabled }
  );

  return {
    invocation: data?.invocation ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeSandboxFunctionMCPActionOutput({
  owner,
  frameId,
  functionId,
  invocationId,
  actionId,
  disabled,
}: FrameFunctionScope & {
  invocationId: string;
  actionId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const outputFetcher: Fetcher<PokeGetSandboxFunctionMCPActionOutput> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `${frameFunctionUrl({ owner, frameId, functionId })}/invocations/${invocationId}/actions/${actionId}/output`,
    outputFetcher,
    { disabled }
  );

  return {
    output: data?.output ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
