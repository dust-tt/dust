import type { PersonalAuthResolutionOutcome } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { PersonalAuthenticationCard } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useResolveAuthentication } from "@app/lib/swr/tool_actions";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface MCPServerPersonalAuthenticationRequiredProps {
  blockedAction: Extract<
    AgentLoopBlockedToolExecution,
    { status: "blocked_authentication_required" }
  >;
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
}

export function MCPServerPersonalAuthenticationRequired({
  blockedAction,
  triggeringUser,
  owner,
}: MCPServerPersonalAuthenticationRequiredProps) {
  const { user } = useAuth();
  const { refreshBlockedActions, removeCompletedAction } =
    useBlockedActionsContext();

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

    removeCompletedAction(blockedAction.actionId);
    await refreshBlockedActions();
    return true;
  };

  return (
    <PersonalAuthenticationCard
      triggeringUser={triggeringUser}
      currentUser={user}
      mcpServerId={blockedAction.metadata.mcpServerId}
      mcpServerDisplayName={blockedAction.metadata.mcpServerDisplayName}
      owner={owner}
      provider={blockedAction.authorizationInfo.provider}
      scope={blockedAction.authorizationInfo.scope}
      isResolving={isResolving}
      onResolve={handleResolve}
    />
  );
}
