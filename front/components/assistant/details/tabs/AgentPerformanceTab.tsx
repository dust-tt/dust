import {
  Avatar,
  Button,
  CardGrid,
  ChatBubbleLeftRightIcon,
  ChatBubbleThoughtIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Page,
  Spinner,
  ValueCard,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { FeedbacksSection } from "@app/components/assistant_builder/FeedbacksSection";
import { useAgentAnalytics } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { removeNulls } from "@app/types";

const PERIODS = [
  { value: 7, label: "Last 7 days" },
  { value: 15, label: "Last 15 days" },
  { value: 30, label: "Last 30 days" },
];

interface AgentPerformanceTabProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  gridMode: boolean;
}

export function AgentPerformanceTab({
  agentConfiguration,
  owner,
  gridMode,
}: AgentPerformanceTabProps) {
  const [period, setPeriod] = useState(30);
  const { agentAnalytics, isAgentAnalyticsLoading } = useAgentAnalytics({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
    period,
  });

  return (
    <div className="flex flex-col gap-4">
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

      {isAgentAnalyticsLoading ? (
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
            gridMode={gridMode}
          />
        </div>
      )}
    </div>
  );
}
