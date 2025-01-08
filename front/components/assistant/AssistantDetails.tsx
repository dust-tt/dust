import {
  Avatar,
  BarChartIcon,
  Button,
  Card,
  CardGrid,
  ChatBubbleLeftRightIcon,
  ChatBubbleThoughtIcon,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HandThumbDownIcon,
  HandThumbUpIcon,
  InformationCircleIcon,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import { useCallback, useState } from "react";

import { AssistantDetailsButtonBar } from "@app/components/assistant/AssistantDetailsButtonBar";
import { AssistantActionsSection } from "@app/components/assistant/details/AssistantActionsSection";
import { AssistantUsageSection } from "@app/components/assistant/details/AssistantUsageSection";
import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";
import { FeedbacksSection } from "@app/components/assistant_builder/FeedbacksSection";
import { SharingDropdown } from "@app/components/assistant_builder/Sharing";
import {
  useAgentAnalytics,
  useAgentConfiguration,
  useUpdateAgentScope,
} from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";

const PERIODS = [
  { value: 7, label: "Last 7 days" },
  { value: 15, label: "Last 15 days" },
  { value: 30, label: "Last 30 days" },
];

type AssistantDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  assistantId: string | null;
  showPerformanceTab?: boolean;
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
      <div className="text-sm text-foreground">
        {agentConfiguration?.description}
      </div>
      {agentConfiguration && (
        <AssistantUsageSection
          agentConfiguration={agentConfiguration}
          owner={owner}
        />
      )}
      <Page.Separator />

      <AssistantActionsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />

      {agentConfiguration?.instructions ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">Instructions</div>
          <ReadOnlyTextArea content={agentConfiguration.instructions} />
        </div>
      ) : (
        "This assistant has no instructions."
      )}
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
  const { agentAnalytics } = useAgentAnalytics({
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

      <div></div>
      <CardGrid>
        <Card variant="primary" size="md">
          <div className="flex h-24 w-full flex-col gap-1 text-sm">
            <div className="flex w-full gap-1 font-medium text-foreground">
              <div className="w-full">Active Users</div>
            </div>
            <div className="flex flex-col gap-1 text-lg font-bold">
              {agentAnalytics?.users ? (
                <>
                  <div className="truncate text-element-900">
                    {agentAnalytics.users.length}
                  </div>

                  <Avatar.Stack size="md" hasMagnifier={false}>
                    {removeNulls(agentAnalytics.users.map((top) => top.user))
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
        </Card>

        <Card variant="primary" size="md">
          <div className="flex h-24 w-full flex-col gap-1 text-sm">
            <div className="flex w-full gap-1 font-medium text-foreground">
              <div className="w-full">Reactions</div>
            </div>
            <div className="flex flex-row gap-2 text-lg font-bold">
              {agentConfiguration.scope !== "global" &&
              agentAnalytics?.feedbacks ? (
                <>
                  <div className="flex flex-row items-center">
                    <div>
                      <HandThumbUpIcon className="h-6 w-6 pr-2 text-element-600" />
                    </div>
                    <div>{agentAnalytics.feedbacks.positiveFeedbacks}</div>
                  </div>
                  <div className="flex flex-row items-center">
                    <div>
                      <HandThumbDownIcon className="h-6 w-6 pr-2 text-element-600" />
                    </div>
                    <div>{agentAnalytics.feedbacks.negativeFeedbacks}</div>
                  </div>
                </>
              ) : (
                "-"
              )}
            </div>
          </div>
        </Card>
        <Card variant="primary" size="md">
          <div className="flex h-24 w-full flex-col gap-1 text-sm">
            <div className="flex w-full gap-1 font-medium text-foreground">
              <div className="w-full">Conversations</div>
            </div>
            <div className="flex flex-row gap-2 text-lg font-bold">
              <div className="flex flex-row items-center">
                <div>
                  <ChatBubbleLeftRightIcon className="h-6 w-6 pr-2 text-element-600" />
                </div>
                <div>
                  {agentAnalytics?.mentions
                    ? `${agentAnalytics.mentions.conversationCount}`
                    : "-"}
                </div>
              </div>
            </div>
          </div>
        </Card>
        <Card variant="primary" size="md">
          <div className="flex h-24 w-full flex-col gap-1 text-sm">
            <div className="flex w-full gap-1 font-medium text-foreground">
              <div className="w-full">Messages</div>
            </div>
            <div className="flex flex-row gap-2 text-lg font-bold">
              <div className="flex flex-row items-center">
                <div>
                  <ChatBubbleThoughtIcon className="h-6 w-6 pr-2 text-element-600" />
                </div>
                <div>
                  {agentAnalytics?.mentions
                    ? `${agentAnalytics.mentions.messageCount}`
                    : "-"}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </CardGrid>
      <Page.SectionHeader title="Feedbacks" />
      <FeedbacksSection
        owner={owner}
        agentConfigurationId={agentConfiguration.sId}
      />
    </>
  );
}

export function AssistantDetails({
  assistantId,
  onClose,
  owner,
  showPerformanceTab = false,
}: AssistantDetailsProps) {
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);
  const [selectedTab, setSelectedTab] = useState("info");
  const { agentConfiguration, isAgentConfigurationValidating } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: assistantId,
    });

  const doUpdateScope = useUpdateAgentScope({
    owner,
    agentConfigurationId: assistantId,
  });

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
          name="Assistant avatar"
          visual={agentConfiguration?.pictureUrl}
          size="lg"
        />
        <div className="flex grow flex-col gap-1">
          <div
            className={classNames(
              "font-bold text-foreground",
              agentConfiguration?.name && agentConfiguration.name.length > 20
                ? "text-md"
                : "text-lg"
            )}
          >{`@${agentConfiguration?.name ?? ""}`}</div>
          {agentConfiguration?.status === "active" && (
            <SharingDropdown
              owner={owner}
              agentConfiguration={agentConfiguration}
              initialScope={agentConfiguration.scope}
              newScope={agentConfiguration.scope}
              disabled={isUpdatingScope}
              setNewScope={(scope) => updateScope(scope)}
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
        <ContentMessage
          variant="amber"
          title="This assistant has been deleted."
          icon={InformationCircleIcon}
          size="md"
        >
          It is no longer active and cannot be used.
        </ContentMessage>
      )}
    </div>
  );

  return (
    <Sheet open={!!assistantId} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle />
        </SheetHeader>
        <SheetContainer>
          {agentConfiguration && (
            <div className="flex flex-col gap-5 pt-6 text-sm text-foreground">
              <DescriptionSection />
              {showPerformanceTab && (
                <Tabs value={selectedTab}>
                  <TabsList>
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
                  </TabsList>
                </Tabs>
              )}
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
            </div>
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
