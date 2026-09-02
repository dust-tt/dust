import type {
  PokeGetPodFunction,
  PokeGetPodFunctionSource,
} from "@app/lib/api/poke/projects";
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

interface PodFunctionScope {
  owner: LightWorkspaceType;
  projectId: string;
  functionId: string;
}

function podFunctionUrl({ owner, projectId, functionId }: PodFunctionScope) {
  return `/api/poke/workspaces/${owner.sId}/projects/${projectId}/pod-functions/${functionId}`;
}

export function usePokePodFunction({
  owner,
  projectId,
  functionId,
  disabled,
}: PodFunctionScope & { disabled?: boolean }) {
  const { fetcher } = useFetcher();
  const podFunctionFetcher: Fetcher<PokeGetPodFunction> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    podFunctionUrl({ owner, projectId, functionId }),
    podFunctionFetcher,
    { disabled }
  );

  return {
    podFunction: data?.podFunction ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokePodFunctionSource({
  owner,
  projectId,
  functionId,
  disabled,
}: PodFunctionScope & { disabled?: boolean }) {
  const { fetcher } = useFetcher();
  const sourceFetcher: Fetcher<PokeGetPodFunctionSource> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `${podFunctionUrl({ owner, projectId, functionId })}/source`,
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
  owner,
  projectId,
  functionId,
  limit,
  status,
  origin,
  disabled,
}: PodFunctionScope & {
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
    `${podFunctionUrl({ owner, projectId, functionId })}/invocations?${params.toString()}`,
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
  projectId,
  functionId,
  invocationId,
  disabled,
}: PodFunctionScope & { invocationId: string; disabled?: boolean }) {
  const { fetcher } = useFetcher();
  const invocationFetcher: Fetcher<PokeGetSandboxFunctionInvocation> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `${podFunctionUrl({ owner, projectId, functionId })}/invocations/${invocationId}`,
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
  projectId,
  functionId,
  invocationId,
  actionId,
  disabled,
}: PodFunctionScope & {
  invocationId: string;
  actionId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const outputFetcher: Fetcher<PokeGetSandboxFunctionMCPActionOutput> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `${podFunctionUrl({ owner, projectId, functionId })}/invocations/${invocationId}/actions/${actionId}/output`,
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
