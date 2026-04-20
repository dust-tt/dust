import type { ConversationForkNotice as ConversationForkNoticeType } from "@app/components/assistant/conversation/types";
import { LinkWrapper } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";

const UNTITLED_CONVERSATION_TITLE = "Untitled conversation";

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
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border dark:bg-border-dark-night" />
      <div className="min-w-0 break-words text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
        <span>
          {getForkingUserDisplayName(message)} branched this conversation:{" "}
        </span>
        <LinkWrapper
          href={getConversationRoute(owner.sId, message.childConversationId)}
          className="text-foreground transition duration-200 hover:underline dark:text-foreground-night"
        >
          {message.childConversationTitle ?? UNTITLED_CONVERSATION_TITLE}
        </LinkWrapper>
      </div>
      <div className="h-px flex-1 bg-border dark:bg-border-dark-night" />
    </div>
  );
}
