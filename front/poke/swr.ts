import type { ConversationType, LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { fetcher } from "@app/lib/swr/swr";
import type { PokeFetchAssistantTemplateResponse } from "@app/pages/api/poke/templates/[tId]";
import type { GetDocumentsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/data_sources/[dsId]/documents";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates";

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

export function useConversation({
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

export function useDocuments(
  owner: LightWorkspaceType,
  dataSource: { name: string },
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error, mutate } = useSWR(
    `/api/poke/workspaces/${owner.sId}/data_sources/${encodeURIComponent(
      dataSource.name
    )}/documents?limit=${limit}&offset=${offset}`,
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
