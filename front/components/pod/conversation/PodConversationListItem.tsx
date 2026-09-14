import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import type { WorkspaceType } from "@app/types/user";
import { ConversationListItem, ReplySection } from "@dust-tt/sparkle";
import moment from "moment";

interface PodConversationListItemProps {
  conversation: PodConversationListItemType;
  owner: WorkspaceType;
}

export function PodConversationListItem({
  conversation,
  owner,
}: PodConversationListItemProps) {
  const router = useAppRouter();
  const time = moment(conversation.updated).fromNow();
  return (
    <>
      <ConversationListItem
        className="border-t-0 border-b-0 rounded-2xl hover:bg-hover"
        key={conversation.id}
        textAnimation={conversation.isRunningAgentLoop ? "streaming" : "none"}
        conversation={{
          id: conversation.id,
          title: conversation.title,
          description: stripMarkdown(conversation.description ?? ""),
          updatedAt: new Date(conversation.updated),
        }}
        unread={conversation.unreadMessageCount > 0}
        creator={{
          fullName: conversation.creator?.name ?? "",
          portrait: conversation.creator?.visual ?? "",
        }}
        time={time}
        replySection={
          conversation.replyCount || conversation.unreadMessageCount ? (
            <ReplySection
              replyCount={conversation.replyCount}
              unreadCount={conversation.unreadMessageCount}
              avatars={conversation.avatars}
              lastMessageBy={conversation.avatars[0]?.name ?? "Unknown"}
            />
          ) : null
        }
        onClick={async () => {
          await router.push(
            getConversationRoute(owner.sId, conversation.id),
            undefined,
            { shallow: true }
          );
        }}
      />
    </>
  );
}
