import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { fetcher } from "@app/lib/swr";
import type { PokeFetchAssistantTemplateResponse } from "@app/pages/api/poke/templates/[tId]";
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
