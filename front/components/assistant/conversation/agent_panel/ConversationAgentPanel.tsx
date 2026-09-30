import {
  parseSuggestionPreviewData,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { AgentDetailsBody } from "@app/components/assistant/details/AgentDetailsBody";
import {
  AgentSuggestionPreviewProvider,
  isPreviewedSuggestion,
} from "@app/components/assistant/details/SuggestionPreviewContext";
import { SuggestionPreviewHeader } from "@app/components/assistant/details/SuggestionPreviewHeader";
import { isAgentActionCardSuggestion } from "@app/components/markdown/suggestion/suggestion_directives";
import { trackSuggestionPreviewToggle } from "@app/components/markdown/suggestion/suggestionTracking";
import { useSuggestionBatch } from "@app/hooks/useSuggestionBatches";
import { useUser } from "@app/lib/swr/user";
import { isCreateAgentSuggestion } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { cn, Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

interface ConversationAgentPanelProps {
  owner: LightWorkspaceType;
}

export function ConversationAgentPanel({ owner }: ConversationAgentPanelProps) {
  const { closePanel, data } = useConversationSidePanelContext();
  const { entityId, batchId } = parseSuggestionPreviewData(data);
  const agentId = entityId || null;
  const { user } = useUser();

  const { batch, isBatchLoading: isSuggestionsLoading } = useSuggestionBatch({
    batchId: batchId ?? null,
    workspaceId: owner.sId,
  });
  const previewSuggestions = useMemo(
    () =>
      (batch?.agentSuggestions ?? []).filter(
        (s) =>
          s.agentId === agentId &&
          isPreviewedSuggestion(s) &&
          isAgentActionCardSuggestion(s)
      ),
    [batch, agentId]
  );
  const isOutdatedCreation =
    batch?.state === "outdated" &&
    batch.agentSuggestions.some(
      (s) => s.agentId === agentId && isCreateAgentSuggestion(s)
    );
  useEffect(() => {
    if (isOutdatedCreation) {
      closePanel();
    }
  }, [isOutdatedCreation, closePanel]);
  const [hiddenPreviewData, setHiddenPreviewData] = useState<string>();
  const isApplied = hiddenPreviewData !== data;
  const hasPreview = previewSuggestions.length > 0;

  return (
    <div
      className={cn(
        "flex h-panel flex-col bg-panel-background",
        hasPreview &&
          isApplied &&
          "rounded-r-xl outline-4 -outline-offset-4 outline-highlight-100"
      )}
    >
      {hasPreview ? (
        <SuggestionPreviewHeader
          isApplied={isApplied}
          hasCreation={previewSuggestions.some(isCreateAgentSuggestion)}
          onToggle={() => {
            if (batchId) {
              trackSuggestionPreviewToggle({
                batchId,
                targetKind: "agent",
                showing: isApplied ? "current" : "suggested",
              });
            }
            setHiddenPreviewData(isApplied ? data : undefined);
          }}
          onClose={closePanel}
        />
      ) : (
        <ConversationSidePanelHeader onClose={closePanel}>
          <span className="text-sm font-medium text-foreground">Agent</span>
        </ConversationSidePanelHeader>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!user || isSuggestionsLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <AgentSuggestionPreviewProvider
            suggestions={previewSuggestions}
            isApplied={isApplied}
          >
            <AgentDetailsBody
              agentId={agentId}
              owner={owner}
              user={user}
              isInSidePanel
            />
          </AgentSuggestionPreviewProvider>
        )}
      </div>
    </div>
  );
}
