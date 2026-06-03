import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { PodConversationsTab } from "@app/components/pod/conversation/PodConversationsTab";
import { PodFilesTab } from "@app/components/pod/files/PodFilesTab";
import { PodSettingsTab } from "@app/components/pod/settings/PodSettingsTab";
import { PodTasksTab } from "@app/components/pod/tasks/PodTasksTab";
import {
  type PodConversationListFilter,
  usePodConversations,
} from "@app/hooks/conversations/usePodConversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { PodUiScopedPreferences } from "@app/hooks/useScopedUIPreferences";
import type { PodTab } from "@app/hooks/useSpaceProjectTabs";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import type { useSpaceInfo } from "@app/lib/swr/spaces";
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
import { TabsContent } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

type PodInfo = NonNullable<ReturnType<typeof useSpaceInfo>["spaceInfo"]>;

interface PodPageContentProps {
  podInfo: PodInfo;
  onTabChange: (tab: PodTab) => void;
  podUiPreferences: PodUiScopedPreferences;
  setPodUiPreferences: (value: PodUiScopedPreferences) => void;
  mutatePodInfo: () => Promise<unknown>;
}

export function PodPageContent({
  podInfo,
  onTabChange,
  podUiPreferences,
  setPodUiPreferences,
  mutatePodInfo,
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
          richMentions: mentions,
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

      const lightConversation: LightConversationType = {
        ...conversationRes.value,
        content: removeNulls(
          conversationRes.value.content.map((v) => {
            const lastVersion = v[v.length - 1];
            if (isUserMessageType(lastVersion)) {
              return {
                ...lastVersion,
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
    },
    [
      isSubmitting,
      owner,
      podInfo.sId,
      sendNotification,
      router,
      mutateConversations,
      createConversationWithMessage,
    ]
  );

  return (
    <>
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
          onNavigateToTasks={() => onTabChange("tasks")}
        />
      </TabsContent>
      <TabsContent value="tasks">
        <PodTasksTab
          owner={owner}
          podInfo={podInfo}
          taskOwnerFilter={podUiPreferences.tasksOwnerFilter}
          onTaskOwnerFilterChange={handleTaskOwnerFilterChange}
        />
      </TabsContent>
      <TabsContent value="files">
        <PodFilesTab owner={owner} pod={podInfo} />
      </TabsContent>
      <TabsContent value="settings">
        <PodSettingsTab
          key={podInfo.sId}
          owner={owner}
          pod={podInfo}
          onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
        />
      </TabsContent>
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
