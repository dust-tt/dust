import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import { inferProjectTaskSourceFromUrl } from "@app/lib/api/actions/servers/pod_tasks/source_utils";
import type { PodTasksCreateTasksInput } from "@app/lib/api/actions/servers/pod_tasks/types";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { PodTaskSourceType } from "@app/types/project_task";
import { POD_TASK_NO_ASSIGNEE_LABEL } from "@app/types/project_task";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  Checkbox,
  Chip,
  ConfluenceLogo,
  DriveLogo,
  ExternalLinkIcon,
  GithubLogo,
  Icon,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useMemo } from "react";

const SOURCE_ICON_BY_TYPE: Record<
  PodTaskSourceType,
  ComponentType<{ className?: string }>
> = {
  project_conversation: ChatBubbleLeftRightIcon,
  project_knowledge: BookOpenIcon,
  slack: SlackLogo,
  notion: NotionLogo,
  gdrive: DriveLogo,
  confluence: ConfluenceLogo,
  github: GithubLogo,
  microsoft: MicrosoftLogo,
};

interface PodTasksCreateValidationDetailsProps {
  input: PodTasksCreateTasksInput;
  owner: LightWorkspaceType;
  user: UserType;
  conversationId?: string | null;
}

function formatAssigneeLabel({
  userId,
  currentUserSId,
  memberDisplayBySId,
  isMembersLoading,
}: {
  userId: string | null | undefined;
  currentUserSId: string;
  memberDisplayBySId: Record<string, { fullName: string }>;
  isMembersLoading: boolean;
}): string {
  if (userId === null || userId === undefined) {
    return POD_TASK_NO_ASSIGNEE_LABEL;
  }
  if (userId === currentUserSId) {
    return "You";
  }
  const member = memberDisplayBySId[userId];
  if (member) {
    return member.fullName;
  }
  if (isMembersLoading) {
    return "Loading…";
  }
  return userId;
}

export function PodTasksCreateValidationDetails({
  input,
  owner,
  user,
  conversationId,
}: PodTasksCreateValidationDetailsProps) {
  const { podLabel, isPodLabelLoading } = usePodLabel({
    owner,
    dustPodUri: input.dustPod?.uri,
    conversationId,
  });

  const assigneeSIds = useMemo(
    () =>
      input.tasks
        .map((task) => task.userId)
        .filter((userId): userId is string => typeof userId === "string"),
    [input.tasks]
  );
  const { membersBySId, isMembersLoading } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: assigneeSIds,
  });

  const taskCount = input.tasks.length;
  const doneCount = input.tasks.filter((task) => task.doneRationale).length;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {input.creatorType === "user" ? (
          <>
            Review the{" "}
            <span className="font-medium text-foreground dark:text-foreground-night">
              {taskCount}
            </span>{" "}
            task{taskCount === 1 ? "" : "s"} below before adding them to{" "}
            <span className="font-medium text-foreground dark:text-foreground-night">
              {isPodLabelLoading ? "Loading…" : podLabel}
            </span>
            .
          </>
        ) : (
          <>
            The agent wants to create{" "}
            <span className="font-medium text-foreground dark:text-foreground-night">
              {taskCount}
            </span>{" "}
            task{taskCount === 1 ? "" : "s"} in{" "}
            <span className="font-medium text-foreground dark:text-foreground-night">
              {isPodLabelLoading ? "Loading…" : podLabel}
            </span>
            .
          </>
        )}
        {doneCount > 0 && <> {doneCount} will be marked as done immediately.</>}
      </p>

      <div className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background dark:divide-separator-night dark:border-separator-night dark:bg-background-night">
        {input.tasks.map((task, index) => {
          const assigneeLabel = formatAssigneeLabel({
            userId: task.userId,
            currentUserSId: user.sId,
            memberDisplayBySId: membersBySId,
            isMembersLoading,
          });
          const isDone = Boolean(task.doneRationale);

          return (
            <div
              key={`${index}-${task.text}`}
              className="flex items-start gap-3 px-3 py-3"
            >
              <div className="mt-0.5 shrink-0">
                <Checkbox size="xs" checked={isDone} disabled />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 break-words text-sm leading-5 text-foreground dark:text-foreground-night">
                    {task.text}
                  </p>
                  {isDone && <Chip size="xs" color="green" label="Done" />}
                </div>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  Assignee: {assigneeLabel}
                </p>
                {task.doneRationale && (
                  <p className="text-xs italic text-muted-foreground dark:text-muted-foreground-night">
                    {task.doneRationale}
                  </p>
                )}
                {task.sources && task.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {task.sources.map((source) => {
                      const inferred = inferProjectTaskSourceFromUrl({
                        url: source.url,
                        title: source.title,
                      });
                      const SourceIcon =
                        SOURCE_ICON_BY_TYPE[inferred.sourceType];

                      return (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/80 dark:bg-muted-night dark:text-foreground-night dark:hover:bg-muted-night/80"
                        >
                          <Icon
                            size="xs"
                            visual={SourceIcon}
                            className="shrink-0"
                          />
                          <span className="truncate">{source.title}</span>
                          <ExternalLinkIcon className="h-3 w-3 shrink-0 opacity-60" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
