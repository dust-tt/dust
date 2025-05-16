import {
  Avatar,
  Card,
  CardActionButton,
  cn,
  ExternalLinkIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Hoverable,
  Icon,
  NavigationListLabel,
  Spinner,
} from "@dust-tt/sparkle";
import { memo, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";

import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import {
  useAgentConfigurationFeedbacksByDescVersion,
  useAgentConfigurationHistory,
} from "@app/lib/swr/assistants";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

const FEEDBACKS_PAGE_SIZE = 50;

interface FeedbacksSectionProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  gridMode?: boolean;
}

export const FeedbacksSection = ({
  owner,
  agentConfigurationId,
  gridMode = false,
}: FeedbacksSectionProps) => {
  const {
    isAgentConfigurationFeedbacksLoading,
    isValidating,
    agentConfigurationFeedbacks,
    hasMore,
    setSize,
    size,
  } = useAgentConfigurationFeedbacksByDescVersion({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationId,
    limit: FEEDBACKS_PAGE_SIZE,
  });

  // Intersection observer to detect when the user has scrolled to the bottom of the list.
  const { ref: bottomRef, inView: isBottomOfListVisible } = useInView();
  useEffect(() => {
    if (
      isBottomOfListVisible &&
      hasMore &&
      !isValidating &&
      !isAgentConfigurationFeedbacksLoading
    ) {
      void setSize(size + 1);
    }
  }, [
    isBottomOfListVisible,
    hasMore,
    isValidating,
    isAgentConfigurationFeedbacksLoading,
    setSize,
    size,
  ]);

  const { agentConfigurationHistory, isAgentConfigurationHistoryLoading } =
    useAgentConfigurationHistory({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationId,
      disabled: !agentConfigurationId,
    });

  if (
    isAgentConfigurationFeedbacksLoading ||
    isAgentConfigurationHistoryLoading
  ) {
    return (
      <div className="w-full p-6">
        <Spinner variant="dark" />
      </div>
    );
  }

  if (
    !isAgentConfigurationFeedbacksLoading &&
    (!agentConfigurationFeedbacks || agentConfigurationFeedbacks.length === 0)
  ) {
    return (
      <div className="mt-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
        No feedback yet.
      </div>
    );
  }

  if (!agentConfigurationHistory) {
    return (
      <div className="mt-3 text-sm text-foreground dark:text-foreground-night">
        Error loading the previous agent versions.
      </div>
    );
  }

  return (
    <>
      {gridMode ? (
        <div className="flex flex-col gap-4">
          <AgentConfigurationVersionHeader
            agentConfiguration={agentConfigurationHistory[0]}
            agentConfigurationVersion={agentConfigurationHistory[0].version}
            isLatestVersion
          />
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @[48rem]:grid-cols-2">
              {agentConfigurationFeedbacks?.map((feedback) => (
                <MemoizedFeedbackCard
                  key={feedback.id}
                  className="h-full"
                  owner={owner}
                  feedback={feedback as AgentMessageFeedbackWithMetadataType}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AgentConfigurationVersionHeader
            agentConfiguration={agentConfigurationHistory[0]}
            agentConfigurationVersion={agentConfigurationHistory[0].version}
            isLatestVersion
          />
          {agentConfigurationFeedbacks?.map((feedback, index) => {
            const isFirstFeedback = index === 0;
            const previousFeedbackHasDifferentVersion =
              !isFirstFeedback &&
              feedback.agentConfigurationVersion !==
                agentConfigurationFeedbacks[index - 1]
                  .agentConfigurationVersion;
            return (
              <div key={feedback.id} className="animate-fadeIn">
                {previousFeedbackHasDifferentVersion && (
                  <AgentConfigurationVersionHeader
                    agentConfiguration={agentConfigurationHistory?.find(
                      (c) => c.version === feedback.agentConfigurationVersion
                    )}
                    agentConfigurationVersion={
                      feedback.agentConfigurationVersion
                    }
                    isLatestVersion={false}
                  />
                )}
                <MemoizedFeedbackCard
                  owner={owner}
                  feedback={feedback as AgentMessageFeedbackWithMetadataType}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </>
  );
};
interface AgentConfigurationVersionHeaderProps {
  agentConfigurationVersion: number;
  agentConfiguration: LightAgentConfigurationType | undefined;
  isLatestVersion: boolean;
}
function AgentConfigurationVersionHeader({
  agentConfigurationVersion,
  agentConfiguration,
  isLatestVersion,
}: AgentConfigurationVersionHeaderProps) {
  const getAgentConfigurationVersionString = useCallback(
    (config: LightAgentConfigurationType) => {
      if (isLatestVersion) {
        return "Latest version";
      }
      if (!config.versionCreatedAt) {
        return `v${config.version}`;
      }
      const versionDate = new Date(config.versionCreatedAt);
      return (
        "Version: " +
        formatTimestampToFriendlyDate(versionDate.getTime(), "long")
      );
    },
    [isLatestVersion]
  );

  return (
    <NavigationListLabel
      label={
        agentConfiguration
          ? getAgentConfigurationVersionString(agentConfiguration)
          : `v${agentConfigurationVersion}`
      }
    />
  );
}

interface FeedbackCardProps {
  owner: LightWorkspaceType;
  feedback: AgentMessageFeedbackWithMetadataType;
  className?: string;
}

const MemoizedFeedbackCard = memo(FeedbackCard);

function FeedbackCard({ owner, feedback, className }: FeedbackCardProps) {
  const conversationUrl =
    feedback.conversationId &&
    feedback.messageId &&
    // IMPORTANT: We need to check if the conversation is shared before displaying it.
    // This check is redundant: the conversationId is null if the conversation is not shared.
    feedback.isConversationShared
      ? `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${owner.sId}/assistant/${feedback.conversationId}?messageId=${feedback.messageId}`
      : null;

  const timeSinceFeedback = timeAgoFrom(
    new Date(feedback.createdAt).getTime(),
    {
      useLongFormat: true,
    }
  );

  return (
    <Card
      className={cn("flex h-full flex-col", className)} // Add className here
      action={
        conversationUrl && (
          <CardActionButton
            size="mini"
            icon={ExternalLinkIcon}
            href={conversationUrl ?? ""}
            disabled={!conversationUrl}
            tooltip="View conversation"
            target="_blank"
          />
        )
      }
    >
      <div className="flex flex-shrink-0 items-center gap-3 px-4 py-3">
        {feedback.userImageUrl ? (
          <Avatar
            size="sm"
            visual={feedback.userImageUrl}
            name={feedback.userName}
          />
        ) : (
          <Spinner size="sm" />
        )}
        <div className="flex flex-col">
          <div className="font-semibold">{feedback.userName}</div>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {timeSinceFeedback} ago
          </div>
        </div>
      </div>

      <div className="flex flex-grow flex-col gap-3 overflow-hidden px-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex-shrink-0 rounded-full p-2",
              feedback.thumbDirection === "up"
                ? "bg-success-200 dark:bg-success-200-night"
                : "bg-info-200 dark:bg-info-200-night"
            )}
          >
            <Icon
              size="xs"
              className={cn(
                "text-foreground dark:text-foreground-night",
                feedback.thumbDirection === "up"
                  ? "text-success-800 dark:text-success-800-night"
                  : "text-info-800 dark:text-info-800-night"
              )}
              visual={
                feedback.thumbDirection === "up"
                  ? HandThumbUpIcon
                  : HandThumbDownIcon
              }
            />
          </div>
          <div className="flex-grow overflow-hidden">{feedback.content}</div>
        </div>
      </div>

      {conversationUrl && (
        <div className="flex-shrink-0 px-4 py-3">
          <Hoverable variant="primary" href={conversationUrl} target="_blank">
            View conversation
          </Hoverable>
        </div>
      )}
    </Card>
  );
}
