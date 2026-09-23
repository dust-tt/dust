import {
  parseSuggestionPreviewData,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { AgentDetailsBody } from "@app/components/assistant/details/AgentDetailsBody";
import { AgentSuggestionPreviewProvider } from "@app/components/assistant/details/SuggestionPreviewContext";
import { useAgentSuggestions } from "@app/lib/swr/agent_suggestions";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface ConversationAgentPanelProps {
  owner: LightWorkspaceType;
}

export function ConversationAgentPanel({ owner }: ConversationAgentPanelProps) {
  const { closePanel, data } = useConversationSidePanelContext();
  const { entityId, suggestionIds } = parseSuggestionPreviewData(data);
  const agentId = entityId || null;
  const { user } = useUser();

  const { suggestions, isSuggestionsLoading } = useAgentSuggestions({
    agentConfigurationId: agentId,
    workspaceId: owner.sId,
    disabled: !suggestionIds,
  });
  const previewSuggestions = useMemo(() => {
    const ids = suggestionIds.split(",");
    return suggestions.filter(
      (s) => s.state === "pending" && ids.includes(s.sId)
    );
  }, [suggestions, suggestionIds]);

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">Agent</span>
      </ConversationSidePanelHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!user || isSuggestionsLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <AgentSuggestionPreviewProvider suggestions={previewSuggestions}>
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
