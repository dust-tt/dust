import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  DatabaseTableEntry,
  GetPodDatabaseSchemaResponseBody,
  GetPodDatabasesResponseBody,
  GetPodDatabaseTablesResponseBody,
  GetPodTableRowsResponseBody,
  LiveDatabaseEntry,
  PostPodDatabaseQueryResponseBody,
} from "@app/types/api/sandbox/pod_databases";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";
import type { Fetcher } from "swr";

/**
 * Every call here runs a `dsbx db` command inside the pod sandbox, waking it (or cold starting
 * it) — so all of these hooks take `disabled` and are only enabled for the visible pane.
 */
function podDatabasesUrl(workspaceId: string, podId: string): string {
  return `/api/w/${workspaceId}/spaces/${podId}/databases`;
}

export function usePodDatabases({
  owner,
  podId,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  podId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const databasesFetcher: Fetcher<GetPodDatabasesResponseBody> = fetcher;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    podDatabasesUrl(owner.sId, podId),
    databasesFetcher,
    { disabled }
  );

  return {
    databases: data?.databases ?? emptyArray<LiveDatabaseEntry>(),
    isPodDatabasesLoading: disabled ? false : isLoading,
    isPodDatabasesError: !!error,
    mutatePodDatabases: mutate,
  };
}

export function usePodDatabaseTables({
  owner,
  podId,
  database,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  podId: string;
  database: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const tablesFetcher: Fetcher<GetPodDatabaseTablesResponseBody> = fetcher;
  const isDisabled = disabled || database === null;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    database === null
      ? null
      : `${podDatabasesUrl(owner.sId, podId)}/${encodeURIComponent(database)}/tables`,
    tablesFetcher,
    { disabled: isDisabled }
  );

  return {
    tables: data?.tables ?? emptyArray<DatabaseTableEntry>(),
    isPodDatabaseTablesLoading: isDisabled ? false : isLoading,
    isPodDatabaseTablesError: !!error,
    mutatePodDatabaseTables: mutate,
  };
}

export function usePodDatabaseSchema({
  owner,
  podId,
  database,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  podId: string;
  database: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const schemaFetcher: Fetcher<GetPodDatabaseSchemaResponseBody> = fetcher;
  const isDisabled = disabled || database === null;
  const { data, error, isLoading } = useSWRWithDefaults(
    database === null
      ? null
      : `${podDatabasesUrl(owner.sId, podId)}/${encodeURIComponent(database)}/schema`,
    schemaFetcher,
    { disabled: isDisabled }
  );

  return {
    schema: data?.schema ?? null,
    isPodDatabaseSchemaLoading: isDisabled ? false : isLoading,
    isPodDatabaseSchemaError: !!error,
  };
}

export function usePodTableRows({
  owner,
  podId,
  database,
  table,
  limit,
  offset,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  podId: string;
  database: string | null;
  table: string | null;
  limit: number;
  offset: number;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const rowsFetcher: Fetcher<GetPodTableRowsResponseBody> = fetcher;
  const isDisabled = disabled || database === null || table === null;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    isDisabled
      ? null
      : `${podDatabasesUrl(owner.sId, podId)}/${encodeURIComponent(database)}` +
          `/tables/${encodeURIComponent(table)}/rows?limit=${limit}&offset=${offset}`,
    rowsFetcher,
    { disabled: isDisabled }
  );

  return {
    columns: data?.columns ?? emptyArray<string>(),
    rows: data?.rows ?? emptyArray<Record<string, unknown>>(),
    hasMore: data?.hasMore ?? false,
    isPodTableRowsLoading: isDisabled ? false : isLoading,
    isPodTableRowsError: !!error,
    mutatePodTableRows: mutate,
  };
}

export type PodDatabaseQueryOutcome =
  | { status: "success"; result: PostPodDatabaseQueryResponseBody }
  | { status: "error"; message: string };

/**
 * Run one SQL statement against a pod database. Failures are returned rather than notified: a
 * rejected statement is the console's normal output and belongs next to the editor, not in a
 * toast.
 */
export function useRunPodDatabaseQuery({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const sendNotification = useSendNotification();
  const [isRunningQuery, setIsRunningQuery] = useState(false);

  const runQuery = async (
    database: string,
    sql: string
  ): Promise<PodDatabaseQueryOutcome> => {
    setIsRunningQuery(true);
    try {
      const response = await clientFetch(
        `${podDatabasesUrl(owner.sId, podId)}/${encodeURIComponent(database)}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        return { status: "error", message: error.message };
      }

      const result: PostPodDatabaseQueryResponseBody = await response.json();
      return { status: "success", result };
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to run query",
        description: "An unexpected error occurred. Please try again.",
      });
      return { status: "error", message: "An unexpected error occurred." };
    } finally {
      setIsRunningQuery(false);
    }
  };

  return { runQuery, isRunningQuery };
}
