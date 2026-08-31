import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { timeAgoFrom } from "@app/lib/utils";
import type { PodTaskActorType, PodTaskType } from "@app/types/project_task";
import { POD_MANAGER_AGENT_SID } from "@app/types/project_task";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@app/types/user";
import {
  BookOpen01,
  ConfluenceLogo,
  cn,
  DriveLogo,
  GithubLogo,
  Icon,
  MessageChatSquare,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useMemo } from "react";

// ── Metadata tooltip ──────────────────────────────────────────────────────────

function formatActorLabel(
  type: PodTaskActorType | null,
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
      if (agentId === POD_MANAGER_AGENT_SID || agentId === "project_manager") {
        return "Dust";
      }
      const name = agentId ? agentNameById.get(agentId) : null;
      return name || "an agent";
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

interface TaskMetadataTooltipProps {
  task: PodTaskType;
  agentNameById: Map<string, string>;
  children: React.ReactElement;
}

export function TaskMetadataTooltip({
  task,
  agentNameById,
  children,
}: TaskMetadataTooltipProps) {
  const { user } = useUser();

  const creatorLabel = formatActorLabel(
    task.createdByType,
    task.createdByAgentConfigurationId,
    task.createdByUserId,
    agentNameById,
    user
  );
  const doneLabel = task.markedAsDoneByType
    ? formatActorLabel(
        task.markedAsDoneByType,
        task.markedAsDoneByAgentConfigurationId,
        task.markedAsDoneByUserId,
        agentNameById,
        user
      )
    : null;

  const isAssistantWorkInProgress =
    !!task.conversationId && task.status === "in_progress";

  const label = (
    <div className="flex flex-col gap-1">
      {isAssistantWorkInProgress && (
        <div className="text-xs font-medium text-foreground">
          An agent is working on this task.
        </div>
      )}
      <div className="text-xs">
        Created by {creatorLabel} · {formatFriendlyDate(task.createdAt)}
      </div>
      {task.doneAt && doneLabel && (
        <div className="text-xs">
          Done by {doneLabel} · {formatFriendlyDate(task.doneAt)}
        </div>
      )}
      {task.actorRationale && (
        <div className="max-w-xs text-xs italic opacity-80">
          {task.actorRationale}
        </div>
      )}
      {task.agentSuggestionStatus === "pending" ? (
        <div className="break-all font-mono text-[11px] tabular-nums text-muted-foreground">
          ID: {task.sId}
        </div>
      ) : null}
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

function getSourceDisplay(source: PodTaskType["sources"][number]) {
  const sourceIconByType: Record<
    PodTaskType["sources"][number]["sourceType"],
    React.ComponentType
  > = {
    project_conversation: MessageChatSquare,
    project_knowledge: BookOpen01,
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

export function TaskSources({
  sources,
  owner,
  isDone,
}: {
  sources: PodTaskType["sources"];
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
        isDone ? "text-faint line-through" : "text-muted-foreground"
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
