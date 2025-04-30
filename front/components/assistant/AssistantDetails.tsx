import {
  Avatar,
  BarChartIcon,
  Button,
  CardGrid,
  ChatBubbleLeftRightIcon,
  ChatBubbleThoughtIcon,
  Chip,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HandThumbDownIcon,
  HandThumbUpIcon,
  InformationCircleIcon,
  LockIcon,
  Page,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  UserGroupIcon,
  ValueCard,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useCallback, useState } from "react";

import { AssistantDetailsButtonBar } from "@app/components/assistant/AssistantDetailsButtonBar";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/AssistantKnowledgeSection";
import { AssistantToolsSection } from "@app/components/assistant/details/AssistantToolsSection";
import { AssistantUsageSection } from "@app/components/assistant/details/AssistantUsageSection";
import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";
import { RestoreAssistantDialog } from "@app/components/assistant/RestoreAssistantDialog";
import { FeedbacksSection } from "@app/components/assistant_builder/FeedbacksSection";
import { SharingDropdown } from "@app/components/assistant_builder/Sharing";
import {
  useAgentAnalytics,
  useAgentConfiguration,
  useUpdateAgentScope,
} from "@app/lib/swr/assistants";
import { useEditors, useUpdateEditors } from "@app/lib/swr/editors";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { isBuilder, removeNulls } from "@app/types";

import { MembersList } from "../members/MembersList";

const PERIODS = [
  { value: 7, label: "Last 7 days" },
  { value: 15, label: "Last 15 days" },
  { value: 30, label: "Last 30 days" },
];

type AssistantDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  assistantId: string | null;
  user: UserType;
};

function AssistantDetailsInfo({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  return (
    <>
      {agentConfiguration.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agentConfiguration.tags.map((tag) => (
            <Chip key={tag.sId} color="golden" label={tag.name} />
          ))}
        </div>
      )}

      <div className="text-sm text-foreground dark:text-foreground-night">
        {agentConfiguration?.description}
      </div>
      {agentConfiguration && (
        <AssistantUsageSection
          agentConfiguration={agentConfiguration}
          owner={owner}
        />
      )}
      <Page.Separator />

      <AssistantKnowledgeSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />

      {agentConfiguration?.instructions ? (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <ReadOnlyTextArea content={agentConfiguration.instructions} />
        </div>
      ) : (
        "This agent has no instructions."
      )}
      <AssistantToolsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />
    </>
  );
}

