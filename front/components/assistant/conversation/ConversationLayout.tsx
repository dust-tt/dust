import type {
  LightWorkspaceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { CoEditionContainer } from "@app/components/assistant/conversation/co-edition/CoEditionContainer";
import {
  CoEditionProvider,
  useCoEditionContext,
} from "@app/components/assistant/conversation/co-edition/CoEditionContext";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/components/assistant/conversation/co-edition/Resizable";
import { ConversationErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
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

  const handleCloseModal = useCallback(() => {
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
  }, [router]);

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
            <ConversationErrorDisplay error={conversationError} />
          ) : (
            <div className="h-full w-full">
              <AssistantDetails
                owner={owner}
                assistantId={detailViewContent || null}
                onClose={handleCloseModal}
              />

              <CoEditionProvider>
                <ConversationInnerLayout
                  conversationId={conversationId}
                  owner={owner}
                >
                  {children}
                </ConversationInnerLayout>
              </CoEditionProvider>
            </div>
          )}
        </AppLayout>
      </InputBarProvider>
    </RootLayout>
  );
}

interface ConversationInnerLayoutProps {
  children: React.ReactNode;
  conversationId: string | null;
  owner: LightWorkspaceType;
}

function ConversationInnerLayout({
  children,
  conversationId,
  owner,
}: ConversationInnerLayoutProps) {
  const { state } = useCoEditionContext();

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="w-full rounded-lg border"
    >
      <FileDropProvider>
        <GenerationContextProvider>
          <ResizablePanel
            minSize={20}
            defaultSize={50}
            className="overflow-y-visible border-none"
          >
            {children}
          </ResizablePanel>
        </GenerationContextProvider>
      </FileDropProvider>
      <ResizableHandle />
      {conversationId && state.isVisible && (
        <ResizablePanel minSize={20} defaultSize={50}>
          <CoEditionContainer owner={owner} conversationId={conversationId} />
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
