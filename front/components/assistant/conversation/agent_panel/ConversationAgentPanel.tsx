import {
  parseSuggestionPreviewData,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { AgentDetailsBody } from "@app/components/assistant/details/AgentDetailsBody";
import { AgentSuggestionPreviewProvider } from "@app/components/assistant/details/SuggestionPreviewContext";
import { SuggestionPreviewHeader } from "@app/components/assistant/details/SuggestionPreviewHeader";
import { useAgentSuggestions } from "@app/lib/swr/agent_suggestions";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { cn, Spinner } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface ConversationAgentPanelProps {
  owner: LightWorkspaceType;
  conversationId: string;
}

export function ConversationAgentPanel({
  owner,
  conversationId,
}: ConversationAgentPanelProps) {
  const { closePanel, data } = useConversationSidePanelContext();
  const { entityId, suggestionIds } = parseSuggestionPreviewData(data);
  const agentId = entityId || null;
  const { user } = useUser();

  const { suggestions, isSuggestionsLoading } = useAgentSuggestions({
    agentConfigurationId: agentId,
    workspaceId: owner.sId,
    conversationId,
    sources: ["conversational"],
    disabled: !suggestionIds,
  });
  const previewSuggestions = useMemo(() => {
    const ids = suggestionIds.split(",");
    return suggestions.filter(
      (s) => s.state === "pending" && ids.includes(s.sId)
    );
  }, [suggestions, suggestionIds]);
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
          onToggle={() => setHiddenPreviewData(isApplied ? data : undefined)}
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
