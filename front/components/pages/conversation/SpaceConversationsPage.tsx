import { SpaceAboutTab } from "@app/components/assistant/conversation/space/about/SpaceAboutTab";
import type { TodoOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosListScope";
import { SpaceConversationsTab } from "@app/components/assistant/conversation/space/conversations/SpaceConversationsTab";
import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { ProjectHeaderActions } from "@app/components/assistant/conversation/space/ProjectHeaderActions";
import { SpaceAlphaTab } from "@app/components/assistant/conversation/space/SpaceAlphaTab";
import { SpaceKnowledgeTab } from "@app/components/assistant/conversation/space/SpaceKnowledgeTab";
import { SpaceTodosTab } from "@app/components/assistant/conversation/space/SpaceTodosTab";

import { useSpaceConversations } from "@app/hooks/conversations";
import type { SpaceConversationListFilter } from "@app/hooks/conversations/useSpaceConversations";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useScopedUIPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  DEFAULT_SPACE_PROJECT_UI_PREFERENCES,
  type SpaceProjectTab,
  useSpaceProjectTabs,
} from "@app/hooks/useSpaceProjectTabs";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo, useSystemSpace } from "@app/lib/swr/spaces";
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
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ListCheckIcon,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

export function SpaceConversationsPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const clientType = useClientType();
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

  const { value: projectUIPreferences, setValue: setProjectUIPreferences } =
    useScopedUIPreferences({
      scope: "projectUI",
      resourceId: spaceId,
      defaultValue: DEFAULT_SPACE_PROJECT_UI_PREFERENCES,
    });
  const conversationFilter = projectUIPreferences.conversationsFilter;

  const {
    conversations,
    isConversationsLoading,
    mutateConversations,
    hasMore,
    isEmpty: isSpaceEmpty,
    loadMore,
    isLoadingMore,
  } = useSpaceConversations({
    workspaceId: owner.sId,
    spaceId: spaceId,
    filter: conversationFilter,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [_planLimitReached, setPlanLimitReached] = useState(false);
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);
  const canShowTodosTab = hasFeature("project_todo");
  const compactProjectTabs = useIsMobile();

  const { currentTab, handleTabChange } = useSpaceProjectTabs({
    spaceId,
    projectUIPreferences,
    setProjectUIPreferences,
    canShowTodosTab,
  });

  const handleConversationFilterChange = useCallback(
    (filter: SpaceConversationListFilter) => {
      setProjectUIPreferences({
        ...projectUIPreferences,
        conversationsFilter: filter,
      });
    },
    [projectUIPreferences, setProjectUIPreferences]
  );

  const handleTodoOwnerFilterChange = useCallback(
    (todosOwnerFilter: TodoOwnerFilter) => {
      setProjectUIPreferences({
        ...projectUIPreferences,
        todosOwnerFilter,
      });
    },
    [projectUIPreferences, setProjectUIPreferences]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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

  if (clientType === "extension") {
    return (
      <div className="flex h-full w-full flex-col">
        <SpaceConversationsTab
          owner={owner}
          user={user}
          conversations={conversations}
          isConversationsLoading={isConversationsLoading}
          hasMore={hasMore}
          loadMore={loadMore}
          isLoadingMore={isLoadingMore}
          spaceInfo={spaceInfo}
          isSpaceEmpty={isSpaceEmpty}
          conversationFilter={conversationFilter}
          onConversationFilterChange={handleConversationFilterChange}
          onSubmit={handleConversationCreation}
          onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs
        value={currentTab}
        onValueChange={(value) => handleTabChange(value as SpaceProjectTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-separator pl-14 pr-6 lg:px-6 dark:border-separator-night">
          <TabsList border={false}>
            <TabsTrigger
              value="conversations"
              label={compactProjectTabs ? undefined : "Conversations"}
              tooltip={compactProjectTabs ? "Conversations" : undefined}
              icon={ChatBubbleLeftRightIcon}
            />
            {canShowTodosTab && (
              <TabsTrigger
                value="todos"
                label={compactProjectTabs ? undefined : "To-dos"}
                tooltip={compactProjectTabs ? "To-dos" : undefined}
                icon={ListCheckIcon}
              />
            )}
            <TabsTrigger
              value="knowledge"
              label={compactProjectTabs ? undefined : "Knowledge"}
              tooltip={compactProjectTabs ? "Knowledge" : undefined}
              icon={BookOpenIcon}
            />
            <TabsTrigger
              value="settings"
              icon={Cog6ToothIcon}
              tooltip="Settings"
            />
            <TabsTrigger
              value="alpha"
              label={compactProjectTabs ? undefined : "Alpha"}
              tooltip={compactProjectTabs ? "Alpha" : undefined}
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
            isSpaceEmpty={isSpaceEmpty}
            conversationFilter={conversationFilter}
            onConversationFilterChange={handleConversationFilterChange}
            onSubmit={handleConversationCreation}
            onOpenMembersPanel={() => setIsInvitePanelOpen(true)}
          />
        </TabsContent>

        <TabsContent value="knowledge">
          <SpaceKnowledgeTab owner={owner} space={spaceInfo} />
        </TabsContent>

        {canShowTodosTab && (
          <TabsContent value="todos">
            <SpaceTodosTab
              owner={owner}
              spaceInfo={spaceInfo}
              todoOwnerFilter={projectUIPreferences.todosOwnerFilter}
              onTodoOwnerFilterChange={handleTodoOwnerFilterChange}
            />
          </TabsContent>
        )}

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
        mode="space-members"
        space={spaceInfo}
        currentProjectMembers={spaceInfo.members}
        onSuccess={() => mutateSpaceInfo()}
      />
    </div>
  );
}
