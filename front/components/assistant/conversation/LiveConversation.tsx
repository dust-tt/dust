/** @jsxRuntime automatic */
import { LiveConversationPanel } from "@app/components/assistant/conversation/LiveConversationPanel";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useLiveConversation } from "@app/lib/swr/live";
import type { UserType, WorkspaceType } from "@app/types/user";
import { getWorkspaceDefaultAgentId } from "@app/types/user";
import { useRef, useState } from "react";

interface LiveConversationProps {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
}

export function LiveConversation({
  owner,
  user,
  conversationId,
}: LiveConversationProps) {
  const [selectedAgentId, setAgentId] = useState(
    getWorkspaceDefaultAgentId(owner)
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });
  const agentId =
    selectedAgentId ??
    agentConfigurations.find((agent) => agent.canRead)?.sId ??
    "";
  const live = useLiveConversation({ owner, user, conversationId, agentId });

  return (
    <LiveConversationPanel
      {...live}
      agents={agentConfigurations.filter((agent) => agent.canRead)}
      agentsLoading={isAgentConfigurationsLoading}
      agentId={agentId}
      audioRef={audioRef}
      error={
        live.error ??
        (isAgentConfigurationsError ? "Unable to load your agents." : null)
      }
      onAgentChange={setAgentId}
      onStart={() => {
        if (audioRef.current) {
          void live.start(audioRef.current);
        }
      }}
      onStop={live.stop}
      onToggleMute={live.toggleMute}
    />
  );
}
