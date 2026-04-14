import { GoogleDriveFileAuthorizationRequired } from "@app/components/assistant/conversation/GoogleDriveFileAuthorizationRequired";
import { MCPServerPersonalAuthenticationRequired } from "@app/components/assistant/conversation/MCPServerPersonalAuthenticationRequired";
import { MCPToolValidationRequired } from "@app/components/assistant/conversation/MCPToolValidationRequired";
import { UserAnswerRequired } from "@app/components/assistant/conversation/UserAnswerRequired";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface BlockedActionProps {
  blockedAction: BlockedToolExecution;
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
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
  messageId,
  retryHandler,
}: BlockedActionProps) {
  switch (blockedAction.status) {
    case "blocked_validation_required":
      return (
        <MCPToolValidationRequired
          triggeringUser={triggeringUser}
          owner={owner}
          blockedAction={blockedAction}
          conversationId={conversationId}
          messageId={messageId}
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
          retryHandler={() =>
            retryHandler({
              conversationId: blockedAction.conversationId,
              messageId: blockedAction.messageId,
            })
          }
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
      return (
        <UserAnswerRequired
          blockedAction={blockedAction}
          triggeringUser={triggeringUser}
          owner={owner}
          conversationId={conversationId}
          messageId={messageId}
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
