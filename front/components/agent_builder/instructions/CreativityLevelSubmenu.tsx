import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import { CREATIVITY_LEVELS } from "@app/components/agent_builder/instructions/utils";
import type { AgentBuilderGenerationSettings } from "@app/components/agent_builder/AgentBuilderFormContext";

interface CreativityLevelSubmenuProps {
  generationSettings: AgentBuilderGenerationSettings;
  setGenerationSettings: (
    generationSettings: AgentBuilderGenerationSettings
  ) => void;
}

export function CreativityLevelSubmenu({
  generationSettings,
  setGenerationSettings,
}: CreativityLevelSubmenuProps) {
  const handleCreativityChange = (temperature: number) => {
    setGenerationSettings({
      ...generationSettings,
      temperature,
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Creativity level" />
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={generationSettings?.temperature.toString()}
        >
          {CREATIVITY_LEVELS.map(({ label, value }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value.toString()}
              label={label}
              onClick={() => handleCreativityChange(value)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
