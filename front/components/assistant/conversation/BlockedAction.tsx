import { GoogleDriveFileAuthorizationRequired } from "@app/components/assistant/conversation/GoogleDriveFileAuthorizationRequired";
import { MCPServerPersonalAuthenticationRequired } from "@app/components/assistant/conversation/MCPServerPersonalAuthenticationRequired";
import { MCPToolValidationRequired } from "@app/components/assistant/conversation/MCPToolValidationRequired";
import { UserAnswerRequired } from "@app/components/assistant/conversation/UserAnswerRequired";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth } from "@app/lib/auth/AuthContext";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface BlockedActionProps {
  blockedAction: AgentLoopBlockedToolExecution;
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  conversationId: string;
  retryHandler: (params: {
    conversationId: string;
    messageId: string;
  }) => Promise<void>;
}

export function BlockedAction({
  blockedAction,
  triggeringUser,
  owner,
  conversationId,
  retryHandler,
}: BlockedActionProps) {
  const { user } = useAuth();

  switch (blockedAction.status) {
    case "blocked_validation_required":
      return (
        <MCPToolValidationRequired
          triggeringUser={triggeringUser}
          owner={owner}
          blockedAction={blockedAction}
          conversationId={conversationId}
        />
      );

    case "blocked_authentication_required":
      return (
        <MCPServerPersonalAuthenticationRequired
          blockedAction={blockedAction}
          triggeringUser={triggeringUser}
          owner={owner}
          mcpServerId={blockedAction.metadata.mcpServerId}
          provider={blockedAction.authorizationInfo.provider}
          scope={blockedAction.authorizationInfo.scope}
        />
      );

    case "blocked_file_authorization_required":
      return (
        <GoogleDriveFileAuthorizationRequired
          blockedAction={blockedAction}
          triggeringUser={triggeringUser}
          owner={owner}
          fileAuthorizationInfo={blockedAction.fileAuthorizationInfo}
          mcpServerId={blockedAction.metadata.mcpServerId}
          retryHandler={() =>
            retryHandler({
              conversationId: blockedAction.conversationId,
              messageId: blockedAction.messageId,
            })
          }
        />
      );

    case "blocked_user_answer_required":
      if (
        canCurrentUserRespondToParentUserMessage({
          parentUserId: blockedAction.userId,
          currentUserId: user?.sId,
        })
      ) {
        return null;
      }

      return (
        <UserAnswerRequired
          blockedAction={blockedAction}
          triggeringUser={triggeringUser}
          owner={owner}
          retryHandler={() =>
            retryHandler({
              conversationId: blockedAction.conversationId,
              messageId: blockedAction.messageId,
            })
          }
        />
      );

    // Flattened into child actions by BlockedActionsProvider — never reached here.
    case "blocked_child_action_input_required":
      return null;

    default:
      assertNeverAndIgnore(blockedAction);
      return null;
  }
}
