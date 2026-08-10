import type { PersonalAuthResolutionOutcome } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { PersonalAuthenticationCard } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useResolveAuthentication } from "@app/lib/swr/tool_actions";
import type { OAuthProvider } from "@app/types/oauth/lib";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface MCPServerPersonalAuthenticationRequiredProps {
  blockedAction: AgentLoopBlockedToolExecution;
  triggeringUser: UserType | null;
  mcpServerId: string;
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  scope?: string;
}

export function MCPServerPersonalAuthenticationRequired({
  blockedAction,
  triggeringUser,
  mcpServerId,
  owner,
  provider,
  scope,
}: MCPServerPersonalAuthenticationRequiredProps) {
  const { user } = useAuth();
  const { refreshBlockedActions } = useBlockedActionsContext();

  const { resolveAuthentication, isResolving } = useResolveAuthentication({
    owner,
  });

  const handleResolve = async (
    outcome: PersonalAuthResolutionOutcome
  ): Promise<boolean> => {
    const result = await resolveAuthentication({
      contextType: "agent_loop",
      kind: "authentication",
      outcome,
      actionId: blockedAction.actionId,
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
    });

    if (!result.success) {
      return false;
    }

    await refreshBlockedActions();
    return true;
  };

  return (
    <PersonalAuthenticationCard
      triggeringUser={triggeringUser}
      currentUser={user}
      mcpServerId={mcpServerId}
      owner={owner}
      provider={provider}
      scope={scope}
      isResolving={isResolving}
      onResolve={handleResolve}
    />
  );
}
