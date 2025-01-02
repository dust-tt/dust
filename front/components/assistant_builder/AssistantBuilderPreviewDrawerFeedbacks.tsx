import {
  Avatar,
  Button,
  ExternalLinkIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Page,
  Pagination,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

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
  // Used for pagination's lastValue: page index -> last feedback id in page
  const [lastIdForPage, setLastIdForPage] = useState<Record<number, number>>(
    {}
  );

  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: FEEDBACKS_PAGE_SIZE,
  });

  // Decreasing version, paginated decreasing id.
  const { agentConfigurationFeedbacks, isAgentConfigurationFeedbacksLoading } =
    useAgentConfigurationFeedbacksByDescVersion({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationId ?? "",
      withMetadata: true,
      paginationParams: {
        limit: FEEDBACKS_PAGE_SIZE,
        lastValue:
          paginationState.pageIndex === 0
            ? undefined
            : lastIdForPage[paginationState.pageIndex - 1],
        orderColumn: "id",
        orderDirection: "desc",
      },
      disabled: !agentConfigurationId,
    });

  const { agentConfigurationHistory, isAgentConfigurationHistoryLoading } =
    useAgentConfigurationHistory({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationId,
      disabled: !agentConfigurationId,
    });

  const handleSetPagination = useCallback(
    (pagination: PaginationState) => {
      // Pagination is not displayed if there are no feedbacks.
      if (
        !agentConfigurationFeedbacks ||
        agentConfigurationFeedbacks.feedbacks.length === 0
      ) {
        return;
      }
      setLastIdForPage((prev) => ({
        ...prev,
        ...{
          [paginationState.pageIndex]:
            agentConfigurationFeedbacks.feedbacks[
              agentConfigurationFeedbacks.feedbacks.length - 1
            ].id,
        },
      }));
      setPaginationState(pagination);
    },
    [agentConfigurationFeedbacks, paginationState.pageIndex]
  );

  const firstAgentConfigurationInPage = useMemo(
    () =>
      agentConfigurationHistory?.find(
        (c) =>
          c.version ===
          agentConfigurationFeedbacks?.feedbacks[0].agentConfigurationVersion
      ),
    [agentConfigurationHistory, agentConfigurationFeedbacks]
  );

  if (
    isAgentConfigurationFeedbacksLoading ||
    isAgentConfigurationHistoryLoading
  ) {
    return <Spinner />;
  }

  if (
    !isAgentConfigurationFeedbacksLoading &&
    (!agentConfigurationFeedbacks ||
      agentConfigurationFeedbacks.feedbacks.length === 0)
  ) {
    return <div className="mt-3 text-sm text-element-900">No feedbacks.</div>;
  }

  if (!agentConfigurationHistory || !firstAgentConfigurationInPage) {
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
          agentConfiguration={firstAgentConfigurationInPage}
          agentConfigurationVersion={firstAgentConfigurationInPage?.version}
          isLatestVersion={
            firstAgentConfigurationInPage?.version ===
            agentConfigurationHistory[0].version
          }
        />
        {agentConfigurationFeedbacks?.feedbacks.map((feedback, index) => {
          const isFirstFeedback = index === 0;
          const isNewVersion =
            !isFirstFeedback &&
            feedback.agentConfigurationVersion !==
              agentConfigurationFeedbacks.feedbacks[index - 1]
                .agentConfigurationVersion;
          return (
            <div key={feedback.id} className="animate-fadeIn">
              {isNewVersion && (
                <AgentConfigurationVersionHeader
                  agentConfiguration={agentConfigurationHistory?.find(
                    (c) => c.version === feedback.agentConfigurationVersion
                  )}
                  agentConfigurationVersion={feedback.agentConfigurationVersion}
                  isLatestVersion={false}
                />
              )}
              {!isNewVersion && !isFirstFeedback && (
                <div className="mx-4 my-1">
                  <Page.Separator />
                </div>
              )}
              <div className="mr-2">
                <FeedbackCard
                  owner={owner}
                  feedback={feedback as AgentMessageFeedbackWithMetadataType}
                />
              </div>
            </div>
          );
        })}
      </div>
      {agentConfigurationFeedbacks &&
        agentConfigurationFeedbacks.totalFeedbackCount > 0 && (
          <div className="my-2 mr-2">
            <Pagination
              rowCount={agentConfigurationFeedbacks.totalFeedbackCount}
              pagination={paginationState}
              setPagination={handleSetPagination}
              size="xs"
              showDetails={true}
              // Important: We need to go page by page to keep track of last cursor id.
              showPageButtons={false}
            />
          </div>
        )}
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
      return formatTimestampToFriendlyDate(versionDate.getTime(), "long");
    },
    [isLatestVersion]
  );

  return (
    <div className="mb-2 mt-4 text-sm font-medium">
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
function FeedbackCard({ owner, feedback }: FeedbackCardProps) {
  const conversationUrl =
    feedback.conversationId &&
    feedback.messageId &&
    // IMPORTANT: We need to check if the conversation is shared before displaying it.
    // This check is redundant: the conversationId is null if the conversation is not shared.
    feedback.isConversationShared
      ? `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${owner.sId}/assistant/${feedback.conversationId}#${feedback.messageId}`
      : null;

  const timeSinceFeedback = timeAgoFrom(
    new Date(feedback.createdAt).getTime(),
    {
      useLongFormat: true,
    }
  );

  return (
    <div className="rounded-lg p-2">
      <div className="justify-content-around flex items-center">
        <div className="flex w-full items-center gap-2">
          {feedback.userImageUrl ? (
            <Avatar
              size="xs"
              visual={feedback.userImageUrl}
              name={feedback.userName}
            />
          ) : (
            <Spinner size="xs" />
          )}
          <div className="flex-grow text-sm font-medium text-element-900">
            {feedback.userName}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-row items-center text-xs text-muted-foreground">
          {timeSinceFeedback} ago
          <div className="flex h-8 w-8 items-center justify-center rounded">
            {feedback.thumbDirection === "up" ? (
              <HandThumbUpIcon />
            ) : (
              <HandThumbDownIcon />
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="xs"
          href={conversationUrl ?? ""}
          icon={ExternalLinkIcon}
          disabled={!conversationUrl}
          target="_blank"
        />
      </div>
      {feedback.content && (
        <div className="my-2 ml-4 flex items-center">
          <div className="flex-grow text-sm leading-relaxed text-gray-700">
            {feedback.content}
          </div>
        </div>
      )}
    </div>
  );
}
