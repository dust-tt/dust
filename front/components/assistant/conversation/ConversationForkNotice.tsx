import type { ConversationForkNotice as ConversationForkNoticeType } from "@app/components/assistant/conversation/types";
import { LinkWrapper } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { Trans } from "@lingui/react/macro";

interface ConversationForkNoticeProps {
  message: ConversationForkNoticeType;
  owner: WorkspaceType;
}

function getForkingUserDisplayName(
  message: ConversationForkNoticeType
): string {
  return message.user.fullName || message.user.username;
}

export function ConversationForkNotice({
  message,
  owner,
}: ConversationForkNoticeProps) {
  const userName = getForkingUserDisplayName(message);
  const childConversationTitle = getConversationDisplayTitle({
    title: message.childConversationTitle,
    created: message.created,
  });

  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <div className="min-w-0 break-words text-center text-sm text-muted-foreground">
        <Trans>
          {userName} branched this conversation:{" "}
          <LinkWrapper
            href={getConversationRoute(owner.sId, message.childConversationId)}
            className="text-foreground transition duration-200 hover:underline"
          >
            {childConversationTitle}
          </LinkWrapper>
        </Trans>
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
