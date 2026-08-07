import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { usePodConversations } from "@app/hooks/conversations";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import type { WorkspaceType } from "@app/types/user";
import { Avatar, cn, ListItemSection } from "@dust-tt/sparkle";
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
  const unread = conversation.unreadMessageCount > 0;

  return (
    <button
      type="button"
      onClick={() => {
        void router.push(
          getConversationRoute(owner.sId, conversation.id),
          undefined,
          {
            shallow: true,
          }
        );
      }}
      className="flex w-full items-center gap-3 rounded-lg py-2.5 pr-2 text-left hover:bg-muted-background"
    >
      <span
        className={cn(
          "h-8 w-0.5 shrink-0 rounded-full",
          unread ? "bg-highlight" : "bg-transparent"
        )}
      />
      <Avatar
        size="xs"
        name={conversation.creator?.name ?? ""}
        visual={conversation.creator?.visual ?? undefined}
        isRounded
      />
      {conversation.creator?.name && (
        <span className="shrink-0 text-sm text-foreground">
          {conversation.creator.name}
        </span>
      )}
      <span className="shrink-0 text-sm font-semibold text-foreground">
        {conversation.title}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {stripMarkdown(conversation.description ?? "")}
      </span>
      <span className="shrink-0 text-xs text-faint">
        {format(new Date(conversation.updated), "HH:mm")}
      </span>
    </button>
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
    <div className="mt-10">
      <h2 className="text-xl font-bold text-foreground">
        Recent conversations
      </h2>
      <div className="mt-3">
        {Object.entries(grouped).map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label}>
              <ListItemSection>{label}</ListItemSection>
              <div className="flex flex-col">
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
