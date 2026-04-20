import { MCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { SkillSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeMCPServerViews } from "@app/poke/swr/mcp_server_views";
import { usePokeSkillSuggestionDetails } from "@app/poke/swr/skill_suggestion_details";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

export function SkillSuggestionDetailsPage() {
  const owner = useWorkspace();
  useDocumentTitle(`Poke - ${owner.name} - Suggestion`);

  const suggestionId = useRequiredPathParam("suggestionId");

  const { data, isLoading, isError } = usePokeSkillSuggestionDetails({
    owner,
    suggestionId,
  });

  const { data: mcpServerViews, isLoading: isMCPServerViewsLoading } =
    usePokeMCPServerViews({ owner });

  const mcpContextValue = useMemo(
    () => ({
      mcpServerViews,
      mcpServerViewsWithKnowledge: [],
      mcpServerViewsWithoutKnowledge: [],
      isMCPServerViewsLoading,
      isMCPServerViewsError: false,
    }),
    [mcpServerViews, isMCPServerViewsLoading]
  );

  const getSkillInstructionsHtml = useCallback(
    () => data?.skillInstructionsHtml ?? "",
    [data?.skillInstructionsHtml]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading suggestion.</p>
      </div>
    );
  }

  const { suggestion } = data;

  return (
    <div>
      <h2 className="text-2xl font-bold">{suggestion.title ?? "Suggestion"}</h2>
      <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
        {suggestion.sId} · Skill&nbsp;
        <LinkWrapper
          href={`/${owner.sId}/skills/${suggestion.skillConfigurationId}`}
          className="text-highlight-500"
        >
          {suggestion.skillConfigurationId}
        </LinkWrapper>
      </p>

      <div className="mt-4 space-y-6">
        <div>
          <h2 className="text-md pb-2 font-bold">Suggestion card</h2>
          <MCPServerViewsContext.Provider value={mcpContextValue}>
            <SkillSuggestionCard
              suggestion={suggestion}
              getSkillInstructionsHtml={getSkillInstructionsHtml}
            />
          </MCPServerViewsContext.Provider>
        </div>

        <div>
          <h2 className="text-md pb-2 font-bold">Raw suggestion</h2>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
            <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
              {JSON.stringify(suggestion.suggestion, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
