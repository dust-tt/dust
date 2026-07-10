import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { DropdownMenuItemProps } from "@dust-tt/sparkle";
import {
  Button,
  Chip,
  DotsHorizontal,
  DropdownMenuItem,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useRef } from "react";

interface CapabilityPickerItemBase {
  description?: string;
  icon: DropdownMenuItemProps["icon"];
  id: string;
  label: string;
  sortName: string;
}

export interface SkillCapabilityPickerItem extends CapabilityPickerItemBase {
  kind: "skill";
  skill: SkillWithoutInstructionsAndToolsType;
}

interface ToolCapabilityPickerItem extends CapabilityPickerItemBase {
  kind: "tool";
  serverView: MCPServerViewType;
}

interface UninstalledToolCapabilityPickerItem extends CapabilityPickerItemBase {
  kind: "uninstalled_tool";
  server: MCPServerType;
}

export type CapabilityPickerItem =
  | SkillCapabilityPickerItem
  | ToolCapabilityPickerItem
  | UninstalledToolCapabilityPickerItem;

interface SkillCapabilityPickerIconProps {
  skill: SkillWithoutInstructionsAndToolsType;
}

export function SkillCapabilityPickerIcon({
  skill,
}: SkillCapabilityPickerIconProps) {
  const SkillAvatar = getSkillAvatarIcon(skill);

  return <SkillAvatar size="xs" />;
}

export function getSkillCapabilityPickerItem(
  skill: SkillWithoutInstructionsAndToolsType
): SkillCapabilityPickerItem {
  return {
    kind: "skill",
    skill,
    id: `skills-picker-${skill.sId}`,
    icon: <SkillCapabilityPickerIcon skill={skill} />,
    label: skill.name,
    sortName: skill.name.toLowerCase(),
    description: skill.userFacingDescription,
  };
}

interface CapabilityDetailsButtonProps {
  onClick: () => void;
}

function CapabilityDetailsButton({ onClick }: CapabilityDetailsButtonProps) {
  return (
    <Button
      icon={DotsHorizontal}
      variant="outline"
      size="mini"
      className="opacity-0 group-data-[highlighted]:opacity-100 group-focus-within:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
    />
  );
}

interface CapabilitiesPickerItemsListProps<T extends CapabilityPickerItem> {
  emptyMessage: string;
  items: T[];
  onItemSelect: (item: T) => void;
  onSkillDetails?: (skillId: string) => void;
  onToolDetails?: (serverView: MCPServerViewType) => void;
}

export function CapabilitiesPickerItemsList<T extends CapabilityPickerItem>({
  emptyMessage,
  items,
  onItemSelect,
  onSkillDetails,
  onToolDetails,
}: CapabilitiesPickerItemsListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={listRef}>
      {items.map((item) => {
        let endComponent: ReactNode;

        switch (item.kind) {
          case "skill":
            endComponent = onSkillDetails ? (
              <CapabilityDetailsButton
                onClick={() => onSkillDetails(item.skill.sId)}
              />
            ) : null;
            break;
          case "tool":
            endComponent = onToolDetails ? (
              <CapabilityDetailsButton
                onClick={() => onToolDetails(item.serverView)}
              />
            ) : null;
            break;
          case "uninstalled_tool":
            endComponent = <Chip size="xs" color="info" label="Configure" />;
            break;
          default:
            assertNeverAndIgnore(item);
            endComponent = null;
        }

        return (
          <DropdownMenuItem
            key={item.id}
            icon={item.icon}
            itemId={item.id}
            label={item.label}
            description={item.description}
            truncateText
            endComponent={endComponent}
            className="group"
            onClick={() => onItemSelect(item)}
          />
        );
      })}
    </div>
  );
}
