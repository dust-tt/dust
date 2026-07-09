import type { PersonalAuthResolutionOutcome } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { PersonalAuthenticationCard } from "@app/components/actions/blocked/PersonalAuthenticationCard";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useResolveAuthentication } from "@app/hooks/useResolveAuthentication";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { OAuthProvider } from "@app/types/oauth/lib";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface MCPServerPersonalAuthenticationRequiredProps {
  blockedAction: BlockedToolExecution;
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
  const { removeCompletedAction } = useBlockedActionsContext();

  const { resolveAuthentication, isResolving } = useResolveAuthentication({
    owner,
  });

  const handleResolve = async (
    outcome: PersonalAuthResolutionOutcome
  ): Promise<boolean> => {
    const result = await resolveAuthentication({
      outcome,
      actionId: blockedAction.actionId,
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
    });

    if (!result.success) {
      return false;
    }

    removeCompletedAction(blockedAction.actionId);
    return true;
  };

  return (
    <PersonalAuthenticationCard
      triggeringUser={triggeringUser}
      mcpServerId={mcpServerId}
      owner={owner}
      provider={provider}
      scope={scope}
      isResolving={isResolving}
      onResolve={handleResolve}
    />
  );
}
