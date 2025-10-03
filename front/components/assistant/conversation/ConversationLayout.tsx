import { cn, ResizablePanel, ResizablePanelGroup } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { CoEditionProvider } from "@app/components/assistant/conversation/co_edition/CoEditionProvider";
import { CONVERSATION_VIEW_SCROLL_LAYOUT } from "@app/components/assistant/conversation/constant";
import {
  ConversationErrorDisplay,
  ErrorDisplay,
} from "@app/components/assistant/conversation/ConversationError";
import ConversationSidePanelContainer from "@app/components/assistant/conversation/ConversationSidePanelContainer";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  ConversationsNavigationProvider,
  useConversationsNavigation,
} from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AssistantDetails } from "@app/components/assistant/details/AssistantDetails";
import { WelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuide";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { ErrorBoundary } from "@app/components/error_boundary/ErrorBoundary";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useConversation } from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ConversationError,
  ConversationWithoutContentType,
  LightWorkspaceType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isString } from "@app/types";

export interface ConversationLayoutProps {
  baseUrl: string;
  conversationId: string | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  isAdmin: boolean;
  useVirtualizedConversation: boolean;
}

export default function ConversationLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: ConversationLayoutProps;
}) {
  const { owner, subscription, user, isAdmin } = pageProps;

  return (
    <ConversationsNavigationProvider
      initialConversationId={pageProps.conversationId}
    >
      <ConversationLayoutContent
        owner={owner}
        subscription={subscription}
        user={user}
        isAdmin={isAdmin}
      >
        {children}
      </ConversationLayoutContent>
    </ConversationsNavigationProvider>
  );
}

interface ConversationLayoutContentProps {
  children: React.ReactNode;
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  isAdmin: boolean;
}

const ConversationLayoutContent = ({
  children,
  owner,
  subscription,
  user,
  isAdmin,
}: ConversationLayoutContentProps) => {
  const router = useRouter();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("agentDetails");
  const { activeConversationId } = useConversationsNavigation();
  const { conversation, conversationError } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const hasCoEditionFeatureFlag = useMemo(
    () => hasFeature("co_edition"),
    [hasFeature]
  );

  const assistantSId = useMemo(() => {
    const sid = router.query.agentDetails ?? [];
    if (isString(sid)) {
      return sid;
    }
    return null;
  }, [router.query.agentDetails]);

  // Logic for the welcome tour guide. We display it if the welcome query param is set to true.
  const { startConversationRef, spaceMenuButtonRef, createAgentButtonRef } =
    useWelcomeTourGuide();

  const shouldDisplayWelcomeTourGuide = useMemo(() => {
    return router.query.welcome === "true" && !activeConversationId;
  }, [router.query.welcome, activeConversationId]);

  const onTourGuideEnd = () => {
    void router.push(router.asPath.replace("?welcome=true", ""), undefined, {
      shallow: true,
    });
    // Focus back on input bar
  };

  return (
    <BlockedActionsProvider owner={owner} conversation={conversation}>
      <InputBarProvider>
        <AppContentLayout
          hasTitle={!!activeConversationId}
          subscription={subscription}
          owner={owner}
          pageTitle={
            conversation?.title
              ? `Dust - ${conversation?.title}`
              : `Dust - New Conversation`
          }
          navChildren={<AssistantSidebarMenu owner={owner} />}
        >
          <AssistantDetails
            owner={owner}
            user={user}
            assistantId={assistantSId}
            onClose={() => onOpenChangeAssistantModal(false)}
          />

          <CoEditionProvider
            owner={owner}
            hasCoEditionFeatureFlag={hasCoEditionFeatureFlag}
          >
            <ConversationSidePanelProvider>
              <ConversationInnerLayout
                activeConversationId={activeConversationId}
                conversation={conversation}
                conversationError={conversationError}
                owner={owner}
              >
                {children}
              </ConversationInnerLayout>
            </ConversationSidePanelProvider>
          </CoEditionProvider>
          {shouldDisplayWelcomeTourGuide && (
            <WelcomeTourGuide
              owner={owner}
              user={user}
              isAdmin={isAdmin}
              startConversationRef={startConversationRef}
              spaceMenuButtonRef={spaceMenuButtonRef}
              createAgentButtonRef={createAgentButtonRef}
              onTourGuideEnd={onTourGuideEnd}
            />
          )}
        </AppContentLayout>
      </InputBarProvider>
    </BlockedActionsProvider>
  );
};

interface ConversationInnerLayoutProps {
  children: React.ReactNode;
  conversation: ConversationWithoutContentType | null;
  owner: LightWorkspaceType;
  conversationError: ConversationError | null;
  activeConversationId: string | null;
}

function UncaughtConversationErrorFallback() {
  return (
    <ErrorDisplay
      title="Something unexpected happened"
      message={[
        "Try refreshing the page to continue your conversation.",
        "Still having trouble? Reach out at support@dust.tt",
      ]}
    />
  );
}

function ConversationInnerLayout({
  children,
  conversation,
  owner,
  conversationError,
  activeConversationId,
}: ConversationInnerLayoutProps) {
  const { currentPanel } = useConversationSidePanelContext();

  return (
    <ErrorBoundary fallback={<UncaughtConversationErrorFallback />}>
      <div className="flex h-full w-full flex-col">
        <ResizablePanelGroup
          direction="horizontal"
          className="flex h-full w-full flex-1"
        >
          <ResizablePanel defaultSize={100}>
            <div className="flex h-full flex-col">
              {activeConversationId && <ConversationTitle owner={owner} />}
              {conversationError ? (
                <ConversationErrorDisplay error={conversationError} />
              ) : (
                <FileDropProvider>
                  <GenerationContextProvider>
                    <div
                      id={CONVERSATION_VIEW_SCROLL_LAYOUT}
                      className={cn(
                        "dd-privacy-mask h-full overflow-y-auto overscroll-y-none scroll-smooth px-4",
                        // Hide conversation on mobile when any panel is opened.
                        currentPanel && "hidden md:block"
                      )}
                    >
                      {children}
                    </div>
                  </GenerationContextProvider>
                </FileDropProvider>
              )}
            </div>
          </ResizablePanel>

          <ConversationSidePanelContainer
            owner={owner}
            conversation={conversation}
          />
        </ResizablePanelGroup>
      </div>
    </ErrorBoundary>
  );
}
