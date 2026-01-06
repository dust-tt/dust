import { Button, NavigationList, NavigationListLabel } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import { useSpaceConversations } from "@app/lib/swr/conversations";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ContentFragmentsType,
  ConversationType,
  Result,
  RichMention,
  WorkspaceType,
} from "@app/types";
import { Err, Ok, toMentionType } from "@app/types";

import { SpaceConversationListItem } from "./SpaceConversationListItem";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

interface SpaceConversationsTabProps {
  owner: WorkspaceType;
  user: ConversationLayoutProps["user"];
  spaceId: string | null;
}

export function SpaceConversationsTab({
  owner,
  user,
  spaceId,
}: SpaceConversationsTabProps) {
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const router = useRouter();
  const sendNotification = useSendNotification();
  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  const { conversations, mutateConversations } = useSpaceConversations({
    workspaceId: owner.sId,
    spaceId,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);

  const handleConversationCreation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[]
    ): Promise<Result<undefined, DustError>> => {
      if (isSubmitting) {
        return new Err({
          code: "internal_error",
          name: "AlreadySubmitting",
          message: "Already submitting",
        });
      }

      setIsSubmitting(true);

      const conversationRes = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
        },
        spaceId,
      });

      setIsSubmitting(false);

      if (conversationRes.isErr()) {
        if (conversationRes.error.type === "plan_limit_reached_error") {
          setPlanLimitReached(true);
        } else {
          sendNotification({
            title: conversationRes.error.title,
            description: conversationRes.error.message,
            type: "error",
          });
        }

        return new Err({
          code: "internal_error",
          name: conversationRes.error.title,
          message: conversationRes.error.message,
        });
      } else {
        // Navigate to the new conversation
        await router.push(
          getConversationRoute(owner.sId, conversationRes.value.sId),
          undefined,
          { shallow: true }
        );

        // Update the conversations list
        await mutateConversations(
          (currentData) => {
            return {
              ...currentData,
              conversations: [
                ...(currentData?.conversations ?? []),
                conversationRes.value,
              ],
            };
          },
          { revalidate: false }
        );

        return new Ok(undefined);
      }
    },
    [
      isSubmitting,
      owner,
      spaceId,
      setPlanLimitReached,
      sendNotification,
      router,
      mutateConversations,
      createConversationWithMessage,
    ]
  );

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  const conversationsByDate: Record<GroupLabel, ConversationType[]> =
    useMemo(() => {
      return conversations.length
        ? (getGroupConversationsByDate({
            conversations,
            titleFilter: "",
          }) as Record<GroupLabel, ConversationType[]>)
        : ({} as Record<GroupLabel, typeof conversations>);
    }, [conversations]);

  const unreadConversations = useMemo(() => {
    return conversations.filter((c) => c.unread);
  }, [conversations]);

  return (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      <div className="mt-4 flex w-full flex-col gap-4">
        <div className="heading-lg">New conversation</div>
        <InputBar
          owner={owner}
          user={user}
          onSubmit={handleConversationCreation}
          conversationId={null}
          disableAutoFocus={false}
        />
        <div className="w-full">
          <div className="flex items-center justify-between">
            <div className="heading-lg">
              {spaceInfo?.name
                ? `Conversations in "${spaceInfo.name}"`
                : "All conversations"}
            </div>
            <Button
              size="sm"
              variant="outline"
              label="Mark all as read"
              onClick={() => markAllAsRead(unreadConversations)}
              isLoading={isMarkingAllAsRead}
              disabled={unreadConversations.length === 0}
            />
          </div>

          {conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              No conversations yet. Start a new conversation above.
            </div>
          ) : (
            <NavigationList className="dd-privacy-mask h-full w-full">
              {Object.keys(conversationsByDate).map((dateLabel) => {
                const dateConversations =
                  conversationsByDate[dateLabel as GroupLabel];
                if (dateConversations.length === 0) {
                  return null;
                }

                return (
                  <div key={dateLabel} className="flex flex-col gap-1">
                    <NavigationListLabel label={dateLabel} />
                    {dateConversations
                      .toSorted((a, b) => b.updated - a.updated)
                      .map((conversation) => (
                        <SpaceConversationListItem
                          key={conversation.sId}
                          conversation={conversation}
                          owner={owner}
                        />
                      ))}
                  </div>
                );
              })}
            </NavigationList>
          )}
        </div>
      </div>
    </DropzoneContainer>
  );
}
