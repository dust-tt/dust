import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import { CoEditionContainer } from "@app/components/assistant/conversation/co_edition/CoEditionContainer";
import { CoEditionProvider } from "@app/components/assistant/conversation/co_edition/CoEditionProvider";
import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
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
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ConversationType,
  LightWorkspaceType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";

export interface ConversationLayoutProps {
  baseUrl: string;
  conversationId: string | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}

export default function ConversationLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: ConversationLayoutProps;
}) {
  const { baseUrl, owner, subscription, user } = pageProps;

  return (
    <ConversationsNavigationProvider
      initialConversationId={pageProps.conversationId}
    >
      <ActionValidationProvider>
        <ConversationLayoutContent
          baseUrl={baseUrl}
          owner={owner}
          subscription={subscription}
          user={user}
        >
          {children}
        </ConversationLayoutContent>
      </ActionValidationProvider>
    </ConversationsNavigationProvider>
  );
}

interface ConversationLayoutContentProps {
  baseUrl: string;
  children: React.ReactNode;
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}

const ConversationLayoutContent = ({
  baseUrl,
  children,
  owner,
  subscription,
  user,
}: ConversationLayoutContentProps) => {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("assistantDetails");
  const { activeConversationId } = useConversationsNavigation();
  const { conversation, conversationError } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const hasCoEditionFeatureFlag = useMemo(
    () => hasFeature("mcp_actions") && hasFeature("co_edition"),
    [hasFeature]
  );

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
        isConversationView
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
            <CoEditionProvider
              owner={owner}
              hasCoEditionFeatureFlag={hasCoEditionFeatureFlag}
            >
              <ConversationInnerLayout
                conversation={conversation}
                owner={owner}
                user={user}
              >
                {children}
              </ConversationInnerLayout>
            </CoEditionProvider>
          </>
        )}
      </AppLayout>
    </InputBarProvider>
  );
};

interface ConversationInnerLayoutProps {
  children: React.ReactNode;
  conversation: ConversationType | null;
  owner: LightWorkspaceType;
  user: UserType;
}

function ConversationInnerLayout({
  children,
  conversation,
  owner,
  user,
}: ConversationInnerLayoutProps) {
  const { isCoEditionOpen } = useCoEditionContext();

  return (
    <div className="flex h-full w-full flex-col">
      <ResizablePanelGroup
        direction="horizontal"
        className="flex h-full w-full flex-1"
      >
        <ResizablePanel defaultSize={100}>
          <FileDropProvider>
            <GenerationContextProvider>
              <div className="h-full overflow-y-auto px-4 sm:px-8">
                {children}
              </div>
            </GenerationContextProvider>
          </FileDropProvider>
        </ResizablePanel>
        {isCoEditionOpen && <ResizableHandle />}
        <ResizablePanel
          minSize={20}
          defaultSize={50}
          className={isCoEditionOpen ? "" : "hidden"}
        >
          {isCoEditionOpen && (
            <CoEditionContainer
              conversation={conversation}
              owner={owner}
              user={user}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
