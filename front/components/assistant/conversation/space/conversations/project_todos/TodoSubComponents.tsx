import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  ProjectTodoActorType,
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@app/types/user";
import {
  Avatar,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ConfluenceLogo,
  cn,
  DriveLogo,
  GithubLogo,
  Icon,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useMemo } from "react";

// ── Metadata tooltip ──────────────────────────────────────────────────────────

function formatActorLabel(
  type: ProjectTodoActorType | null,
  agentId: string | null,
  userId: string | null,

  agentNameById: Map<string, string>,
  currentUser: UserTypeWithWorkspaces | null
): string {
  if (!type) {
    return "someone";
  }
  switch (type) {
    case "agent":
      if (agentId === "butler") {
        return "Dust";
      }
      const name = agentId ? agentNameById.get(agentId) : null;
      return name ? `@${name}` : "an agent";
    case "user":
      if (userId === currentUser?.sId) {
        return "you";
      }
      return "a user";
    default:
      assertNeverAndIgnore(type);
      return "someone";
  }
}

function formatFriendlyDate(value: Date | string): string {
  return `${timeAgoFrom(new Date(value).getTime(), { useLongFormat: true })} ago`;
}

interface TodoMetadataTooltipProps {
  todo: ProjectTodoType;
  agentNameById: Map<string, string>;
  children: React.ReactElement;
}

export function TodoMetadataTooltip({
  todo,
  agentNameById,
  children,
}: TodoMetadataTooltipProps) {
  const { user } = useUser();

  const creatorLabel = formatActorLabel(
    todo.createdByType,
    todo.createdByAgentConfigurationId,
    todo.createdByUserId,
    agentNameById,
    user
  );
  const doneLabel = todo.markedAsDoneByType
    ? formatActorLabel(
        todo.markedAsDoneByType,
        todo.markedAsDoneByAgentConfigurationId,
        todo.markedAsDoneByUserId,
        agentNameById,
        user
      )
    : null;

  const isAssistantWorkInProgress =
    !!todo.conversationId && todo.status === "in_progress";

  const label = (
    <div className="flex flex-col gap-1">
      {isAssistantWorkInProgress && (
        <div className="text-xs font-medium text-foreground dark:text-foreground-night">
          An Agent is working on this todo.
        </div>
      )}
      <div className="text-xs">
        Created by {creatorLabel} · {formatFriendlyDate(todo.createdAt)}
      </div>
      {todo.doneAt && doneLabel && (
        <div className="text-xs">
          Done by {doneLabel} · {formatFriendlyDate(todo.doneAt)}
        </div>
      )}
      {todo.actorRationale && (
        <div className="max-w-xs text-xs italic opacity-80">
          {todo.actorRationale}
        </div>
      )}
    </div>
  );

  return <Tooltip label={label} tooltipTriggerAsChild trigger={children} />;
}

export function useAgentNameById(
  owner: LightWorkspaceType,
  disabled?: boolean
): Map<string, string> {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    disabled,
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agentConfigurations) {
      map.set(a.sId, a.name);
    }
    return map;
  }, [agentConfigurations]);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function getSourceDisplay(source: ProjectTodoType["sources"][number]) {
  const sourceIconByType: Record<
    ProjectTodoType["sources"][number]["sourceType"],
    React.ComponentType
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

  const originalLabel = source.sourceTitle ?? source.sourceId;
  const customLabel = source.sourceType === "slack" ? "Slack thread" : null;

  return {
    icon: sourceIconByType[source.sourceType],
    label: customLabel ?? originalLabel,
    originalLabel,
    hasCustomLabel: customLabel !== null,
  };
}

export function TodoSources({
  sources,
  owner,
  isDone,
}: {
  sources: ProjectTodoType["sources"];
  owner: LightWorkspaceType;
  isDone: boolean;
}) {
  const router = useAppRouter();

  if (sources.length === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "hidden text-xs md:block",
        isDone
          ? "text-faint dark:text-faint-night line-through"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      From{" "}
      {sources.map((source, index) => (
        <span key={`${source.sourceType}-${source.sourceId}`}>
          {index > 0 && ", "}
          <span
            className={cn(
              "relative inline-block",
              isDone &&
                "after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-1/2 after:border-t after:border-current after:opacity-70"
            )}
          >
            {(() => {
              const { icon, label, originalLabel, hasCustomLabel } =
                getSourceDisplay(source);

              const trigger = (
                <button
                  type="button"
                  className="underline hover:no-underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (!source.sourceUrl) {
                      return;
                    }

                    try {
                      const currentOrigin = window.location.origin;
                      const targetUrl = new URL(
                        source.sourceUrl,
                        currentOrigin
                      );

                      if (targetUrl.origin === currentOrigin) {
                        const internalPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
                        void router.push(internalPath);
                        return;
                      }

                      window.open(
                        targetUrl.toString(),
                        "_blank",
                        "noopener,noreferrer"
                      );
                    } catch {
                      void router.push(source.sourceUrl);
                    }
                  }}
                >
                  <Icon
                    visual={icon}
                    size="xs"
                    className="mr-1 inline-block align-text-bottom opacity-70"
                  />
                  <span>{label}</span>
                </button>
              );

              if (!hasCustomLabel) {
                return trigger;
              }

              return <Tooltip label={originalLabel} trigger={trigger} />;
            })()}
          </span>
        </span>
      ))}
    </span>
  );
}

// ── Filter types & helpers ────────────────────────────────────────────────────

export type TodoAssigneeScope = "mine" | "all" | "users";

export interface TodoOwnerFilter {
  assigneeScope: TodoAssigneeScope;
  selectedUserSIds: string[];
}

export function formatTodoScopeLabel({
  scope,
  selectedUserSIds,
  usersBySId,
  viewerUserId,
}: {
  scope: TodoAssigneeScope;
  selectedUserSIds: Set<string>;
  usersBySId: Map<string, ProjectTodoAssigneeType>;
  viewerUserId: string | null;
}) {
  if (scope === "mine") {
    return "Your to-dos";
  }
  if (scope === "all") {
    return "Project's to-dos";
  }

  if (selectedUserSIds.size === 0) {
    return "To-dos";
  }

  if (selectedUserSIds.size === 1) {
    const [selectedUserSId] = selectedUserSIds;
    const user = usersBySId.get(selectedUserSId);
    if (!user) {
      return "To-dos";
    }

    if (viewerUserId !== null && user.sId === viewerUserId) {
      return "Your to-dos";
    }

    return `${user.fullName}'s to-dos`;
  }

  return `Selected to-dos (${selectedUserSIds.size})`;
}

export function TodoAssigneeHeader({
  user,
  viewerUserId,
  className,
}: {
  user: ProjectTodoAssigneeType | null;
  viewerUserId: string | null;
  className?: string;
}) {
  const isYou = viewerUserId !== null && user?.sId === viewerUserId;

  return (
    <div className={cn("mb-1 mt-2 flex items-center gap-2", className)}>
      <Tooltip
        label={user?.fullName ?? "Unknown user"}
        trigger={
          <Avatar
            size="xxs"
            isRounded
            visual={user?.image ?? "/static/humanavatar/anonymous.png"}
          />
        }
      />
      <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
        {user?.fullName ?? "Unknown user"}
        {isYou ? " (you)" : ""}
      </span>
    </div>
  );
}
