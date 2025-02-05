import {
  Avatar,
  Button,
  Card,
  classNames,
  ExternalLinkIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { memo, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";

import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import {
  useAgentConfigurationFeedbacksByDescVersion,
  useAgentConfigurationHistory,
} from "@app/lib/swr/assistants";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";

const FEEDBACKS_PAGE_SIZE = 50;

interface FeedbacksSectionProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
}
export const FeedbacksSection = ({
  owner,
  agentConfigurationId,
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
    return <Spinner />;
  }

  if (
    !isAgentConfigurationFeedbacksLoading &&
    (!agentConfigurationFeedbacks || agentConfigurationFeedbacks.length === 0)
  ) {
    return (
      <div className="mt-3 text-sm text-element-700">No feedback yet.</div>
    );
  }

  if (!agentConfigurationHistory) {
    return (
      <div className="mt-3 text-sm text-element-900">
        Error loading the previous agent versions.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-col">
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
              agentConfigurationFeedbacks[index - 1].agentConfigurationVersion;
          return (
            <div key={feedback.id} className="animate-fadeIn">
              {previousFeedbackHasDifferentVersion && (
                <AgentConfigurationVersionHeader
                  agentConfiguration={agentConfigurationHistory?.find(
                    (c) => c.version === feedback.agentConfigurationVersion
                  )}
                  agentConfigurationVersion={feedback.agentConfigurationVersion}
                  isLatestVersion={false}
                />
              )}

              <div
                className={classNames(
                  "mr-2",
                  !previousFeedbackHasDifferentVersion && !isFirstFeedback
                    ? "mt-3"
                    : ""
                )}
              >
                <MemoizedFeedbackCard
                  owner={owner}
                  feedback={feedback as AgentMessageFeedbackWithMetadataType}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </div>
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
    <div className="mb-2 mt-4 text-xs font-semibold text-element-800">
      {agentConfiguration
        ? getAgentConfigurationVersionString(agentConfiguration)
        : `v${agentConfigurationVersion}`}
    </div>
  );
}

interface FeedbackCardProps {
  owner: LightWorkspaceType;
  feedback: AgentMessageFeedbackWithMetadataType;
}
const MemoizedFeedbackCard = memo(FeedbackCard);
function FeedbackCard({ owner, feedback }: FeedbackCardProps) {
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
    <Card>
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-row">
          <div className="flex flex-grow items-center justify-between">
            <div className="flex gap-2">
              {feedback.userImageUrl ? (
                <Avatar
                  size="xs"
                  visual={feedback.userImageUrl}
                  name={feedback.userName}
                />
              ) : (
                <Spinner size="xs" />
              )}
              <div className="flex flex-col">
                <div className="flex-grow text-sm font-semibold text-element-900">
                  {feedback.userName}
                </div>
                <div className="text-xs text-element-700">
                  {timeSinceFeedback} ago
                </div>
              </div>
            </div>

            {conversationUrl && (
              <div className="flex flex-shrink-0 flex-row">
                <Button
                  variant="ghost-secondary"
                  size="mini"
                  href={conversationUrl ?? ""}
                  icon={ExternalLinkIcon}
                  disabled={!conversationUrl}
                  tooltip="View conversation"
                  target="_blank"
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-row gap-3 pl-1">
          <Icon
            size="xs"
            className="text-primary"
            visual={
              feedback.thumbDirection === "up"
                ? HandThumbUpIcon
                : HandThumbDownIcon
            }
          />
          {feedback.content && (
            <div className="flex-grow text-sm font-normal text-primary">
              {feedback.content}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
