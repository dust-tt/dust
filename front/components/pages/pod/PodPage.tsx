import { SpaceAboutTab } from "@app/components/assistant/conversation/space/about/SpaceAboutTab";
import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { SpaceTasksTab } from "@app/components/assistant/conversation/space/SpaceTasksTab";
import { PodConversationsTab } from "@app/components/pod/conversation/PodConversationsTab";
import { PodFilesTab } from "@app/components/pod/files/PodFilesTab";
import { PodHeaderActions } from "@app/components/pod/PodHeaderActions";
import {
  type PodConversationListFilter,
  usePodConversations,
} from "@app/hooks/conversations/usePodConversations";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_POD_UI_PREFERENCES,
  type PodTab,
  usePodTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
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
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  Cog6ToothIcon,
  FolderIcon,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

export function PodPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const clientType = useClientType();
  const router = useAppRouter();
  const podId = useActivePodId();
  const sendNotification = useSendNotification();

  const {
    spaceInfo: podInfo,
    isSpaceInfoLoading: isPodsInfoLoading,
    isSpaceInfoError: podInfoError,
    mutateSpaceInfo: mutatePodInfo,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
    includeAllMembers: true,
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const { value: podUiPreferences, setValue: setPodUiPreferences } =
    useScopedPodUiPreferences({
      scope: "podUi",
      resourceId: podId,
      defaultValue: DEFAULT_POD_UI_PREFERENCES,
    });
  const isSingleMemberPod = !!podInfo && podInfo.members.length === 1;
  const conversationFilter: PodConversationListFilter = isSingleMemberPod
    ? "all"
    : podUiPreferences.conversationsFilter;

  const {
    conversations,
    isConversationsLoading,
    mutateConversations,
    hasMore,
    isEmpty: isPodEmpty,
    loadMore,
    isLoadingMore,
  } = usePodConversations({
    workspaceId: owner.sId,
    podId: podId,
    filter: conversationFilter,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);
  const compactPodTabs = useIsMobile();

  const { currentTab, handleTabChange } = usePodTabs({
    podId,
    podUiPreferences,
    setPodUiPreferences,
  });

  const handleConversationFilterChange = (
    filter: PodConversationListFilter
  ) => {
    setPodUiPreferences({
      ...podUiPreferences,
      conversationsFilter: filter,
    });
  };

  const handleTaskOwnerFilterChange = (tasksOwnerFilter: TaskOwnerFilter) => {
    setPodUiPreferences({
      ...podUiPreferences,
      tasksOwnerFilter,
    });
  };

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
        spaceId: podId,
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
                  isEmpty: false,
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
      podId,
      sendNotification,
      router,
      mutateConversations,
      createConversationWithMessage,
    ]
  );

  // Show loading state while fetching space info
  if (isPodsInfoLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Handle pod not found or access denied
  if (podInfoError || !podInfo) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Pod not found</h2>
          <p className="text-muted-foreground">
            The Pod you&apos;re looking for doesn&apos;t exist or you don&apos;t
            have access to it.
          </p>
        </div>
      </div>
    );
  }

  if (clientType === "extension") {
    return (
      <div className="flex h-full w-full flex-col">
        <PodConversationsTab
          owner={owner}
          user={user}
          conversations={conversations}
          isConversationsLoading={isConversationsLoading}
          hasMore={hasMore}
          loadMore={loadMore}
          isLoadingMore={isLoadingMore}
          podInfo={podInfo}
          isPodEmpty={isPodEmpty}
          conversationFilter={conversationFilter}
          onConversationFilterChange={handleConversationFilterChange}
          onSubmit={handleConversationCreation}
          onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          onNavigateToTasks={() => handleTabChange("tasks")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as PodTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-separator pl-14 pr-6 lg:px-6 dark:border-separator-night">
          <TabsList border={false}>
            <TabsTrigger
              value="conversations"
              label={compactPodTabs ? undefined : "Conversations"}
              tooltip={compactPodTabs ? "Conversations" : undefined}
              icon={ChatBubbleLeftRightIcon}
            />
            <TabsTrigger
              value="tasks"
              label={compactPodTabs ? undefined : "Tasks"}
              tooltip={compactPodTabs ? "Tasks" : undefined}
              icon={CheckIcon}
            />
            <TabsTrigger
              value="files"
              label={compactPodTabs ? undefined : "Files"}
              tooltip={compactPodTabs ? "Files" : undefined}
              icon={FolderIcon}
            />
            <TabsTrigger
              value="settings"
              label={compactPodTabs ? undefined : "Settings"}
              tooltip={compactPodTabs ? "Settings" : undefined}
              icon={Cog6ToothIcon}
            />
          </TabsList>

          {podInfo.kind === "project" &&
            (podInfo.isMember || !podInfo.isRestricted) && (
              <PodHeaderActions
                isMember={podInfo.isMember}
                isRestricted={podInfo.isRestricted}
                members={podInfo.members}
                owner={owner}
                podId={podInfo.sId}
                podName={podInfo.name}
                user={user}
              />
            )}
        </div>

        <TabsContent value="conversations">
          <PodConversationsTab
            owner={owner}
            user={user}
            conversations={conversations}
            isConversationsLoading={isConversationsLoading}
            hasMore={hasMore}
            loadMore={loadMore}
            isLoadingMore={isLoadingMore}
            podInfo={podInfo}
            isPodEmpty={isPodEmpty}
            conversationFilter={conversationFilter}
            onConversationFilterChange={handleConversationFilterChange}
            onSubmit={handleConversationCreation}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
            onNavigateToTasks={() => handleTabChange("tasks")}
          />
        </TabsContent>

        <TabsContent value="files">
          <PodFilesTab owner={owner} pod={podInfo} />
        </TabsContent>

        <TabsContent value="tasks">
          <SpaceTasksTab
            owner={owner}
            spaceInfo={podInfo}
            taskOwnerFilter={podUiPreferences.tasksOwnerFilter}
            onTaskOwnerFilterChange={handleTaskOwnerFilterChange}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SpaceAboutTab
            key={podId}
            owner={owner}
            space={podInfo}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          />
        </TabsContent>
      </Tabs>
      <ManageUsersPanel
        isOpen={isInvitePanelOpen}
        setIsOpen={setIsInvitePanelOpen}
        owner={owner}
        mode="space-members"
        space={podInfo}
        currentProjectMembers={podInfo.members}
        onSuccess={() => mutatePodInfo()}
      />
    </div>
  );
}
