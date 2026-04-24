import { MCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { SkillSuggestionCard } from "@app/components/skill_builder/SkillSuggestionCard";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeMCPServerViews } from "@app/poke/swr/mcp_server_views";
import { usePokeSkillSuggestionDetails } from "@app/poke/swr/skill_suggestion_details";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";
import { Chip, LinkWrapper, Spinner } from "@dust-tt/sparkle";
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

  const stateColorMap: Record<
    SkillSuggestionState,
    "info" | "primary" | "warning" | "rose"
  > = {
    pending: "warning",
    approved: "primary",
    rejected: "rose",
    outdated: "info",
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">
          {suggestion.title ?? "Suggestion"}
        </h2>
        <Chip color={stateColorMap[suggestion.state]} size="sm">
          {suggestion.state}
        </Chip>
        <Chip color="info" size="sm">
          {suggestion.source}
        </Chip>
      </div>
      <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
        {suggestion.sId} · Skill&nbsp;
        <LinkWrapper
          href={`/${owner.sId}/skills/${suggestion.skillConfigurationId}`}
          className="text-highlight-500"
        >
          {suggestion.skillConfigurationId}
        </LinkWrapper>
        {suggestion.notificationConversationId && (
          <>
            &nbsp;· Notification&nbsp;
            <LinkWrapper
              href={`/poke/${owner.sId}/conversation/${suggestion.notificationConversationId}`}
              className="text-highlight-500"
            >
              {suggestion.notificationConversationId}
            </LinkWrapper>
          </>
        )}
      </p>
      {suggestion.updatedBy && (
        <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
          Updated by{" "}
          <span title={suggestion.updatedBy.email}>
            {suggestion.updatedBy.fullName}
          </span>{" "}
          on {formatTimestampToFriendlyDate(suggestion.updatedAt)}
        </p>
      )}
      {suggestion.visibleSourceConversationIds.length > 0 && (
        <div className="mt-2">
          <span className="text-sm font-medium">
            Source conversations ({suggestion.sourceConversationsCount}):
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {suggestion.visibleSourceConversationIds.map((conversationId) => (
              <LinkWrapper
                key={conversationId}
                href={`/poke/${owner.sId}/conversation/${conversationId}`}
                className="text-sm text-highlight-500"
              >
                {conversationId}
              </LinkWrapper>
            ))}
          </div>
        </div>
      )}

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
