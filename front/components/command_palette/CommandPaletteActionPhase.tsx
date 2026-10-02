import { KeyboardHints } from "@app/components/command_palette/CommandPaletteItems";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  ArrowLeft,
  Avatar,
  cn,
  Edit04,
  Eye,
  Icon,
  MessageCircle01,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteAction =
  | "view_details"
  | "edit"
  | "chat_with"
  | "chat_with_in_pod";

// Pods and conversations navigate directly and never enter the action phase.
export type ActionPhaseItem = Extract<
  CommandPaletteItem,
  { kind: "agent" | "skill" | "member" }
>;

interface CommandPaletteActionPhaseProps {
  workspaceId: string;
  item: ActionPhaseItem;
  onAction: (action: CommandPaletteAction) => void;
  onBack: () => void;
  onClose: () => void;
}

interface ActionDefinition {
  action: CommandPaletteAction;
  label: string;
  description: string;
  icon: typeof Eye;
}

function canEdit(item: ActionPhaseItem, canEditAgent: boolean): boolean {
  switch (item.kind) {
    case "agent":
      return "canEdit" in item.agent ? item.agent.canEdit : canEditAgent;
    case "skill":
      return item.skill.canAdministrate;
    case "member":
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
    default:
      assertNever(item);
  }
}

export function CommandPaletteActionPhase({
  workspaceId,
  item,
  onAction,
  onBack,
  onClose,
}: CommandPaletteActionPhaseProps) {
  const podId = useActivePodId();
  const agentId =
    item.kind === "agent" &&
    !("canEdit" in item.agent) &&
    item.agent.scope !== "global"
      ? item.agent.sId
      : null;
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId: agentId,
    disabled: !agentId,
  });
  const canEditAgent = agentConfiguration?.canEdit ?? false;

  const actions = useMemo(() => {
    const result: ActionDefinition[] = [];
    switch (item.kind) {
      case "agent":
      case "member":
        if (podId) {
          result.push({
            action: "chat_with_in_pod",
            label: "New conversation in pod",
            description: "Open a new conversation in the active pod",
            icon: MessageCircle01,
          });
        }
        result.push({
          action: "chat_with",
          label: "New conversation",
          description: "Open a new conversation",
          icon: MessageCircle01,
        });
        break;
      case "skill":
        break;
      default:
        assertNever(item);
    }
    result.push({
      action: "view_details",
      label: "Details",
      description:
        item.kind === "member"
          ? "View profile"
          : "View description and settings",
      icon: Eye,
    });
    if (canEdit(item, canEditAgent)) {
      result.push({
        action: "edit",
        label: "Edit",
        description: "Change instructions and settings",
        icon: Edit04,
      });
    }
    return result;
  }, [item, canEditAgent, podId]);

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
      case "Backspace":
        e.preventDefault();
        onBack();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
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
          { keys: ["↑", "↓"], label: "Navigate" },
          { keys: ["↵"], label: "Select" },
          { keys: ["⌫"], label: "Back", textSize: "text-base" },
          { keys: ["Esc"], label: "Close" },
        ]}
      />
    </div>
  );
}
