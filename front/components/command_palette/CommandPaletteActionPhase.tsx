import { KeyboardHints } from "@app/components/command_palette/CommandPaletteItems";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  ArrowLeft,
  ArrowRight,
  Avatar,
  cn,
  Edit04,
  Eye,
  Icon,
  MessageCircle01,
  Star01,
  StarFilled,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType } from "react";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteAction =
  | "view_details"
  | "edit"
  | "chat_with"
  | "chat_with_in_pod"
  | "go"
  | "star"
  | "unstar"
  | "favorite"
  | "unfavorite";

export type ActionPhaseItem = Extract<
  CommandPaletteItem,
  { kind: "agent" | "skill" | "member" | "pod" }
>;

interface CommandPaletteActionPhaseProps {
  workspaceId: string;
  item: ActionPhaseItem;
  onAction: (action: CommandPaletteAction) => void;
  onBack: () => void;
}

interface ActionDefinition {
  action: CommandPaletteAction;
  label: string;
  description: string;
  icon: ComponentType;
}

function canEdit(item: ActionPhaseItem, canEditAgent: boolean): boolean {
  switch (item.kind) {
    case "agent":
      return "canEdit" in item.agent ? item.agent.canEdit : canEditAgent;
    case "skill":
      return item.skill.canAdministrate;
    case "member":
    case "pod":
      return false;
    default:
      assertNever(item);
  }
}

function getItemName(item: ActionPhaseItem): string {
  switch (item.kind) {
    case "agent":
      return item.agent.name;
    case "member":
      return item.member.fullName;
    case "skill":
      return item.skill.name;
    case "pod":
      return item.pod.name;
    default:
      assertNever(item);
  }
}

function getItemAvatar(item: ActionPhaseItem): React.ReactNode {
  switch (item.kind) {
    case "agent":
      return <Avatar visual={item.agent.pictureUrl} size="xs" />;
    case "member":
      return (
        <Avatar
          name={item.member.fullName}
          visual={item.member.image ?? undefined}
          size="xs"
          isRounded
        />
      );
    case "skill":
      return React.createElement(getSkillAvatarIcon(item.skill), {
        size: "xs",
      });
    case "pod":
      return <Icon visual={getSpaceIcon(item.pod)} size="xs" />;
    default:
      assertNever(item);
  }
}

function getAgentIsFavorite(
  item: Extract<ActionPhaseItem, { kind: "agent" }>,
  fetchedUserFavorite: boolean | undefined
): boolean {
  if ("userFavorite" in item.agent) {
    return item.agent.userFavorite;
  }
  return fetchedUserFavorite ?? false;
}

