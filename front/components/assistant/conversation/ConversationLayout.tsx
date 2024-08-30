import type {
  ConversationType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useEffect, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { deleteConversation } from "@app/components/assistant/conversation/lib";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useConversation, useConversations } from "@app/lib/swr";

export interface ConversationLayoutProps {
  baseUrl: string;
  conversationId: string | null;
  gaTrackingId: string;
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

export default function ConversationLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: ConversationLayoutProps;
}) {
  const { baseUrl, conversationId, gaTrackingId, owner, subscription } =
    pageProps;

  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const [detailViewContent, setDetailViewContent] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(
    conversationId !== "new" ? conversationId : null
  );

  const handleCloseModal = () => {
    const currentPathname = router.pathname;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assistantDetails, ...restQuery } = router.query;
    void router.push(
      { pathname: currentPathname, query: restQuery },
      undefined,
      {
        shallow: true,
      }
    );
  };

  useEffect(() => {
    const handleRouteChange = () => {
      const assistantSId = router.query.assistantDetails ?? [];
      // We use shallow browsing when creating a new conversation.
      // Monitor router to update conversation info.
      const conversationId = router.query.cId ?? "";

      if (assistantSId && typeof assistantSId === "string") {
        setDetailViewContent(assistantSId);
      } else {
        setDetailViewContent("");
      }

      if (
        conversationId &&
        typeof conversationId === "string" &&
        conversationId !== activeConversationId
      ) {
        setActiveConversationId(
          conversationId !== "new" ? conversationId : null
        );
      }
    };

    // Initial check in case the component mounts with the query already set.
    handleRouteChange();

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [
    router.query,
    router.events,
    setActiveConversationId,
    activeConversationId,
  ]);

  const { conversations, isConversationsError, mutateConversations } =
    useConversations({
      workspaceId: owner.sId,
    });

  const { conversation } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const onDeleteConversation = useCallback(
    async (conversationId: string) => {
      await deleteConversation({
        workspaceId: owner.sId,
        conversationId: conversationId,
        sendNotification,
      });

      await mutateConversations((prevState) => {
        return {
          ...prevState,
          conversations:
            prevState?.conversations.filter(
              (conversation: ConversationType) =>
                conversation.sId !== conversationId
            ) ?? [],
        };
      });

      void router.push(`/w/${owner.sId}/assistant/new`);
    },
    [mutateConversations, owner.sId, router, sendNotification]
  );

  return (
    <RootLayout>
      <InputBarProvider>
        <AppLayout
          subscription={subscription}
          owner={owner}
          isWideMode
          pageTitle={
            conversation?.title
              ? `Dust - ${conversation?.title}`
              : `Dust - New Conversation`
          }
          gaTrackingId={gaTrackingId}
          titleChildren={
            // TODO: Improve so we don't re-render everytime.
            conversation && (
              <ConversationTitle
                owner={owner}
                conversation={conversation}
                shareLink={`${baseUrl}/w/${owner.sId}/assistant/${activeConversationId}`}
                onDelete={onDeleteConversation}
              />
            )
          }
          navChildren={
            <AssistantSidebarMenu
              owner={owner}
              conversations={conversations}
              isConversationsError={isConversationsError}
            />
          }
        >
          <AssistantDetails
            owner={owner}
            assistantId={detailViewContent || null}
            onClose={handleCloseModal}
          />
          <FileDropProvider>
            <GenerationContextProvider>{children}</GenerationContextProvider>
          </FileDropProvider>
        </AppLayout>
      </InputBarProvider>
    </RootLayout>
  );
}
