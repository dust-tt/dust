import { KeyboardHints } from "@app/components/command_palette/CommandPaletteItems";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  ArrowLeftIcon,
  Avatar,
  ChatBubbleBottomCenterTextIcon,
  cn,
  EyeIcon,
  Icon,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteAction = "view_details" | "edit" | "chat_with";

interface CommandPaletteActionPhaseProps {
  item: CommandPaletteItem;
  onAction: (action: CommandPaletteAction) => void;
  onBack: () => void;
  onClose: () => void;
}

interface ActionDefinition {
  action: CommandPaletteAction;
  label: string;
  description: string;
  icon: typeof EyeIcon;
}

function canEdit(item: CommandPaletteItem): boolean {
  switch (item.kind) {
    case "agent":
      return item.agent.canEdit;
    case "skill":
      return item.skill.canWrite;
  }
}

export function CommandPaletteActionPhase({
  item,
  onAction,
  onBack,
  onClose,
}: CommandPaletteActionPhaseProps) {
  const actions = useMemo(() => {
    const result: ActionDefinition[] = [];
    if (item.kind === "agent") {
      result.push({
        action: "chat_with",
        label: "New conversation",
        description: "Open a new conversation",
        icon: ChatBubbleBottomCenterTextIcon,
      });
    }
    result.push({
      action: "view_details",
      label: "Details",
      description: "View description and settings",
      icon: EyeIcon,
    });
    if (canEdit(item)) {
      result.push({
        action: "edit",
        label: "Edit",
        description: "Change instructions and settings",
        icon: PencilSquareIcon,
      });
    }
    return result;
  }, [item]);

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

  const itemName =
    item.kind === "agent" ? `@${item.agent.name}` : item.skill.name;

  const itemAvatar =
    item.kind === "agent" ? (
      <Avatar visual={item.agent.pictureUrl} size="xs" />
    ) : (
      React.createElement(getSkillAvatarIcon(item.skill.icon), { size: "xs" })
    );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col outline-none"
    >
      <button
        className={cn(
          "flex items-center gap-2 border-b px-4 py-3",
          "border-separator dark:border-separator-night",
          "text-sm text-muted-foreground dark:text-muted-foreground-night",
          "transition-colors duration-100",
          "hover:text-foreground dark:hover:text-foreground-night"
        )}
        onClick={onBack}
      >
        <Icon visual={ArrowLeftIcon} size="sm" />
        {itemAvatar}
        <span className="font-medium text-foreground dark:text-foreground-night">
          {itemName}
        </span>
      </button>

      <div className="p-1.5">
        {actions.map(({ action, label, description, icon }, i) => (
          <div
            key={action}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-100",
              "text-foreground dark:text-foreground-night",
              selectedIndex === i
                ? "bg-primary-100 dark:bg-primary-100-night"
                : "hover:bg-muted-background dark:hover:bg-muted-background-night"
            )}
            onClick={() => onAction(action)}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            <Icon visual={icon} size="sm" className="shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
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
          { keys: ["←"], label: "Back" },
          { keys: ["Esc"], label: "Close" },
        ]}
      />
    </div>
  );
}
