import { useCallback } from "react";

import logger from "@app/logger/logger";
import type { RichMention } from "@app/types";

interface UseMentionValidationParams {
  workspaceId: string;
  conversationId: string | null;
}

/**
 * Hook to validate mentions against backend.
 * This hook provides a function to check if a given mention text
 * corresponds to a valid agent or user that the user can mention.
 *
 * @param workspaceId - The workspace ID
 * @param conversationId - The conversation ID (optional)
 */
export function useMentionValidation({
  workspaceId,
  conversationId,
}: UseMentionValidationParams) {
  /**
   * Validates a mention label by querying the backend.
   * Returns the matching RichMention if valid, null otherwise.
   *
   * @param label - The mention label to validate (without the @ symbol)
   */
  const validateMention = useCallback(
    async (label: string): Promise<RichMention | null> => {
      if (!label) {
        return null;
      }

      // Normalize the label for comparison.
      const normalizedLabel = label.trim();

      try {
        // Query the backend with the exact label.
        const searchParams = new URLSearchParams({ query: normalizedLabel });
        if (conversationId) {
          searchParams.append("conversationId", conversationId);
        }

        const response = await fetch(
          `/api/w/${workspaceId}/assistant/mentions/suggestions?${searchParams.toString()}`
        );

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        const suggestions: RichMention[] = data.suggestions ?? [];

        // Find an exact match (case-insensitive).
        const match = suggestions.find(
          (suggestion) =>
            suggestion.label.toLowerCase() === normalizedLabel.toLowerCase()
        );

        return match ?? null;
      } catch (error) {
        logger.error({ error }, "Error validating mention");
        return null;
      }
    },
    [workspaceId, conversationId]
  );

  return {
    validateMention,
  };
}
