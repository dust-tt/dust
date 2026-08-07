import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { usePodConversations } from "@app/hooks/conversations";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import type { WorkspaceType } from "@app/types/user";
import { Avatar, cn } from "@dust-tt/sparkle";
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
      className="relative flex w-full items-center gap-2 p-3 text-left hover:bg-muted-background"
    >
      <span
        className={cn(
          "h-4 w-0.5 shrink-0 rounded-r-full",
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
      <span className="shrink-0 text-sm font-medium text-foreground">
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
