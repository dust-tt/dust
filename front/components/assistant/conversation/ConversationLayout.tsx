import { ResizablePanel, ResizablePanelGroup } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  ConversationErrorDisplay,
  ErrorDisplay,
} from "@app/components/assistant/conversation/ConversationError";
import ConversationSidePanelContainer from "@app/components/assistant/conversation/ConversationSidePanelContainer";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  ConversationsNavigationProvider,
  useConversationsNavigation,
} from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarProvider } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetails } from "@app/components/assistant/details/AgentDetails";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import { WelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuide";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { ErrorBoundary } from "@app/components/error_boundary/ErrorBoundary";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { ONBOARDING_CONVERSATION_ENABLED } from "@app/lib/onboarding";
import { useConversation } from "@app/lib/swr/conversations";
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
}

export function ConversationLayout({
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
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");
  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");
  const { activeConversationId } = useConversationsNavigation();
  const { conversation, conversationError } = useConversation({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
  });

  const agentSId = useMemo(() => {
    const sid = router.query.agentDetails ?? [];
    if (isString(sid)) {
      return sid;
    }
    return null;
  }, [router.query.agentDetails]);

  const userSId = useMemo(() => {
    const sid = router.query.userDetails ?? [];
    if (isString(sid)) {
      return sid;
    }
    return null;
  }, [router.query.userDetails]);

  // Logic for the welcome tour guide. We display it if the welcome query param is set to true.
  const { startConversationRef, spaceMenuButtonRef, createAgentButtonRef } =
    useWelcomeTourGuide();

  const shouldDisplayWelcomeTourGuide = useMemo(() => {
    // Only show the welcome tour guide if onboarding chat is disabled.
    return (
      router.query.welcome === "true" &&
      !activeConversationId &&
      !ONBOARDING_CONVERSATION_ENABLED
    );
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
          navChildren={<AgentSidebarMenu owner={owner} />}
        >
          <AgentDetails
            owner={owner}
            user={user}
            agentId={agentSId}
            onClose={() => onOpenChangeAgentModal(false)}
          />

          <MemberDetails
            owner={owner}
            userId={userSId}
            onClose={() => onOpenChangeUserModal(false)}
          />

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
  return (
    <ErrorBoundary fallback={<UncaughtConversationErrorFallback />}>
      <div className="flex h-full w-full flex-col">
        <ResizablePanelGroup
          direction="horizontal"
          className="flex h-full w-full flex-1"
        >
          <ResizablePanel defaultSize={100}>
            <div className="flex h-full flex-col">
              {activeConversationId && !conversationError && (
                <ConversationTitle owner={owner} />
              )}
              {conversationError ? (
                <ConversationErrorDisplay error={conversationError} />
              ) : (
                <FileDropProvider>
                  <GenerationContextProvider>
                    {children}
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
