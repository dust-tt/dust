import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useContext, useEffect, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { deleteConversation } from "@app/components/assistant/conversation/lib";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useConversation } from "@app/lib/swr";

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
      if (assistantSId && typeof assistantSId === "string") {
        setDetailViewContent(assistantSId);
      } else {
        setDetailViewContent("");
      }
    };

    // Initial check in case the component mounts with the query already set.
    handleRouteChange();

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.query, router.events]);

  const { conversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  return (
    <RootLayout>
      <InputBarProvider>
        <AppLayout
          subscription={subscription}
          owner={owner}
          isWideMode={!!conversation}
          pageTitle={
            conversation?.title
              ? `Dust - ${conversation?.title}`
              : `Dust - New Conversation`
          }
          gaTrackingId={gaTrackingId}
          topNavigationCurrent="conversations"
          titleChildren={
            // TODO: Improve so we don't re-render everytime.
            conversation && (
              <ConversationTitle
                owner={owner}
                conversation={conversation}
                shareLink={`${baseUrl}/w/${owner.sId}/assistant/${conversationId}`}
                onDelete={async () => {
                  await deleteConversation({
                    workspaceId: owner.sId,
                    conversationId: conversation.sId,
                    sendNotification,
                  });

                  void router.push(`/w/${owner.sId}/assistant/new`);
                }}
              />
            )
          }
          navChildren={<AssistantSidebarMenu owner={owner} />}
        >
          <AssistantDetails
            owner={owner}
            assistantId={detailViewContent || null}
            onClose={handleCloseModal}
          />
          <GenerationContextProvider>{children}</GenerationContextProvider>
        </AppLayout>
      </InputBarProvider>
    </RootLayout>
  );
}
