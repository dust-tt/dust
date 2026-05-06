import { ConversationSidebarStatusDot } from "@app/components/assistant/conversation/ConversationSidebarStatusDot";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { timeAgoFrom } from "@app/lib/utils";
import type { ConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { getConversationRoute, getProjectRoute } from "@app/lib/utils/router";
import type { GetWorkspaceProjectTaskResponseBody } from "@app/pages/api/w/[wId]/project_tasks/[taskSId]/index";
import type { ProjectTaskStatus } from "@app/types/project_task";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AttachmentChip,
  Avatar,
  LinkWrapper,
  ListCheckIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useState } from "react";
import type { Fetcher } from "swr";
import { visit } from "unist-util-visit";

function formatTaskStatusLabel(status: ProjectTaskStatus): string {
  switch (status) {
    case "todo":
      return "Open";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
    default:
      assertNeverAndIgnore(status);
      return status;
  }
}

function formatRelativeAgo(value: Date | string): string {
  return `${timeAgoFrom(new Date(value).getTime(), { useLongFormat: true })} ago`;
}

function conversationActivityCaption(
  status: ConversationDotStatus,
  hasConversation: boolean
): string | null {
  if (!hasConversation) {
    return null;
  }
  switch (status) {
    case "unread":
      return "Unread activity";
    case "blocked":
      return "Needs attention";
    case "idle":
      return "Up to date";
    default:
      assertNeverAndIgnore(status);
      return null;
  }
}