function AssistantDetailsPerformance({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  const [period, setPeriod] = useState(30);
  const { agentAnalytics, isAgentAnayticsLoading } = useAgentAnalytics({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
    period,
  });

  return (
    <>
      <div className="flex flex-row justify-between gap-3">
        <Page.H variant="h5">Analytics</Page.H>
        <div className="self-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={PERIODS.find((p) => p.value === period)?.label}
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {PERIODS.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  label={p.label}
                  onClick={() => {
                    setPeriod(p.value);
                  }}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isAgentAnayticsLoading ? (
        <div className="w-full p-6">
          <Spinner variant="dark" />
        </div>
      ) : (
        <CardGrid>
          <ValueCard
            title="Active Users"
            content={
              <div className="heading-lg text-foreground dark:text-foreground-night">
                <div className="heading-lg flex flex-col gap-1">
                  {agentAnalytics?.users ? (
                    <>
                      <div className="truncate text-foreground dark:text-foreground-night">
                        {agentAnalytics.users.length}
                      </div>

                      <Avatar.Stack size="md" hasMagnifier={false}>
                        {removeNulls(
                          agentAnalytics.users.map((top) => top.user)
                        )
                          .slice(0, 5)
                          .map((user) => (
                            <Tooltip
                              key={user.id}
                              trigger={
                                <Avatar
                                  size="sm"
                                  name={user.fullName}
                                  visual={user.image}
                                />
                              }
                              label={user.fullName}
                            />
                          ))}
                      </Avatar.Stack>
                    </>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
            }
            className="h-32"
          />

          <ValueCard
            title="Reactions"
            content={
              <div className="heading-lg flex flex-row gap-2">
                {agentConfiguration.scope !== "global" &&
                agentAnalytics?.feedbacks ? (
                  <>
                    <div className="flex flex-row items-center">
                      <div>
                        <HandThumbUpIcon className="h-6 w-6 pr-2 text-muted-foreground dark:text-muted-foreground-night" />
                      </div>
                      <div>{agentAnalytics.feedbacks.positiveFeedbacks}</div>
                    </div>
                    <div className="flex flex-row items-center">
                      <div>
                        <HandThumbDownIcon className="h-6 w-6 pr-2 text-muted-foreground dark:text-muted-foreground-night" />
                      </div>
                      <div>{agentAnalytics.feedbacks.negativeFeedbacks}</div>
                    </div>
                  </>
                ) : (
                  "-"
                )}
              </div>
            }
            className="h-32"
          />
          <ValueCard
            title="Conversations"
            content={
              <div className="heading-lg flex flex-row gap-2">
                <div className="flex flex-row items-center">
                  <div>
                    <ChatBubbleLeftRightIcon className="h-6 w-6 pr-2 text-muted-foreground dark:text-muted-foreground-night" />
                  </div>
                  <div>
                    {agentAnalytics?.mentions
                      ? `${agentAnalytics.mentions.conversationCount}`
                      : "-"}
                  </div>
                </div>
              </div>
            }
            className="h-32"
          />
          <ValueCard
            title="Messages"
            content={
              <div className="heading-lg flex flex-row gap-2">
                <div className="flex flex-row items-center">
                  <div>
                    <ChatBubbleThoughtIcon className="h-6 w-6 pr-2 text-muted-foreground dark:text-muted-foreground-night" />
                  </div>
                  <div>
                    {agentAnalytics?.mentions
                      ? `${agentAnalytics.mentions.messageCount}`
                      : "-"}
                  </div>
                </div>
              </div>
            }
            className="h-32"
          />
        </CardGrid>
      )}
      {agentConfiguration.scope !== "global" && (
        <div>
          <Page.SectionHeader title="Feedback" />
          <FeedbacksSection
            owner={owner}
            agentConfigurationId={agentConfiguration.sId}
          />
        </div>
      )}
    </>
  );
}

type AssistantDetailsEditorsProps = {
  owner: WorkspaceType;
  user: UserType;
  agentConfiguration: AgentConfigurationType;
};

function AssistantDetailsEditors({
  owner,
  user,
  agentConfiguration,
}: AssistantDetailsEditorsProps) {
  const updateEditors = useUpdateEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const { editors, isEditorsLoading } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const isCurrentUserEditor =
    editors.findIndex((u) => u.sId === user.sId) !== -1;
  const onRemoveMember = async (user: UserTypeWithWorkspaces) => {
    if (!isCurrentUserEditor) {
      return;
    }

    await updateEditors({ removeEditorIds: [user.sId] });
  };

  if (isEditorsLoading) {
    return (
      <div className="flex flex-row items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <MembersList
        currentUser={user}
        membersData={{
          members: editors.map((user) => ({
            ...user,
            workspaces: [owner],
          })),
          isLoading: isEditorsLoading,
          totalMembersCount: editors.length,
          mutateRegardlessOfQueryParams: () => Promise.resolve(undefined),
        }}
        showColumns={isCurrentUserEditor ? ["name", "remove"] : ["name"]}
        onRemoveMemberClick={onRemoveMember}
        onRowClick={function noRefCheck() {}}
      />

      {isCurrentUserEditor && (
        <div className="mt-4">
          <Button label="Add editors" icon={PlusIcon} onClick={() => {}} />
        </div>
      )}
    </div>
  );
}

export function AssistantDetails({
  assistantId,
  onClose,
  owner,
  user,
}: AssistantDetailsProps) {
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);
  const [selectedTab, setSelectedTab] = useState<
    "info" | "performance" | "editors"
  >("info");
  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationValidating,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });

  const doUpdateScope = useUpdateAgentScope({
    owner,
    agentConfigurationId: assistantId,
  });

  const [showRestoreModal, setShowRestoreModal] = useState(false);

  const updateScope = useCallback(
    async (scope: Exclude<AgentConfigurationScope, "global">) => {
      setIsUpdatingScope(true);
      await doUpdateScope(scope);
      setIsUpdatingScope(false);
    },
    [doUpdateScope]
  );

  const DescriptionSection = () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Avatar
          name="Agent avatar"
          visual={agentConfiguration?.pictureUrl}
          size="lg"
        />
        <div className="flex grow flex-col gap-1">
          <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">{`${agentConfiguration?.name ?? ""}`}</div>
          {agentConfiguration?.status === "active" && (
            <SharingDropdown
              owner={owner}
              agentConfiguration={agentConfiguration}
              initialScope={agentConfiguration.scope}
              newScope={agentConfiguration.scope}
              disabled={isUpdatingScope}
              setNewScope={(scope) => updateScope(scope)}
              origin="modal"
            />
          )}
        </div>
      </div>
      {agentConfiguration?.status === "active" && (
        <AssistantDetailsButtonBar
          owner={owner}
          agentConfiguration={agentConfiguration}
          isAgentConfigurationValidating={isAgentConfigurationValidating}
        />
      )}

      {agentConfiguration?.status === "archived" && (
        <>
          <ContentMessage
            title="This agent has been deleted."
            icon={InformationCircleIcon}
            size="md"
          >
            It is no longer active and cannot be used.
          </ContentMessage>

          <RestoreAssistantDialog
            owner={owner}
            isOpen={showRestoreModal}
            agentConfiguration={agentConfiguration}
            onClose={() => {
              setShowRestoreModal(false);
            }}
          />

          <div className="flex justify-center">
            <Button
              variant="warning"
              label="Restore"
              onClick={() => {
                setShowRestoreModal(true);
              }}
            />
          </div>
        </>
      )}
    </div>
  );

  return (
    <Sheet open={!!assistantId} onOpenChange={onClose}>
      <SheetContent size="lg">
        {isAgentConfigurationLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
              <VisuallyHidden>
                <SheetTitle />
              </VisuallyHidden>
              <DescriptionSection />
              {isBuilder(owner) && (
                <Tabs value={selectedTab}>
                  <TabsList border={false}>
                    <TabsTrigger
                      value="info"
                      label="Info"
                      icon={InformationCircleIcon}
                      onClick={() => setSelectedTab("info")}
                    />
                    <TabsTrigger
                      value="performance"
                      label="Performance"
                      icon={BarChartIcon}
                      onClick={() => setSelectedTab("performance")}
                    />
                    <TabsTrigger
                      value="editors"
                      label="Editors"
                      icon={UserGroupIcon}
                      onClick={() => setSelectedTab("editors")}
                    />
                  </TabsList>
                </Tabs>
              )}
            </SheetHeader>
            <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
              {agentConfiguration && (
                <>
                  {selectedTab === "info" && (
                    <AssistantDetailsInfo
                      agentConfiguration={agentConfiguration}
                      owner={owner}
                    />
                  )}
                  {selectedTab === "performance" && (
                    <AssistantDetailsPerformance
                      agentConfiguration={agentConfiguration}
                      owner={owner}
                    />
                  )}
                  {selectedTab === "editors" && (
                    <AssistantDetailsEditors
                      owner={owner}
                      user={user}
                      agentConfiguration={agentConfiguration}
                    />
                  )}
                </>
              )}
              {isAgentConfigurationError?.error.type ===
                "agent_configuration_not_found" && (
                <ContentMessage title="Not Available" icon={LockIcon} size="md">
                  This agent is not available.
                </ContentMessage>
              )}
            </SheetContainer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
