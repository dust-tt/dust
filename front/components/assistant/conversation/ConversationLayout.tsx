import {
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import {
  AgentActionsProvider,
  useAgentActionsContext,
} from "@app/components/assistant/conversation/actions/AgentActionsContext";
import { AgentActionsPanel } from "@app/components/assistant/conversation/actions/AgentActionsPanel";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import { CoEditionProvider } from "@app/components/assistant/conversation/co_edition/CoEditionProvider";
import { CONVERSATION_VIEW_SCROLL_LAYOUT } from "@app/components/assistant/conversation/constant";
import { InteractiveContentContainer } from "@app/components/assistant/conversation/content/InteractiveContentContainer";
import {
  InteractiveContentProvider,
  useInteractiveContentContext,
} from "@app/components/assistant/conversation/content/InteractiveContentContext";
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
import { WelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuide";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useConversation } from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ConversationError,
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
  isAdmin: boolean;
}

export default function ConversationLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: ConversationLayoutProps;
}) {
  const { baseUrl, owner, subscription, user, isAdmin } = pageProps;

  return (
    <ConversationsNavigationProvider
      initialConversationId={pageProps.conversationId}
    >
      <ActionValidationProvider owner={owner}>
        <ConversationLayoutContent
          baseUrl={baseUrl}
          owner={owner}
          subscription={subscription}
          user={user}
          isAdmin={isAdmin}
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
  isAdmin: boolean;
}

const ConversationLayoutContent = ({
  baseUrl,
  children,
  owner,
  subscription,
  user,
  isAdmin,
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
    () => hasFeature("co_edition"),
    [hasFeature]
  );

  const assistantSId = useMemo(() => {
    const sid = router.query.assistantDetails ?? [];
    if (sid && typeof sid === "string") {
      return sid;
    }
    return null;
  }, [router.query.assistantDetails]);

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
          <InteractiveContentProvider>
            <AgentActionsProvider>
              <ConversationInnerLayout
                activeConversationId={activeConversationId}
                baseUrl={baseUrl}
                conversation={conversation}
                conversationError={conversationError}
                owner={owner}
              >
                {children}
              </ConversationInnerLayout>
            </AgentActionsProvider>
          </InteractiveContentProvider>
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
  );
};

interface ConversationInnerLayoutProps {
  children: React.ReactNode;
  conversation: ConversationType | null;
  owner: LightWorkspaceType;
  baseUrl: string;
  conversationError: ConversationError | null;
  activeConversationId: string | null;
}

function ConversationInnerLayout({
  children,
  conversation,
  owner,
  baseUrl,
  conversationError,
  activeConversationId,
}: ConversationInnerLayoutProps) {
  const { isContentOpen, closeContent } = useInteractiveContentContext();
  const { isActionsOpen, closeActions, messageId, getActionState } =
    useAgentActionsContext();

  // Handle panel switching - close the other panel when a new one is opened
  const [prevContentOpen, setPrevContentOpen] = useState(isContentOpen);
  const [prevActionsOpen, setPrevActionsOpen] = useState(isActionsOpen);

  useEffect(() => {
    // If content panel is newly opened and actions panel is open, close actions
    if (isContentOpen && !prevContentOpen && isActionsOpen) {
      closeActions();
    }
    setPrevContentOpen(isContentOpen);
  }, [isContentOpen, prevContentOpen, isActionsOpen, closeActions]);

  useEffect(() => {
    // If actions panel is newly opened and content panel is open, close content
    if (isActionsOpen && !prevActionsOpen && isContentOpen) {
      closeContent();
    }
    setPrevActionsOpen(isActionsOpen);
  }, [isActionsOpen, prevActionsOpen, isContentOpen, closeContent]);

  const isPanelOpen = isContentOpen || isActionsOpen;

  return (
    <div className="flex h-full w-full flex-col">
      <ResizablePanelGroup
        direction="horizontal"
        className="flex h-full w-full flex-1"
      >
        <ResizablePanel defaultSize={100}>
          <div className="flex h-full flex-col">
            {activeConversationId && (
              <ConversationTitle owner={owner} baseUrl={baseUrl} />
            )}
            {conversationError ? (
              <ConversationErrorDisplay error={conversationError} />
            ) : (
              <FileDropProvider>
                <GenerationContextProvider>
                  <div
                    id={CONVERSATION_VIEW_SCROLL_LAYOUT}
                    className={cn(
                      "h-full overflow-y-auto scroll-smooth px-4",
                      // Hide conversation on mobile when any panel is opened.
                      isPanelOpen && "hidden md:block"
                    )}
                  >
                    {children}
                  </div>
                </GenerationContextProvider>
              </FileDropProvider>
            )}
          </div>
        </ResizablePanel>

        {/* Resizable Handle for Panels */}
        {isPanelOpen && <ResizableHandle className="hidden md:block" />}

        {/* Panel Container - either Interactive Content or Actions */}
        <ResizablePanel
          minSize={20}
          defaultSize={70}
          className={cn(
            !isPanelOpen && "hidden",
            // On mobile: overlay full screen with absolute positioning.
            "md:relative",
            isPanelOpen && "absolute inset-0 md:relative md:inset-auto"
          )}
        >
          {isContentOpen && (
            <InteractiveContentContainer
              conversation={conversation}
              isOpen={isContentOpen}
              owner={owner}
            />
          )}
          {isActionsOpen && messageId && (
            <AgentActionsPanel
              conversation={conversation}
              owner={owner}
              actionProgress={getActionState(messageId).actionProgress}
              isActing={getActionState(messageId).isActing}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
