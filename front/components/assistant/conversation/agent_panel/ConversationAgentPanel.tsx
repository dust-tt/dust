import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { AgentDetailsBody } from "@app/components/assistant/details/AgentDetailsBody";
import { AgentSuggestionPreviewProvider } from "@app/components/assistant/details/SuggestionPreviewContext";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface ConversationAgentPanelProps {
  owner: LightWorkspaceType;
}

export function ConversationAgentPanel({ owner }: ConversationAgentPanelProps) {
  const {
    closePanel,
    data: agentId,
    panelParams,
  } = useConversationSidePanelContext();
  const { user } = useUser();
  const previewSuggestions =
    panelParams?.type === "agent" ? (panelParams.previewSuggestions ?? []) : [];

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">Agent</span>
      </ConversationSidePanelHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!user ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <AgentSuggestionPreviewProvider suggestions={previewSuggestions}>
            <AgentDetailsBody
              agentId={agentId ?? null}
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
