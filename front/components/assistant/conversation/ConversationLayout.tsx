import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ConversationError } from "@app/components/assistant/conversation/ConversationError";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import {
  useConversation,
  useDeleteConversation,
} from "@app/lib/swr/conversations";

export interface ConversationLayoutProps {
  baseUrl: string;
  conversationId: string | null;
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
  const { baseUrl, conversationId, owner, subscription } = pageProps;

  const router = useRouter();

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

  const { conversation, conversationError } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const doDelete = useDeleteConversation(owner);

  const onDeleteConversation = useCallback(async () => {
    const res = await doDelete(conversation);
    if (res) {
      void router.push(`/w/${owner.sId}/assistant/new`);
    }
  }, [conversation, doDelete, owner.sId, router]);

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
          navChildren={<AssistantSidebarMenu owner={owner} />}
        >
          {conversationError ? (
            <ConversationError error={conversationError} />
          ) : (
            <>
              <AssistantDetails
                owner={owner}
                assistantId={detailViewContent || null}
                onClose={handleCloseModal}
              />
              <FileDropProvider>
                <GenerationContextProvider>
                  {children}
                </GenerationContextProvider>
              </FileDropProvider>
            </>
          )}
        </AppLayout>
      </InputBarProvider>
    </RootLayout>
  );
}
