import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import React from "react";
import { useController } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { CREATIVITY_LEVELS } from "@app/components/agent_builder/instructions/utils";

export function CreativityLevelSubmenu() {
  const { field } = useController<
    AgentBuilderFormData,
    "generationSettings.temperature"
  >({
    name: "generationSettings.temperature",
  });

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Creativity level" />
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={field.value?.toString()}>
          {CREATIVITY_LEVELS.map(({ label, value }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value.toString()}
              label={label}
              onClick={() => field.onChange(value)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
