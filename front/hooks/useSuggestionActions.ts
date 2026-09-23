import { useCallback, useState } from "react";

export type SuggestionReviewAction = "accept" | "reject";

interface SuggestionsBody<TSuggestion extends { sId: string }> {
  suggestions: TSuggestion[];
}

interface UseSuggestionActionsParams<TSuggestion extends { sId: string }> {
  patchSuggestions: (
    suggestionIds: string[],
    state: "approved" | "rejected",
    options?: { apply?: boolean }
  ) => Promise<SuggestionsBody<TSuggestion> | null>;
  mutateSuggestions: (
    update: (
      current: SuggestionsBody<TSuggestion> | undefined
    ) => SuggestionsBody<TSuggestion>,
    options: { revalidate: boolean }
  ) => unknown;
}

/**
 * @cc [owner:avervaet,label:product] apply-on-accept
 * Every accept request MUST ask the server to apply the suggestion to its target (`apply: true`).
 */
export function useSuggestionActions<TSuggestion extends { sId: string }>({
  patchSuggestions,
  mutateSuggestions,
}: UseSuggestionActionsParams<TSuggestion>) {
  const [pendingActions, setPendingActions] = useState<
    Record<string, SuggestionReviewAction>
  >({});

  const getPendingAction = useCallback(
    (suggestion: { sId: string }): SuggestionReviewAction | null =>
      pendingActions[suggestion.sId] ?? null,
    [pendingActions]
  );

  const setSuggestionsState = useCallback(
    async (
      suggestions: { sId: string }[],
      action: SuggestionReviewAction,
      options?: { apply?: boolean }
    ): Promise<boolean> => {
      const sIds = suggestions.map((s) => s.sId);
      setPendingActions((current) => ({
        ...current,
        ...Object.fromEntries(sIds.map((sId) => [sId, action])),
      }));

      const result = await patchSuggestions(
        sIds,
        action === "accept" ? "approved" : "rejected",
        options
      );

      const reviewedIds = new Set(sIds);
      setPendingActions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([sId]) => !reviewedIds.has(sId))
        )
      );

      if (!result || result.suggestions.length === 0) {
        return false;
      }

      const reviewedById = new Map(result.suggestions.map((s) => [s.sId, s]));
      void mutateSuggestions(
        (current) => ({
          suggestions: (current?.suggestions ?? []).map(
            (s) => reviewedById.get(s.sId) ?? s
          ),
        }),
        { revalidate: false }
      );

      return true;
    },
    [patchSuggestions, mutateSuggestions]
  );

  const batchAcceptSuggestions = useCallback(
    (suggestions: { sId: string }[]) =>
      setSuggestionsState(suggestions, "accept", { apply: true }),
    [setSuggestionsState]
  );
  const batchRejectSuggestions = useCallback(
    (suggestions: { sId: string }[]) =>
      setSuggestionsState(suggestions, "reject"),
    [setSuggestionsState]
  );
  const acceptSuggestion = useCallback(
    (suggestion: { sId: string }) => batchAcceptSuggestions([suggestion]),
    [batchAcceptSuggestions]
  );
  const rejectSuggestion = useCallback(
    (suggestion: { sId: string }) => batchRejectSuggestions([suggestion]),
    [batchRejectSuggestions]
  );

  return {
    getPendingAction,
    acceptSuggestion,
    rejectSuggestion,
    batchAcceptSuggestions,
    batchRejectSuggestions,
  };
}
