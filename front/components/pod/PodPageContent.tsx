import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { PodConnectedDataTab } from "@app/components/pod/connected_data/PodConnectedDataTab";
import { PodConversationsTab } from "@app/components/pod/conversation/PodConversationsTab";
import { PodFilesTab } from "@app/components/pod/files/PodFilesTab";
import { GoalPodOverview } from "@app/components/pod/GoalPodOverview";
import { PodFileTabContent } from "@app/components/pod/PodFileTabContent";
import { PodSettingsTab } from "@app/components/pod/settings/PodSettingsTab";
import { PodTasksTab } from "@app/components/pod/tasks/PodTasksTab";
import type { PodConversationListFilter } from "@app/hooks/conversations/usePodConversations";
import { usePodConversations } from "@app/hooks/conversations/usePodConversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { PodUiScopedPreferences } from "@app/hooks/useScopedUIPreferences";
import type { PodTab } from "@app/hooks/useSpaceProjectTabs";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import type { useSpaceInfo } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { RichMention } from "@app/types/assistant/mentions";
import { toMentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { PodFileTab } from "@app/types/pod_file_tab";
import { makePodFileTabValue } from "@app/types/pod_file_tab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { NavTabPillContent } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

type PodInfo = NonNullable<ReturnType<typeof useSpaceInfo>["spaceInfo"]>;

interface PodPageContentProps {
  podInfo: PodInfo;
  isGoalPod?: boolean;
  onTabChange: (tab: PodTab) => void;
  podUiPreferences: PodUiScopedPreferences;
  setPodUiPreferences: (value: PodUiScopedPreferences) => void;
  mutatePodInfo: () => Promise<unknown>;
  clientSideMCPServerIds?: string[];
  fileTabs?: PodFileTab[];
}

export function PodPageContent({
  podInfo,
  isGoalPod = false,
  onTabChange,
  podUiPreferences,
  setPodUiPreferences,
  mutatePodInfo,
  clientSideMCPServerIds,
  fileTabs = [],
}: PodPageContentProps) {
  const owner = useWorkspace();
  const { user } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const isSingleMemberPod = podInfo.members.length === 1;
  const conversationFilter: PodConversationListFilter = isSingleMemberPod
    ? "all"
    : podUiPreferences.conversationsFilter;
  const hideTriggeredConversations =
    podUiPreferences.hideTriggeredConversations;

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
    podId: podInfo.sId,
    filter: conversationFilter,
    excludeTriggered: hideTriggeredConversations,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);

  const handleConversationFilterChange = (
    filter: PodConversationListFilter
  ) => {
    setPodUiPreferences({
      ...podUiPreferences,
      conversationsFilter: filter,
    });
  };

  const handleHideTriggeredConversationsChange = (hideTriggered: boolean) => {
    setPodUiPreferences({
      ...podUiPreferences,
      hideTriggeredConversations: hideTriggered,
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
      selectedMCPServerViewIds?: string[],
      _selectedSpaceIds?: string[],
      modelSelection?: ModelSelectionType
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
          clientSideMCPServerIds,
          selectedMCPServerViewIds,
          richMentions: mentions,
          modelSelection,
        },
        spaceId: podInfo.sId,
        // Navigate as soon as the conversation exists; the first message is posted
        // in the background by useCreateConversationWithMessage.
        deferMessage: true,
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
      }

      await router.push(
        getConversationRoute(owner.sId, conversationRes.value.sId),
        undefined,
        { shallow: true }
      );

      void mutateConversations();

      return new Ok(undefined);
    },
    [
      isSubmitting,
      owner,
      podInfo.sId,
      sendNotification,
      router,
      mutateConversations,
      createConversationWithMessage,
      clientSideMCPServerIds,
    ]
  );

  return (
    <>
      <NavTabPillContent value="conversations">
        {isGoalPod && podInfo.isEditor ? (
          <GoalPodOverview owner={owner} user={user} podId={podInfo.sId} />
        ) : (
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
            hideTriggeredConversations={hideTriggeredConversations}
            onHideTriggeredConversationsChange={
              handleHideTriggeredConversationsChange
            }
            onSubmit={handleConversationCreation}
            onNavigateToTasks={() => onTabChange("tasks")}
          />
        )}
      </NavTabPillContent>
      <NavTabPillContent value="tasks">
        <PodTasksTab
          owner={owner}
          podInfo={podInfo}
          taskOwnerFilter={podUiPreferences.tasksOwnerFilter}
          onTaskOwnerFilterChange={handleTaskOwnerFilterChange}
        />
      </NavTabPillContent>
      <NavTabPillContent value="files">
        <PodFilesTab owner={owner} pod={podInfo} />
      </NavTabPillContent>
      {podInfo.isAdminControlled && (
        <NavTabPillContent value="connected_data">
          <PodConnectedDataTab owner={owner} pod={podInfo} />
        </NavTabPillContent>
      )}
      {fileTabs.map((tab) => (
        <NavTabPillContent key={tab.path} value={makePodFileTabValue(tab.path)}>
          <PodFileTabContent owner={owner} podInfo={podInfo} tab={tab} />
        </NavTabPillContent>
      ))}
      <NavTabPillContent value="settings">
        <PodSettingsTab
          key={podInfo.sId}
          owner={owner}
          pod={podInfo}
          onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
        />
      </NavTabPillContent>
      <ManageUsersPanel
        isOpen={isInvitePanelOpen}
        setIsOpen={setIsInvitePanelOpen}
        owner={owner}
        mode="space-members"
        space={podInfo}
        currentProjectMembers={podInfo.members}
        onSuccess={() => {
          mutatePodInfo();
        }}
      />
    </>
  );
}
