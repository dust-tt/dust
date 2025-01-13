import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import React from "react";

import RootLayout from "@app/components/app/RootLayout";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
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
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useConversation } from "@app/lib/swr/conversations";

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
  const { baseUrl, owner, subscription } = pageProps;

  return (
    <RootLayout>
      <ConversationsNavigationProvider
        initialConversationId={pageProps.conversationId}
      >
        <ConversationLayoutContent
          owner={owner}
          subscription={subscription}
          baseUrl={baseUrl}
        >
          {children}
        </ConversationLayoutContent>
      </ConversationsNavigationProvider>
    </RootLayout>
  );
}

const ConversationLayoutContent = ({
  owner,
  subscription,
  baseUrl,
  children,
}: any) => {
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("assistantDetails");
  const { assistantIdForDetails } = useConversationsNavigation();
  const { activeConversationId } = useConversationsNavigation();
  const { conversation, conversationError } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

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
              assistantId={assistantIdForDetails}
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
