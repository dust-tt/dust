import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";

import { SpaceAboutTab } from "@app/components/assistant/conversation/space/about/SpaceAboutTab";
import { SpaceConversationsTab } from "@app/components/assistant/conversation/space/conversations/SpaceConversationsTab";
import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { SpaceContextTab } from "@app/components/assistant/conversation/space/SpaceContextTab";
import { LeaveProjectButton } from "@app/components/spaces/LeaveProjectButton";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceConversations } from "@app/lib/swr/conversations";
import {
  useSpaceInfo,
  useSystemSpace,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { ContentFragmentsType, Result, RichMention } from "@app/types";
import { Err, Ok, toMentionType } from "@app/types";

type SpaceTab = "conversations" | "context" | "settings";

export function SpaceConversationsPage() {
  const owner = useWorkspace();
  const { subscription, user, isAdmin } = useAuth();
  const router = useAppRouter();
  const spaceId = useActiveSpaceId();
  const sendNotification = useSendNotification();

  const { spaceInfo, isSpaceInfoLoading, isSpaceInfoError, mutateSpaceInfo } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: spaceId,
    });

  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });

  const doUpdateSpace = useUpdateSpace({ owner });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const { conversations, isConversationsLoading, mutateConversations } =
    useSpaceConversations({
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
    if (hash === "context" || hash === "settings" || hash === "conversations") {
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

  const handleTabChange = useCallback((tab: SpaceTab) => {
    // Use replaceState to avoid adding to browser history for each tab switch
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${tab}`
    );
    setCurrentTab(tab);
  }, []);

  const handleManageMembers = useCallback(
    async ({ members, editors }: { members: string[]; editors: string[] }) => {
      if (editors.length === 0 || !spaceInfo) {
        setIsInvitePanelOpen(false);
        return;
      }

      // Call the API to update the space with new members
      const updatedSpace = await doUpdateSpace(spaceInfo, {
        isRestricted: spaceInfo.isRestricted,
        memberIds: members,
        editorIds: editors,
        managementMode: "manual",
        name: spaceInfo.name,
      });

      if (updatedSpace) {
        // Trigger a refresh of the space info to get updated members list
        await mutateSpaceInfo();
      }
    },
    [spaceInfo, doUpdateSpace, mutateSpaceInfo]
  );

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

        // Update the conversations list
        await mutateConversations(
          (currentData) => {
            return {
              ...currentData,
              conversations: [
                ...(currentData?.conversations ?? []),
                conversationRes.value,
              ],
            };
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

  // Extract permissions from spaceInfo (now includes canRead and canWrite from API)
  const canReadInSpace = spaceInfo.canRead ?? spaceInfo.isMember;
  const canWriteInSpace = spaceInfo.canWrite ?? false;

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as SpaceTab)}
        className="flex min-h-0 flex-1 flex-col pt-3"
      >
        <div className="flex items-center justify-between px-6">
          <TabsList>
            <TabsTrigger
              value="conversations"
              label="Conversations"
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger value="context" label="Context" icon={BookOpenIcon} />
            <TabsTrigger
              value="settings"
              label="Settings"
              icon={Cog6ToothIcon}
            />
          </TabsList>

          {spaceInfo.kind === "project" && spaceInfo.isMember && (
            <LeaveProjectButton
              owner={owner}
              spaceId={spaceInfo.sId}
              spaceName={spaceInfo.name}
              isRestricted={spaceInfo.isRestricted}
              userName={user.fullName}
            />
          )}
        </div>

        <TabsContent value="conversations">
          <SpaceConversationsTab
            owner={owner}
            user={user}
            conversations={conversations}
            isConversationsLoading={isConversationsLoading}
            spaceInfo={spaceInfo}
            onSubmit={handleConversationCreation}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          />
        </TabsContent>

        <TabsContent value="context">
          <SpaceContextTab
            owner={owner}
            space={spaceInfo}
            systemSpace={systemSpace}
            plan={subscription.plan}
            isAdmin={isAdmin}
            canReadInSpace={canReadInSpace}
            canWriteInSpace={canWriteInSpace}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SpaceAboutTab
            key={spaceId}
            owner={owner}
            space={spaceInfo}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          />
        </TabsContent>
      </Tabs>
      <ManageUsersPanel
        isOpen={isInvitePanelOpen}
        owner={owner}
        space={spaceInfo}
        currentProjectMembers={spaceInfo.members}
        onClose={() => setIsInvitePanelOpen(false)}
        onSave={handleManageMembers}
      />
    </div>
  );
}
