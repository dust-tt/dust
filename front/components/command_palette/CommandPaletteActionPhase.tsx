import { KeyboardHints } from "@app/components/command_palette/CommandPaletteItems";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArrowLeft,
  Avatar,
  cn,
  Edit04,
  Eye,
  Icon,
  LoadingBlock,
  MessageCircle01,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteAction = "view_details" | "edit" | "chat_with";

// Pods navigate directly and never enter the action phase.
export type ActionPhaseItem = Extract<
  CommandPaletteItem,
  { kind: "agent" | "skill" }
>;

interface CommandPaletteActionPhaseProps {
  owner: LightWorkspaceType;
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

export function CommandPaletteActionPhase({
  owner,
  item,
  onAction,
  onBack,
  onClose,
}: CommandPaletteActionPhaseProps) {
  // Search results don't contain action permissions. Fetch only the selected skill.
  const { skill, isSkillLoading, isSkillError } = useSkill({
    workspaceId: owner.sId,
    skillId:
      item.kind === "skill" && !("canAdministrate" in item.skill)
        ? item.skill.sId
        : null,
  });
  const canEdit =
    item.kind === "agent"
      ? item.agent.canEdit
      : "canAdministrate" in item.skill
        ? item.skill.canAdministrate
        : (skill?.canAdministrate ?? false);

  useEffect(() => {
    if (skill && !skill.canAdministrate) {
      onAction("view_details");
    }
  }, [skill, onAction]);

  const actions = useMemo(() => {
    const result: ActionDefinition[] = [];
    if (item.kind === "agent") {
      result.push({
        action: "chat_with",
        label: "New conversation",
        description: "Open a new conversation",
        icon: MessageCircle01,
      });
    }
    result.push({
      action: "view_details",
      label: "Details",
      description: "View description and settings",
      icon: Eye,
    });
    if (canEdit) {
      result.push({
        action: "edit",
        label: "Edit",
        description: "Change instructions and settings",
        icon: Edit04,
      });
    }
    return result;
  }, [item, canEdit]);

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
        if (!isSkillLoading) {
          onAction(actions[selectedIndex].action);
        }
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

  const itemName = item.kind === "agent" ? item.agent.name : item.skill.name;

  const itemAvatar =
    item.kind === "agent" ? (
      <Avatar visual={item.agent.pictureUrl} size="xs" />
    ) : (
      React.createElement(getSkillAvatarIcon(item.skill), {
        size: "xs",
      })
    );

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
        {isSkillError && (
          <div role="alert" className="px-3 py-2 text-sm text-muted-foreground">
            Could not load skill actions. Open details to try again.
          </div>
        )}
        {isSkillLoading ? (
          <LoadingBlock className="m-3 h-12 rounded-lg" />
        ) : (
          actions.map(({ action, label, description, icon }, i) => (
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
          ))
        )}
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
