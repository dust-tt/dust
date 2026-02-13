import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useRef, useState } from "react";

import { SpaceAboutTab } from "@app/components/assistant/conversation/space/about/SpaceAboutTab";
import { SpaceConversationsTab } from "@app/components/assistant/conversation/space/conversations/SpaceConversationsTab";
import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { ProjectHeaderActions } from "@app/components/assistant/conversation/space/ProjectHeaderActions";
import { SpaceAlphaTab } from "@app/components/assistant/conversation/space/SpaceAlphaTab";
import { SpaceKnowledgeTab } from "@app/components/assistant/conversation/space/SpaceKnowledgeTab";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceConversations } from "@app/lib/swr/conversations";
import { useSpaceInfo, useSystemSpace } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightConversationType } from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import { toMentionType } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

type SpaceTab = "conversations" | "knowledge" | "settings";

export function SpaceConversationsPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const router = useAppRouter();
  const spaceId = useActiveSpaceId();
  const sendNotification = useSendNotification();

  const { spaceInfo, isSpaceInfoLoading, isSpaceInfoError, mutateSpaceInfo } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: spaceId,
      includeAllMembers: true,
    });

  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const {
    conversations,
    isConversationsLoading,
    mutateConversations,
    hasMore,
    loadMore,
    isLoadingMore,
  } = useSpaceConversations({
    workspaceId: owner.sId,
    spaceId: spaceId,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);

  // Parse and validate the current tab from URL hash
  const getCurrentTabFromHash = useCallback((): SpaceTab => {
    if (typeof window === "undefined") {
      return "conversations";
    }
    const hash = window.location.hash.slice(1); // Remove the # prefix
    // Backward compatibility: treat "context" as "knowledge"
    if (hash === "context") {
      return "knowledge";
    }
    if (
      hash === "knowledge" ||
      hash === "settings" ||
      hash === "conversations"
    ) {
      return hash;
    }
    return "conversations";
  }, []);

  const [currentTab, setCurrentTab] = useState<SpaceTab>(getCurrentTabFromHash);

  // Sync current tab with URL hash
  React.useEffect(() => {
    const updateTabFromHash = () => {
      const newTab = getCurrentTabFromHash();
      setCurrentTab(newTab);

      // Ensure URL has a hash
      if (!window.location.hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#${newTab}`
        );
      }
    };

    // Update on mount
    updateTabFromHash();

    // Listen for hash changes
    window.addEventListener("hashchange", updateTabFromHash);
    return () => window.removeEventListener("hashchange", updateTabFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount and cleanup on unmount

  // Reset tab to conversations when navigating to a different project.
  const prevSpaceIdRef = useRef(spaceId);
  React.useEffect(() => {
    if (prevSpaceIdRef.current !== spaceId) {
      prevSpaceIdRef.current = spaceId;
      setCurrentTab("conversations");
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#conversations`
      );
    }
  }, [spaceId]);

  const handleTabChange = useCallback((tab: SpaceTab) => {
    // Use replaceState to avoid adding to browser history for each tab switch
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${tab}`
    );
    setCurrentTab(tab);
  }, []);

  const handleConversationCreation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[]
    ): Promise<Result<undefined, DustError>> => {
      if (isSubmitting) {
        return new Err({
          code: "internal_error",
          name: "AlreadySubmitting",
          message: "Already submitting",
        });
      }

      setIsSubmitting(true);

      const conversationRes = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
        },
        spaceId,
      });

      setIsSubmitting(false);

      if (conversationRes.isErr()) {
        if (conversationRes.error.type === "plan_limit_reached_error") {
          setPlanLimitReached(true);
        } else {
          sendNotification({
            title: conversationRes.error.title,
            description: conversationRes.error.message,
            type: "error",
          });
        }

        return new Err({
          code: "internal_error",
          name: conversationRes.error.title,
          message: conversationRes.error.message,
        });
      } else {
        // Navigate to the new conversation
        await router.push(
          getConversationRoute(owner.sId, conversationRes.value.sId),
          undefined,
          { shallow: true }
        );

        // Converting to LightConversationType as createConversationWithMessage returns a ConversationType.
        const lightConversation: LightConversationType = {
          ...conversationRes.value,
          content: removeNulls(
            conversationRes.value.content.map((v) => {
              const lastVersion = v[v.length - 1];
              if (isUserMessageType(lastVersion)) {
                return {
                  ...lastVersion,
                  // We don't really care about content fragments for light conversations in the UI.
                  contentFragments: [],
                };
              }
              if (isAgentMessageType(lastVersion)) {
                return getLightAgentMessageFromAgentMessage(lastVersion);
              }
              return null;
            })
          ),
        };

        // Update the conversations list (prepend new conversation to first page)
        await mutateConversations(
          (currentData) => {
            if (!currentData || currentData.length === 0) {
              return [
                {
                  conversations: [lightConversation],
                  hasMore: false,
                  lastValue: null,
                },
              ];
            }
            const [firstPage, ...restPages] = currentData;
            return [
              {
                ...firstPage,
                conversations: [lightConversation, ...firstPage.conversations],
              },
              ...restPages,
            ];
          },
          { revalidate: false }
        );

        return new Ok(undefined);
      }
    },
    [
      isSubmitting,
      owner,
      spaceId,
      setPlanLimitReached,
      sendNotification,
      router,
      mutateConversations,
      createConversationWithMessage,
    ]
  );

  // Show loading state while fetching space info
  if (isSpaceInfoLoading || isSystemSpaceLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Handle space not found or access denied
  if (isSpaceInfoError || !spaceInfo || !systemSpace) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Space not found</h2>
          <p className="text-muted-foreground">
            The space you&apos;re looking for doesn&apos;t exist or you
            don&apos;t have access to it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as SpaceTab)}
        className="flex min-h-0 flex-1 flex-col pt-3"
      >
        <div className="flex items-start justify-between border-b border-separator px-6 dark:border-separator-night">
          <TabsList border={false}>
            <TabsTrigger
              value="conversations"
              label="Conversations"
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger
              value="knowledge"
              label="Knowledge"
              icon={BookOpenIcon}
            />
            <TabsTrigger
              value="settings"
              label="Settings"
              icon={Cog6ToothIcon}
            />
            <TabsTrigger
              value="alpha"
              label="Alpha"
              icon={TestTubeIcon}
              variant="warning-secondary"
            />
          </TabsList>

          {spaceInfo.kind === "project" &&
            (spaceInfo.isMember || !spaceInfo.isRestricted) && (
              <ProjectHeaderActions
                isMember={spaceInfo.isMember}
                isRestricted={spaceInfo.isRestricted}
                members={spaceInfo.members}
                owner={owner}
                spaceId={spaceInfo.sId}
                spaceName={spaceInfo.name}
                user={user}
              />
            )}
        </div>

        <TabsContent value="conversations">
          <SpaceConversationsTab
            owner={owner}
            user={user}
            conversations={conversations}
            isConversationsLoading={isConversationsLoading}
            hasMore={hasMore}
            loadMore={loadMore}
            isLoadingMore={isLoadingMore}
            spaceInfo={spaceInfo}
            onSubmit={handleConversationCreation}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          />
        </TabsContent>

        <TabsContent value="knowledge">
          <SpaceKnowledgeTab owner={owner} space={spaceInfo} />
        </TabsContent>

        <TabsContent value="settings">
          <SpaceAboutTab
            key={spaceId}
            owner={owner}
            space={spaceInfo}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          />
        </TabsContent>

        <TabsContent value="alpha">
          <SpaceAlphaTab key={spaceId} />
        </TabsContent>
      </Tabs>
      <ManageUsersPanel
        isOpen={isInvitePanelOpen}
        setIsOpen={setIsInvitePanelOpen}
        owner={owner}
        space={spaceInfo}
        currentProjectMembers={spaceInfo.members}
        onSuccess={() => mutateSpaceInfo()}
      />
    </div>
  );
}
