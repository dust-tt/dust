import { useRouter } from "next/router";
import React, { useEffect, useMemo } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import { ConversationErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
import {
  ConversationsNavigationProvider,
  useConversationsNavigation,
} from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { useActiveConversationIdSync } from "@app/hooks/useActiveConversationIdSync";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useChatsActions } from "@app/lib/stores/ChatStoreProvider";
import { useConversation } from "@app/lib/swr/conversations";
import type { SubscriptionType, WorkspaceType } from "@app/types";

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
  useActiveConversationIdSync();
  const { baseUrl, owner, subscription } = pageProps;
  const { setInitialConversationId } = useChatsActions();

  useEffect(() => {
    setInitialConversationId(pageProps.conversationId);
  }, [pageProps.conversationId, setInitialConversationId]);

  return (
    <ConversationsNavigationProvider
      initialConversationId={pageProps.conversationId}
    >
      <ActionValidationProvider>
        <ConversationLayoutContent
          owner={owner}
          subscription={subscription}
          baseUrl={baseUrl}
        >
          {children}
        </ConversationLayoutContent>
      </ActionValidationProvider>
    </ConversationsNavigationProvider>
  );
}

const ConversationLayoutContent = ({
  children,
  owner,
  subscription,
  baseUrl,
}: any) => {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("assistantDetails");
  const { activeConversationId } = useConversationsNavigation();
  const { conversation, conversationError } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const assistantSId = useMemo(() => {
    const sid = router.query.assistantDetails ?? [];
    if (sid && typeof sid === "string") {
      return sid;
    }
    return null;
  }, [router.query.assistantDetails]);

  return (
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
          activeConversationId && (
            <ConversationTitle owner={owner} baseUrl={baseUrl} />
          )
        }
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        {conversationError ? (
          <ConversationErrorDisplay error={conversationError} />
        ) : (
          <>
            <AssistantDetails
              owner={owner}
              assistantId={assistantSId}
              onClose={() => onOpenChangeAssistantModal(false)}
            />
            <FileDropProvider>
              <GenerationContextProvider>{children}</GenerationContextProvider>
            </FileDropProvider>
          </>
        )}
      </AppLayout>
    </InputBarProvider>
  );
};
