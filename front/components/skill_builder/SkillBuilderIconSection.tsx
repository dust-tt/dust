import {
  ActionIcons,
  ActionPlusIcon,
  Avatar,
  Button,
  IconPicker,
  PencilSquareIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useController } from "react-hook-form";

import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";

const DEFAULT_ICON = ActionPlusIcon;

export function SkillBuilderIconSection() {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { field: iconField } = useController<SkillBuilderFormData, "icon">({
    name: "icon",
  });

  const toActionIconKey = (v?: string | null) =>
    v && v in ActionIcons ? (v as keyof typeof ActionIcons) : undefined;

  const selectedIconName =
    toActionIconKey(iconField.value) ??
    (DEFAULT_ICON.name as keyof typeof ActionIcons);
  const IconComponent = ActionIcons[selectedIconName] || DEFAULT_ICON;

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  return (
    <PopoverRoot open={isPopoverOpen}>
      <PopoverTrigger asChild>
        <div className="group relative">
          <Avatar
            size="lg"
            visual={<IconComponent className="h-8 w-8 text-muted-foreground" />}
          />
          <Button
            variant="outline"
            size="sm"
            icon={PencilSquareIcon}
            type="button"
            onClick={() => setIsPopoverOpen(true)}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-fit py-0"
        onInteractOutside={closePopover}
        onEscapeKeyDown={closePopover}
      >
        <IconPicker
          icons={ActionIcons}
          selectedIcon={selectedIconName}
          onIconSelect={(iconName: string) => {
            iconField.onChange(iconName);
            closePopover();
          }}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}
