import {
  Button,
  NavigationList,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
  Page,
} from "@dust-tt/sparkle";
import moment from "moment";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import {
  ConversationMenu,
  useConversationMenu,
} from "@app/components/assistant/conversation/ConversationMenu";
import { useConversationsNavigation } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useMarkAllConversationsAsRead } from "@app/hooks/useMarkAllConversationsAsRead";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import type { DustError } from "@app/lib/error";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useSpaceConversations } from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  ContentFragmentsType,
  ConversationWithoutContentType,
  Result,
  RichMention,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok, toMentionType } from "@app/types";

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
  conversation: ConversationWithoutContentType;
  owner: WorkspaceType;
  router: ReturnType<typeof useRouter>;
}) {
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
  const {
    isMenuOpen,
    menuTriggerPosition,
    handleRightClick,
    handleMenuOpenChange,
  } = useConversationMenu();

  const conversationLabel =
    conversation.title ??
    (moment(conversation.created).isSame(moment(), "day")
      ? "New Conversation"
      : `Conversation from ${new Date(conversation.created).toLocaleDateString()}`);

  function getConversationDotStatus(
    conversation: ConversationWithoutContentType
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

  return (
    <NavigationListItem
      selected={router.query.cId === conversation.sId}
      status={getConversationDotStatus(conversation)}
      label={conversationLabel}
      moreMenu={
        <ConversationMenu
          activeConversationId={conversation.sId}
          conversation={conversation}
          owner={owner}
          trigger={<NavigationListItemAction />}
          isConversationDisplayed={router.query.cId === conversation.sId}
          isOpen={isMenuOpen}
          onOpenChange={handleMenuOpenChange}
          triggerPosition={menuTriggerPosition}
        />
      }
      onContextMenu={handleRightClick}
      onClick={async () => {
        if (sidebarOpen) {
          setSidebarOpen(false);
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
        await router.push(
          getConversationRoute(owner.sId, conversation.sId),
          undefined,
          {
            shallow: true,
          }
        );
      }}
    />
  );
}

export const getServerSideProps = withDefaultUserAuthRequirements<
  ConversationLayoutProps & {
    space: SpaceType;
  }
>(async (context, auth) => {
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
      space: space.toJSON(),
    },
  };
});

export default function SpaceConversations({
  owner,
  subscription,
  user,
  space,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { activeConversationId } = useConversationsNavigation();
  const sendNotification = useSendNotification();

  const { conversations, mutateConversations } = useSpaceConversations({
    workspaceId: owner.sId,
    space,
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
        owner,
        user,
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
        },
        spaceId: space.sId,
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
      space.sId,
      setPlanLimitReached,
      sendNotification,
      router,
      mutateConversations,
    ]
  );

  const { markAllAsRead, isMarkingAllAsRead } = useMarkAllConversationsAsRead({
    owner,
  });

  const conversationsByDate = useMemo(() => {
    return conversations.length
      ? getGroupConversationsByDate({
          conversations,
          titleFilter: "",
        })
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
      <div className="flex h-full w-full flex-col overflow-auto px-4 py-4 md:px-8">
        {/* New conversation section */}
        <div className="mb-8">
          <Page.Header title="New conversation" />
          <div
            className={classNames(
              "sticky bottom-0 z-20 flex w-full",
              "pb-2",
              "sm:w-full sm:max-w-3xl sm:pb-4"
            )}
          >
            <InputBar
              owner={owner}
              onSubmit={handleConversationCreation}
              conversationId={null}
              disableAutoFocus={false}
            />
          </div>
        </div>

        {/* Space conversations section */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <Page.Header title="Space conversations" />
            {unreadConversations.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                label="Mark all as read"
                onClick={() => markAllAsRead(unreadConversations)}
                isLoading={isMarkingAllAsRead}
              />
            )}
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
                  <div
                    key={dateLabel}
                    className="px-3 sm:flex sm:flex-col sm:gap-0.5"
                  >
                    <NavigationListLabel
                      label={dateLabel}
                      isSticky
                      className="bg-muted-background dark:bg-muted-background-night"
                    />
                    {dateConversations.map((conversation) => (
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
