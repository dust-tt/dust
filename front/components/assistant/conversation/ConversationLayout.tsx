import { ResizablePanel, ResizablePanelGroup } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  ConversationErrorDisplay,
  ErrorDisplay,
} from "@app/components/assistant/conversation/ConversationError";
import ConversationSidePanelContainer from "@app/components/assistant/conversation/ConversationSidePanelContainer";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationTitle } from "@app/components/assistant/conversation/ConversationTitle";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AgentDetails } from "@app/components/assistant/details/AgentDetails";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import { WelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuide";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { ErrorBoundary } from "@app/components/error_boundary/ErrorBoundary";
import { useAppLayoutConfig } from "@app/components/sparkle/AppLayoutContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useURLSheet } from "@app/hooks/useURLSheet";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { ONBOARDING_CONVERSATION_ENABLED } from "@app/lib/onboarding";
import { useAppRouter } from "@app/lib/platform";
import { useConversation } from "@app/lib/swr/conversations";
import type {
  ConversationError,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

export function ConversationLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: AuthContextValue;
}) {
  const { workspace, user, isAdmin } = pageProps;

  return (
    <ConversationLayoutContent owner={workspace} user={user} isAdmin={isAdmin}>
      {children}
    </ConversationLayoutContent>
  );
}

interface ConversationLayoutContentProps {
  children: React.ReactNode;
  owner: LightWorkspaceType;
  user: AuthContextValue["user"];
  isAdmin: boolean;
}

const ConversationLayoutContent = ({
  children,
  owner,
  user,
  isAdmin,
}: ConversationLayoutContentProps) => {
  const router = useAppRouter();
  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");
  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");
  const activeConversationId = useActiveConversationId();
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

  useAppLayoutConfig(
    () => ({
      hasTitle: !!activeConversationId,
      pageTitle: conversation?.title
        ? `Dust - ${conversation.title}`
        : "Dust - New Conversation",
      navChildren: <AgentSidebarMenu owner={owner} />,
    }),
    [activeConversationId, conversation?.title, owner]
  );

  return (
    <BlockedActionsProvider owner={owner} conversation={conversation}>
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
    </BlockedActionsProvider>
  );
};

interface ConversationInnerLayoutProps {
  children: React.ReactNode;
  conversation?: ConversationWithoutContentType;
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