function TaskDirectivePopoverBody({
  owner,
  taskSId,
}: {
  owner: LightWorkspaceType;
  taskSId: string;
}) {
  const { fetcher } = useFetcher();
  const url = `/api/w/${owner.sId}/project_tasks/${encodeURIComponent(taskSId)}`;
  const { data, error, isLoading } = useSWRWithDefaults(
    url,
    fetcher as Fetcher<GetWorkspaceProjectTaskResponseBody, string>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[7rem] items-center justify-center p-3">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-3 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
        Could not load this task.
      </div>
    );
  }

  const { task, space } = data;
  const projectHref = getProjectRoute(owner.sId, space.sId);
  const assignee = task.user;
  const dotStatus: ConversationDotStatus =
    task.conversationSidebarStatus ?? "idle";
  const hasConversation = !!task.conversationId;
  const activityCaption = conversationActivityCaption(
    dotStatus,
    hasConversation
  );

  return (
    <div className="flex flex-col p-3">
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground dark:text-foreground-night">
        {task.text}
      </p>

      <Separator className="-mx-3 my-3 shrink-0 bg-border/60 dark:bg-border-night/60" />

      <dl className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-3 gap-y-2.5 pb-2 text-xs">
        <dt className="text-muted-foreground dark:text-muted-foreground-night">
          Assignee
        </dt>
        <dd className="flex min-w-0 items-center justify-end">
          {assignee ? (
            <Tooltip
              label={assignee.fullName}
              tooltipTriggerAsChild
              trigger={
                <span className="inline-flex shrink-0">
                  <Avatar
                    size="xxs"
                    isRounded
                    name={assignee.fullName}
                    visual={
                      assignee.image ?? "/static/humanavatar/anonymous.png"
                    }
                    className="ring-1 ring-border/40 dark:ring-border-night/40"
                  />
                </span>
              }
            />
          ) : (
            <span className="text-muted-foreground dark:text-muted-foreground-night">
              Unassigned
            </span>
          )}
        </dd>

        <dt className="text-muted-foreground dark:text-muted-foreground-night">
          Created
        </dt>
        <dd className="text-right font-medium text-foreground dark:text-foreground-night">
          {formatRelativeAgo(task.createdAt)}
        </dd>

        <dt className="text-muted-foreground dark:text-muted-foreground-night">
          Status
        </dt>
        <dd className="text-right font-medium text-foreground dark:text-foreground-night">
          {formatTaskStatusLabel(task.status)}
          {task.status === "done" && task.doneAt ? (
            <span className="block text-[11px] font-normal text-muted-foreground dark:text-muted-foreground-night">
              Completed {formatRelativeAgo(task.doneAt)}
            </span>
          ) : null}
        </dd>

        <dt className="text-muted-foreground dark:text-muted-foreground-night">
          ID
        </dt>
        <dd className="min-w-0 text-right font-mono text-[11px] font-medium tabular-nums text-foreground dark:text-foreground-night">
          <span className="break-all select-text">{task.sId}</span>
        </dd>

        {hasConversation && task.conversationId && activityCaption ? (
          <>
            <dt className="text-muted-foreground dark:text-muted-foreground-night">
              Conversation
            </dt>
            <dd className="flex min-w-0 items-center justify-end gap-2 text-right">
              <ConversationSidebarStatusDot
                status={dotStatus}
                className="m-0 shrink-0"
              />
              <LinkWrapper
                href={getConversationRoute(owner.sId, task.conversationId)}
                shallow={false}
                className="min-w-0 max-w-[11rem] truncate text-right text-xs font-medium text-highlight-700 underline-offset-2 hover:underline dark:text-highlight-400-night"
              >
                {activityCaption}
              </LinkWrapper>
            </dd>
          </>
        ) : null}
      </dl>

      <div className="-mx-3 -mb-3 mt-1 border-t border-border/60 bg-muted/25 px-3 py-2.5 dark:border-border-night/60 dark:bg-muted-night/15">
        <LinkWrapper
          href={projectHref}
          shallow={false}
          className="block w-full min-w-0 rounded-md outline-none ring-offset-background hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-highlight-300 focus-visible:ring-offset-1 dark:ring-offset-background-night dark:hover:bg-muted-night/25 dark:focus-visible:ring-highlight-300-night"
        >
          <div className="break-words text-sm font-semibold leading-snug text-highlight-700 underline-offset-2 hover:underline dark:text-highlight-400-night">
            {space.name}
          </div>
        </LinkWrapper>
        {space.description ? (
          <p className="mt-1 w-full min-w-0 break-words text-xs leading-tight text-muted-foreground dark:text-muted-foreground-night">
            {space.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TaskDirectiveChipInner({
  owner,
  label,
  sId,
}: {
  owner: LightWorkspaceType;
  label: string;
  sId: string;
}) {
  const [open, setOpen] = useState(false);
  const displayLabel = label.replaceAll("\n", " ").replaceAll("\r", " ");

  return (
    <span
      data-project-task-sid={sId}
      className="inline-block max-w-[11rem] align-middle sm:max-w-[13rem]"
    >
      <PopoverRoot open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="group flex w-full min-w-0 max-w-full cursor-pointer rounded-md border-0 bg-transparent p-0 text-left outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-highlight-300 focus-visible:ring-offset-1 dark:focus-visible:ring-highlight-300-night dark:ring-offset-background-night"
            aria-label={`Task: ${displayLabel}. Open details.`}
          >
            <AttachmentChip
              label={displayLabel}
              icon={{ visual: ListCheckIcon }}
              color="green"
              className="min-w-0 max-w-full transition-opacity group-hover:opacity-90"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border/70 p-0 shadow-xl ring-1 ring-black/[0.04] dark:border-border-night/70 dark:ring-white/[0.06]"
        >
          {open ? (
            <TaskDirectivePopoverBody owner={owner} taskSId={sId} />
          ) : null}
        </PopoverContent>
      </PopoverRoot>
    </span>
  );
}

/**
 * Markdown `:project_task` directive renderer with details popover (requires workspace context).
 */
export function getTaskDirectiveBlock(owner: LightWorkspaceType) {
  return function TaskDirectiveBlockBound({
    label,
    sId,
  }: {
    label: string;
    sId: string;
  }) {
    return <TaskDirectiveChipInner owner={owner} label={label} sId={sId} />;
  };
}

/**
 * Remark plugin: `:project_task[label]{sId=…}` and legacy `:todo[label]{sId=…}`
 * → `project_task` (single ReactMarkdown component).
 */
export function taskDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      const name = node.name;
      if (
        (name !== "project_task" && name !== "todo") ||
        !node.children?.[0] ||
        !node.attributes?.sId
      ) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const data = node.data || (node.data = {});
      data.hName = "project_task";
      data.hProperties = {
        label: node.children[0].value,
        sId: String(node.attributes.sId),
      };
    });
  };
}
