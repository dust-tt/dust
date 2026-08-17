import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { usePodConversations } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import type { WorkspaceType } from "@app/types/user";
import { ConversationListItem, cn } from "@dust-tt/sparkle";
import { format } from "date-fns";
import { useMemo } from "react";

interface RecentConversationRowProps {
  conversation: PodConversationListItemType;
  owner: WorkspaceType;
}

function RecentConversationRow({
  conversation,
  owner,
}: RecentConversationRowProps) {
  const router = useAppRouter();
  const activeConversationId = useActiveConversationId();
  const unread = conversation.unreadMessageCount > 0;

  return (
    <ConversationListItem
      className={cn(activeConversationId === conversation.id && "bg-selected")}
      conversation={{
        id: conversation.id,
        title: conversation.title,
        description: stripMarkdown(conversation.description ?? ""),
        updatedAt: new Date(conversation.updated),
      }}
      unread={unread}
      creator={{
        fullName: conversation.creator?.name ?? "",
        portrait: conversation.creator?.visual ?? "",
      }}
      time={format(new Date(conversation.updated), "HH:mm")}
      onClick={() => {
        void router.push(
          getConversationRoute(owner.sId, conversation.id),
          undefined,
          {
            shallow: true,
          }
        );
      }}
    />
  );
}

interface RecentConversationsProps {
  owner: WorkspaceType;
  podId: string | null;
}

export function RecentConversations({
  owner,
  podId,
}: RecentConversationsProps) {
  const { conversations } = usePodConversations({
    workspaceId: owner.sId,
    podId,
  });

  const grouped = useMemo(
    () => getGroupConversationsByDate({ conversations, titleFilter: "" }),
    [conversations]
  );

  if (conversations.length === 0) {
    return null;
  }

  return (
    <div className="mt-14">
      <h2 className="text-base font-semibold leading-6 tracking-tight text-foreground">
        Recent conversations
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {Object.entries(grouped).map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label}>
              <p className="mb-2 text-sm font-semibold leading-5 text-muted-foreground">
                {label}
              </p>
              <div className="overflow-hidden rounded-xl border border-border">
                {items
                  .toSorted((a, b) => b.updated - a.updated)
                  .map((c) => (
                    <RecentConversationRow
                      key={c.id}
                      conversation={c}
                      owner={owner}
                    />
                  ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
