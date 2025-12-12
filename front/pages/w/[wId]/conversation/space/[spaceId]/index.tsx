import {
  Avatar,
  Button,
  Card,
  ContentMessage,
  NavigationList,
  NavigationListLabel,
} from "@dust-tt/sparkle";
import moment from "moment";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import type { DustError } from "@app/lib/error";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useSpaceConversations } from "@app/lib/swr/conversations";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ContentFragmentsType,
  ConversationType,
  Result,
  RichMention,
  WorkspaceType,
} from "@app/types";
import {
  Err,
  isAgentMessageType,
  isUserMessageType,
  Ok,
  toMentionType,
} from "@app/types";

type GroupLabel =
  | "Today"
  | "Yesterday"
  | "Last Week"
  | "Last Month"
  | "Last 12 Months"
  | "Older";

function SpaceConversationListItem({
  conversation,
  owner,
  router,
}: {
  conversation: ConversationType;
  owner: WorkspaceType;
  router: ReturnType<typeof useRouter>;
}) {
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

  const firstUserMessage = conversation.content
    .map((m) => m[m.length - 1])
    .find(isUserMessageType);

  const iconsUrls = useMemo(() => {
    const urls = new Set<string>();
    // Lookup the messages in reverse order and collect the users and agents icons
    for (const versions of conversation.content) {
      const message = versions[versions.length - 1];
      if (isUserMessageType(message)) {
        urls.add(message.user?.image ?? "");
      } else if (isAgentMessageType(message)) {
        urls.add(message.configuration.pictureUrl ?? "");
      }

      if (urls.size === 4) {
        break;
      }
    }
    return Array.from(urls);
  }, [conversation.content]);

  // TODO(conversations-groups) Are we sure we want to require a user message?
  if (!firstUserMessage) {
    return null;
  }

  const conversationLabel =
    firstUserMessage.user?.fullName +
    " - " +
    (conversation.title ??
      (moment(conversation.created).isSame(moment(), "day")
        ? "New Conversation"
        : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`));

  function getConversationDotStatus(
    conversation: ConversationType
  ): "blocked" | "unread" | "idle" {
    if (conversation.actionRequired) {
      return "blocked";
    }
    if (conversation.hasError) {
      return "blocked";
    }
    if (conversation.unread) {
      return "unread";
    }
    return "idle";
  }

  const status = getConversationDotStatus(conversation);

  const getStatusDotColor = () => {
    switch (status) {
      case "unread":
        return "s-bg-highlight-500 dark:s-bg-highlight-500-night";
      case "blocked":
        return "s-bg-golden-500 dark:s-bg-golden-500-night";
      default:
        return "";
    }
  };

  const shouldShowStatusDot = status !== "idle";

  return (
    <>
      <Card
        variant="secondary"
        children={
          <div className="flex w-full flex-row items-center gap-2">
            <div
              className="relative"
              style={{ top: -((iconsUrls.length - 1) * 5) / 2 + "px", left: 0 }}
            >
              {iconsUrls.map((url, index) => (
                <div
                  className={classNames(index > 0 && "absolute")}
                  style={{
                    top: index * 5 + "px",
                    left: 0,
                    zIndex: index,
                  }}
                  key={`avatar-stack-${index}`}
                >
                  <Avatar visual={url} size="sm" />
                </div>
              ))}
            </div>
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-row items-center gap-2">
                {shouldShowStatusDot && (
                  <div
                    className={classNames(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      getStatusDotColor()
                    )}
                  />
                )}
                <div className="text-sm font-medium">{conversationLabel}</div>
                <div className="flex flex-grow" />
                <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {conversation.content.length} messages
                </div>
              </div>
              <AgentMessageMarkdown
                owner={owner}
                content={firstUserMessage?.content}
                isLastMessage={false}
                isStreaming={false}
                compactSpacing
                canCopyQuotes={false}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground dark:text-muted-foreground-night"
              />
            </div>
          </div>
        }
        onClick={async () => {
          if (sidebarOpen) {
            setSidebarOpen(false);
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
          await router.push(
            getConversationRoute(owner.sId, conversation.sId),
            undefined,
            { shallow: true }
          );
        }}
      />
    </>
  );
}

export const getServerSideProps =
  withDefaultUserAuthRequirements<ConversationLayoutProps>(
    async (context, auth) => {
      const owner = auth.workspace();
      const user = auth.user()?.toJSON();
      const subscription = auth.subscription();
      const isAdmin = auth.isAdmin();

      if (!owner || !user || !auth.isUser() || !subscription) {
        return {
          redirect: {
            destination: "/",
            permanent: false,
          },
        };
      }

      const { spaceId } = context.params;
      if (typeof spaceId !== "string") {
        return {
          notFound: true,
        };
      }

      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space || !space.canReadOrAdministrate(auth)) {
        return {
          notFound: true,
        };
      }

      return {
        props: {
          user,
          owner,
          isAdmin,
          subscription,
          baseUrl: config.getClientFacingUrl(),
          conversationId: null,
        },
      };
    }
  );

export default function SpaceConversations({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const spaceId = useActiveSpaceId();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const router = useRouter();
  const activeConversationId = useActiveConversationId();
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
      user,
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

  if (activeConversationId) {
    return (
      <ConversationContainerVirtuoso
        owner={owner}
        subscription={subscription}
        user={user}
      />
    );
  }

  return (
    <DropzoneContainer
      description="Drag and drop your text files (txt, doc, pdf) and image files (jpg, png) here."
      title="Attach files to the conversation"
    >
      <div className="max-h-dvh flex w-full flex-col gap-8 pb-2 pt-4 sm:w-full sm:max-w-3xl sm:pb-4">
        <div className="flex w-full flex-col gap-4">
          <ContentMessage title="Experimental feature" variant="info" size="lg">
            <p>
              This feature is currently in alpha, and only available in the Dust
              workspace ("conversations_groups" feature flag). The goal is to
              get feedback from internal usage and quickly iterate. Share your
              feedback in the{" "}
              <Link
                href="https://dust4ai.slack.com/archives/C09T7N4S6GG"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                initiative slack channel
              </Link>
              .
            </p>
          </ContentMessage>
          <div className="heading-lg">New conversation</div>
          <InputBar
            owner={owner}
            user={user}
            onSubmit={handleConversationCreation}
            conversationId={null}
            disableAutoFocus={false}
          />
        </div>
        {/* Space conversations section */}
        <div className="w-full">
          <div className="mb-4 flex items-center justify-between">
            <div className="heading-lg">
              Conversations in "{spaceInfo?.name ?? ""}"
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
                          router={router}
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

SpaceConversations.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};
