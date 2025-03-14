import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { fetcher } from "@app/lib/swr/swr";
import type { PokeFetchAssistantTemplateResponse } from "@app/pages/api/poke/templates/[tId]";
import type { PullTemplatesResponseBody } from "@app/pages/api/poke/templates/pull";
import type { GetDocumentsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/data_sources/[dsId]/documents";
import type { GetTablesResponseBody } from "@app/pages/api/poke/workspaces/[wId]/data_sources/[dsId]/tables";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/templates";
import type {
  ConversationType,
  DataSourceType,
  LightWorkspaceType,
} from "@app/types";

export function usePokePullTemplates() {
  const { mutateAssistantTemplates } = usePokeAssistantTemplates();
  const [isPulling, setIsPulling] = useState(false);

  const doPull = useCallback(async () => {
    setIsPulling(true);
    const response = await fetch("/api/poke/templates/pull", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to pull templates");
    }

    const data = (await response.json()) as PullTemplatesResponseBody;
    setIsPulling(false);
    if (data.success && data.count > 0) {
      void mutateAssistantTemplates();
      return data;
    }
    return data;
  }, [mutateAssistantTemplates]);

  return {
    doPull,
    isPulling,
  };
}

export function usePokeAssistantTemplates() {
  const assistantTemplatesFetcher: Fetcher<FetchAssistantTemplatesResponse> =
    fetcher;

  // Templates are shared across workspaces, not specific to a single one.
  // Use the same endpoint as the front-end to fetch templates.
  const { data, error, mutate } = useSWR(
    "/api/poke/templates",
    assistantTemplatesFetcher
  );

  return {
    assistantTemplates: useMemo(() => (data ? data.templates : []), [data]),
    isAssistantTemplatesLoading: !error && !data,
    isAssistantTemplatesError: error,
    mutateAssistantTemplates: mutate,
  };
}

export function usePokeAssistantTemplate({
  templateId,
}: {
  templateId: string | null;
}) {
  const assistantTemplateFetcher: Fetcher<PokeFetchAssistantTemplateResponse> =
    fetcher;

  const { data, error, mutate } = useSWR(
    templateId !== null ? `/api/poke/templates/${templateId}` : null,
    assistantTemplateFetcher
  );

  return {
    assistantTemplate: useMemo(() => (data ? data : null), [data]),
    isAssistantTemplateLoading: !error && !data,
    isAssistantTemplateError: error,
    mutateAssistantTemplate: mutate,
  };
}

export function usePokeConversation({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string | null;
}) {
  const conversationFetcher: Fetcher<{ conversation: ConversationType }> =
    fetcher;

  const { data, error, mutate } = useSWR(
    conversationId
      ? `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}`
      : null,
    conversationFetcher
  );

  return {
    conversation: data ? data.conversation : null,
    isConversationLoading: !error && !data,
    isConversationError: error,
    mutateConversation: mutate,
  };
}

export function usePokeDocuments(
  owner: LightWorkspaceType,
  dataSource: DataSourceType,
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error, mutate } = useSWR(
    `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/documents?limit=${limit}&offset=${offset}`,
    documentsFetcher
  );

  return {
    documents: useMemo(() => (data ? data.documents : []), [data]),
    total: data ? data.total : 0,
    isDocumentsLoading: !error && !data,
    isDocumentsError: error,
    mutateDocuments: mutate,
  };
}

export function usePokeTables(
  owner: LightWorkspaceType,
  dataSource: DataSourceType,
  limit: number,
  offset: number
) {
  const tablesFetcher: Fetcher<GetTablesResponseBody> = fetcher;
  const { data, error, mutate } = useSWR(
    `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/tables?limit=${limit}&offset=${offset}`,
    tablesFetcher
  );

  return {
    tables: useMemo(() => (data ? data.tables : []), [data]),
    total: data ? data.total : 0,
    isTablesLoading: !error && !data,
    isTablesError: error,
    mutateTables: mutate,
  };
}
