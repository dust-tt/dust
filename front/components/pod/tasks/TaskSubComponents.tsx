import { timeAgoFrom } from "@app/lib/client/relative_time";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
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
import { msg, select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useMemo } from "react";

// ── Metadata tooltip ──────────────────────────────────────────────────────────

type TaskActor =
  | { kind: "someone" | "agent" | "you" | "user" }
  | { kind: "named"; name: string };

function getTaskActor(
  type: PodTaskActorType | null,
  agentId: string | null,
  userId: string | null,

  agentNameById: Map<string, string>,
  currentUser: UserTypeWithWorkspaces | null
): TaskActor {
  if (!type) {
    return { kind: "someone" };
  }
  switch (type) {
    case "agent":
      if (agentId === POD_MANAGER_AGENT_SID || agentId === "project_manager") {
        return { kind: "named", name: "Dust" };
      }
      const name = agentId ? agentNameById.get(agentId) : null;
      return name ? { kind: "named", name } : { kind: "agent" };
    case "user":
      if (userId === currentUser?.sId) {
        return { kind: "you" };
      }
      return { kind: "user" };
    default:
      assertNeverAndIgnore(type);
      return { kind: "someone" };
  }
}

function formatFriendlyDate(value: Date | string): string {
  return timeAgoFrom(new Date(value).getTime(), { useLongFormat: true });
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
  const { t } = useLingui();
  const { user } = useUser();

  const creator = getTaskActor(
    task.createdByType,
    task.createdByAgentConfigurationId,
    task.createdByUserId,
    agentNameById,
    user
  );
  const doneBy = task.markedAsDoneByType
    ? getTaskActor(
        task.markedAsDoneByType,
        task.markedAsDoneByAgentConfigurationId,
        task.markedAsDoneByUserId,
        agentNameById,
        user
      )
    : null;
  const createdAt = formatFriendlyDate(task.createdAt);
  const doneAt = task.doneAt ? formatFriendlyDate(task.doneAt) : null;
  const taskId = task.sId;
  const creatorKind = creator.kind;
  const creatorName = creator.kind === "named" ? creator.name : "";
  const createdLabel = t`${select(creatorKind, {
    someone: `Created by someone · ${createdAt}`,
    agent: `Created by an agent · ${createdAt}`,
    you: `Created by you · ${createdAt}`,
    user: `Created by a user · ${createdAt}`,
    other: `Created by ${creatorName} · ${createdAt}`,
  })}`;
  const doneByKind = doneBy?.kind ?? "someone";
  const doneByName = doneBy?.kind === "named" ? doneBy.name : "";
  const doneLabel =
    doneAt && doneBy
      ? t`${select(doneByKind, {
          someone: `Done by someone · ${doneAt}`,
          agent: `Done by an agent · ${doneAt}`,
          you: `Done by you · ${doneAt}`,
          user: `Done by a user · ${doneAt}`,
          other: `Done by ${doneByName} · ${doneAt}`,
        })}`
      : null;

  const isAssistantWorkInProgress =
    !!task.conversationId && task.status === "in_progress";

  const label = (
    <div className="flex flex-col gap-1">
      {isAssistantWorkInProgress && (
        <div className="text-xs font-medium text-foreground">
          <Trans>An agent is working on this task.</Trans>
        </div>
      )}
      <div className="text-xs">{createdLabel}</div>
      {doneLabel && <div className="text-xs">{doneLabel}</div>}
      {task.actorRationale && (
        <div className="max-w-xs text-xs italic opacity-80">
          {task.actorRationale}
        </div>
      )}
      {task.agentSuggestionStatus === "pending" ? (
        <div className="break-all font-mono text-[11px] tabular-nums text-muted-foreground">
          <Trans>ID: {taskId}</Trans>
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

const SLACK_THREAD_LABEL = msg`Slack thread`;

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
  const customLabel = source.sourceType === "slack" ? SLACK_THREAD_LABEL : null;

  return {
    icon: sourceIconByType[source.sourceType],
    customLabel,
    originalLabel,
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
  const { t } = useLingui();
  const router = useAppRouter();

  if (sources.length === 0) {
    return null;
  }

  const sourceLinks = sources.map((source, index) => (
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
          const { icon, customLabel, originalLabel } = getSourceDisplay(source);
          const label = customLabel ? t(customLabel) : originalLabel;

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
                  const targetUrl = new URL(source.sourceUrl, currentOrigin);

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

          if (!customLabel) {
            return trigger;
          }

          return <Tooltip label={originalLabel} trigger={trigger} />;
        })()}
      </span>
    </span>
  ));

  return (
    <span
      className={cn(
        "hidden text-xs md:block",
        isDone ? "text-faint line-through" : "text-muted-foreground"
      )}
    >
      <Trans>From {sourceLinks}</Trans>
    </span>
  );
}
