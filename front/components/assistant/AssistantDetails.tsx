import {
  ArrowPathIcon,
  Avatar,
  BarChartIcon,
  Button,
  CardGrid,
  ChatBubbleLeftRightIcon,
  ChatBubbleThoughtIcon,
  Chip,
  CompanyIcon,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DustIcon,
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
  UserGroupIcon,
  ValueCard,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useEffect, useState } from "react";

import { AssistantDetailsButtonBar } from "@app/components/assistant/AssistantDetailsButtonBar";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/AssistantKnowledgeSection";
import { AssistantToolsSection } from "@app/components/assistant/details/AssistantToolsSection";
import { AssistantUsageSection } from "@app/components/assistant/details/AssistantUsageSection";
import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";
import { RestoreAssistantDialog } from "@app/components/assistant/RestoreAssistantDialog";
import { FeedbacksSection } from "@app/components/assistant_builder/FeedbacksSection";
import {
  useAgentAnalytics,
  useAgentConfiguration,
} from "@app/lib/swr/assistants";
import { useEditors, useUpdateEditors } from "@app/lib/swr/editors";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID, isAdmin, removeNulls } from "@app/types";

import { AddEditorDropdown } from "../members/AddEditorsDropdown";
import { MembersList } from "../members/MembersList";

export const SCOPE_INFO: Record<
  AgentConfigurationScope,
  {
    shortLabel: string;
    label: string;
    color: "green" | "golden" | "blue" | "primary";
    icon?: typeof UserGroupIcon | undefined;
    text: string;
  }
> = {
  // TODO(agent-discovery) remove once all agents are migrated to the new scope
  workspace: {
    shortLabel: "Company",
    label: "Company Agent",
    color: "golden",
    icon: CompanyIcon,
    text: "Activated by default for all members of the workspace.",
  },
  published: {
    shortLabel: "Shared",
    label: "Shared Agent",
    color: "green",
    icon: UserGroupIcon,
    text: "Anyone in the workspace can view and edit.",
  },
  private: {
    shortLabel: "Personal",
    label: "Personal Agent",
    color: "blue",
    icon: LockIcon,
    text: "Only I can view and edit.",
  },
  // END-TODO(agent-discovery)
  global: {
    shortLabel: "Default",
    label: "Default Agent",
    color: "primary",
    icon: DustIcon,
    text: "Default agents provided by Dust.",
  },
  hidden: {
    shortLabel: "Not published",
    label: "Not published",
    color: "primary",
    text: "Hidden agents.",
  },
  visible: {
    shortLabel: "Published",
    label: "Published",
    color: "green",
    text: "Visible agents.",
  },
} as const;

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
            <Chip key={tag.sId} color="golden" label={tag.name} size="xs" />
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
      <div className="flex flex-row items-center justify-between gap-3">
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

                      <Avatar.Stack
                        size="md"
                        hasMagnifier={false}
                        avatars={removeNulls(
                          agentAnalytics.users.map((top) => top.user)
                        )
                          .slice(0, 5)
                          .map((user) => ({
                            size: "sm",
                            name: user.fullName,
                            visual: user.image,
                          }))}
                      />
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
    if (isCurrentUserEditor) {
      await updateEditors({ removeEditorIds: [user.sId], addEditorIds: [] });
    }
  };

  const onAddEditor = async (user: UserType) => {
    if (isCurrentUserEditor) {
      await updateEditors({ removeEditorIds: [], addEditorIds: [user.sId] });
    }
  };

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
          <AddEditorDropdown
            owner={owner}
            editors={editors}
            onAddEditor={onAddEditor}
            trigger={
              <Button label="Add editors" icon={PlusIcon} onClick={() => {}} />
            }
          />
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

  useEffect(() => {
    // Reset to info tab when we open/close the modal
    setSelectedTab("info");
  }, [assistantId]);

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    agentConfiguration?.sId as GLOBAL_AGENTS_SID
  );

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const showEditorsTabs = assistantId != null && !isGlobalAgent;

  const showPerformanceTabs =
    (agentConfiguration?.canEdit || isAdmin(owner)) &&
    assistantId != null &&
    !isGlobalAgent;

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
            <div>
              <Chip
                color={SCOPE_INFO[agentConfiguration.scope].color}
                icon={SCOPE_INFO[agentConfiguration.scope].icon || undefined}
              >
                {SCOPE_INFO[agentConfiguration.scope].label}
              </Chip>
            </div>
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
            title="This agent has been archived."
            variant="warning"
            icon={InformationCircleIcon}
            size="md"
          >
            It is no longer active and cannot be used.
            <br />
            <div className="mt-2">
              <Button
                variant="outline"
                label="Restore"
                onClick={() => {
                  setShowRestoreModal(true);
                }}
                classname="mt-2"
                icon={ArrowPathIcon}
              />
            </div>
          </ContentMessage>

          <RestoreAssistantDialog
            owner={owner}
            isOpen={showRestoreModal}
            agentConfiguration={agentConfiguration}
            onClose={() => {
              setShowRestoreModal(false);
            }}
          />

          <div className="flex justify-center"></div>
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
              {showEditorsTabs || showPerformanceTabs ? (
                <Tabs value={selectedTab}>
                  <TabsList border={false}>
                    <TabsTrigger
                      value="info"
                      label="Info"
                      icon={InformationCircleIcon}
                      onClick={() => setSelectedTab("info")}
                    />
                    {showPerformanceTabs && (
                      <TabsTrigger
                        value="performance"
                        label="Performance"
                        icon={BarChartIcon}
                        onClick={() => setSelectedTab("performance")}
                      />
                    )}
                    {showEditorsTabs && (
                      <TabsTrigger
                        value="editors"
                        label="Editors"
                        icon={UserGroupIcon}
                        onClick={() => setSelectedTab("editors")}
                      />
                    )}
                  </TabsList>
                </Tabs>
              ) : (
                <div />
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
                  {showEditorsTabs && selectedTab === "editors" && (
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