export function CommandPaletteActionPhase({
  workspaceId,
  item,
  onAction,
  onBack,
}: CommandPaletteActionPhaseProps) {
  const { t } = useLingui();
  const podId = useActivePodId();
  const needsAgentFetch =
    item.kind === "agent" &&
    (!("canEdit" in item.agent) || !("userFavorite" in item.agent));
  const agentId = needsAgentFetch ? item.agent.sId : null;
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId: agentId,
    disabled: !agentId,
  });
  const canEditAgent = agentConfiguration?.canEdit ?? false;
  const fetchedUserFavorite = agentConfiguration?.userFavorite;

  // Same source as the sidebar starred section — more reliable than search hits,
  // which may be stale or omit isStarred for frecency suggestions.
  const { summary: podSummary } = usePodConversationsSummary({
    workspaceId,
    options: { disabled: item.kind !== "pod" },
  });

  const actions = useMemo(() => {
    const result: ActionDefinition[] = [];
    switch (item.kind) {
      case "agent": {
        if (podId) {
          result.push({
            action: "chat_with_in_pod",
            label: t`New conversation in pod`,
            description: t`Open a new conversation in the active pod`,
            icon: MessageCircle01,
          });
        }
        result.push({
          action: "chat_with",
          label: t`New conversation`,
          description: t`Open a new conversation`,
          icon: MessageCircle01,
        });
        result.push({
          action: "view_details",
          label: t`Details`,
          description: t`View description and settings`,
          icon: Eye,
        });
        if (canEdit(item, canEditAgent)) {
          result.push({
            action: "edit",
            label: t`Edit`,
            description: t`Change instructions and settings`,
            icon: Edit04,
          });
        }
        const isFavorite = getAgentIsFavorite(item, fetchedUserFavorite);
        result.push({
          action: isFavorite ? "unfavorite" : "favorite",
          label: isFavorite ? t`Remove from favorites` : t`Add to favorites`,
          description: isFavorite
            ? t`Remove this agent from your favorites`
            : t`Add this agent to your favorites`,
          icon: isFavorite ? StarFilled : Star01,
        });
        break;
      }
      case "member":
        if (podId) {
          result.push({
            action: "chat_with_in_pod",
            label: t`New conversation in pod`,
            description: t`Open a new conversation in the active pod`,
            icon: MessageCircle01,
          });
        }
        result.push({
          action: "chat_with",
          label: t`New conversation`,
          description: t`Open a new conversation`,
          icon: MessageCircle01,
        });
        result.push({
          action: "view_details",
          label: t`Details`,
          description: t`View profile`,
          icon: Eye,
        });
        break;
      case "skill":
        result.push({
          action: "view_details",
          label: t`Details`,
          description: t`View description and settings`,
          icon: Eye,
        });
        if (canEdit(item, canEditAgent)) {
          result.push({
            action: "edit",
            label: t`Edit`,
            description: t`Change instructions and settings`,
            icon: Edit04,
          });
        }
        break;
      case "pod": {
        result.push({
          action: "go",
          label: t`Go`,
          description: t`Open this Pod`,
          icon: ArrowRight,
        });
        const isStarred =
          podSummary.find((entry) => entry.space.sId === item.pod.sId)?.space
            .isStarred ?? item.pod.isStarred;
        result.push({
          action: isStarred ? "unstar" : "star",
          label: isStarred ? t`Remove from starred` : t`Add to starred`,
          description: isStarred
            ? t`Remove this Pod from your starred list`
            : t`Add this Pod to your starred list`,
          icon: isStarred ? StarFilled : Star01,
        });
        break;
      }
      default:
        assertNever(item);
    }
    return result;
  }, [item, canEditAgent, fetchedUserFavorite, podId, podSummary, t]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Reset selection when the available actions change (e.g., switching between items).
  // biome-ignore lint/correctness/useExhaustiveDependencies: actions is an intentional trigger
  useEffect(() => {
    setSelectedIndex(0);
  }, [actions]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % actions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + actions.length) % actions.length
        );
        break;
      case "Enter":
        e.preventDefault();
        onAction(actions[selectedIndex].action);
        break;
      case "ArrowLeft":
      case "Backspace":
      case "Escape":
        e.preventDefault();
        onBack();
        break;
    }
  }

  const itemName = getItemName(item);
  const itemAvatar = getItemAvatar(item);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col outline-hidden"
    >
      <button
        className={cn(
          "flex items-center gap-2 border-b px-4 py-3",
          "border-separator",
          "text-sm text-muted-foreground",
          "transition-colors duration-100",
          "hover:text-foreground"
        )}
        onClick={onBack}
      >
        <Icon visual={ArrowLeft} size="sm" />
        {itemAvatar}
        <span className="font-medium text-foreground">{itemName}</span>
      </button>

      <div className="p-1.5">
        {actions.map(({ action, label, description, icon }, i) => (
          <div
            key={action}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-100",
              "text-foreground",
              selectedIndex === i
                ? "bg-primary-100"
                : "hover:bg-muted-background"
            )}
            onClick={() => onAction(action)}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            <Icon visual={icon} size="sm" className="shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">
                {description}
              </span>
            </div>
          </div>
        ))}
      </div>
      <KeyboardHints
        hints={[
          { keys: ["↑", "↓"], label: t`Navigate` },
          { keys: ["↵"], label: t`Select` },
          { keys: ["←", "Esc"], label: t`Back` },
        ]}
      />
    </div>
  );
}
