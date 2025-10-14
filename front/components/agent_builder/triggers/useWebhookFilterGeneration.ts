import { useCallback, useEffect, useState } from "react";

import { useDebounce } from "@app/hooks/useDebounce";
import { useWebhookFilterGenerator } from "@app/lib/swr/agent_triggers";
import type { LightWorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";

interface UseWebhookFilterGenerationProps {
  workspace: LightWorkspaceType;
  eventSchema: any;
}

type FilterGenerationStatus = "idle" | "loading" | "error";

/**
 * Custom hook to handle webhook filter generation with debounced input. Generates a filter expression
 * from natural language description based on the provided event schema. The hook requires a minimum of
 * 10 characters before triggering generation to ensure sufficient context for the AI model.
 */
export function useWebhookFilterGeneration({
  workspace,
  eventSchema,
}: UseWebhookFilterGenerationProps) {
  const [generatedFilter, setGeneratedFilter] = useState<string>("");
  const [status, setStatus] = useState<FilterGenerationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generateFilter = useWebhookFilterGenerator({ workspace });

  // Use existing debounce hook with 500ms delay (balance between responsiveness and API load) and
  // minimum 10 character requirement (ensures sufficient context for generation).
  const {
    inputValue: naturalDescription,
    debouncedValue: debouncedDescription,
    isDebouncing,
    setValue: setNaturalDescription,
    cancel: cancelDebounce,
  } = useDebounce("", { delay: 500, minLength: 10 });

  useEffect(() => {
    if (isDebouncing) {
      setStatus("loading");
      setGeneratedFilter("");
    }
  }, [isDebouncing]);

  useEffect(() => {
    if (!debouncedDescription || !eventSchema) {
      if (!debouncedDescription) {
        setStatus("idle");
        setGeneratedFilter("");
        setErrorMessage(null);
      }
      return;
    }

    const generateFilterAsync = async () => {
      setStatus("loading");
      try {
        const result = await generateFilter({
          naturalDescription: debouncedDescription,
          eventSchema: eventSchema.fields,
        });
        setGeneratedFilter(result.filter);
        setStatus("idle");
        setErrorMessage(null);
      } catch (error) {
        setStatus("error");
        setGeneratedFilter("");
        setErrorMessage(
          `Error generating filter: ${normalizeError(error).message}`
        );
      }
    };

    void generateFilterAsync();
  }, [debouncedDescription, eventSchema, generateFilter]);

  const clearFilter = useCallback(() => {
    setNaturalDescription("");
    setGeneratedFilter("");
    setStatus("idle");
    setErrorMessage(null);
    cancelDebounce();
  }, [setNaturalDescription, cancelDebounce]);

  return {
    naturalDescription,
    setNaturalDescription,
    generatedFilter,
    status,
    errorMessage,
    clearFilter,
  };
}
