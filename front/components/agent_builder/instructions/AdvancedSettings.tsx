import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { CreativityLevelSubmenu } from "@app/components/agent_builder/instructions/CreativityLevelSubmenu";
import { ModelSelectionSubmenu } from "@app/components/agent_builder/instructions/ModelSelectionSubmenu";
import { ResponseFormatSubmenu } from "@app/components/agent_builder/instructions/ResponseFormatSubmenu";
import { useModels } from "@app/lib/swr/models";
import { isSupportingResponseFormat } from "@app/types";

export function AdvancedSettings() {
  const { owner } = useAgentBuilderContext();
  const { models } = useModels({ owner });
  const { field } = useController<AgentBuilderFormData, "generationSettings">({
    name: "generationSettings",
  });

  if (!models) {
    return null;
  }

  const supportsResponseFormat = isSupportingResponseFormat(
    field.value.modelSettings.modelId
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Advanced settings"
          variant="outline"
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ModelSelectionSubmenu
          generationSettings={field.value}
          setGenerationSettings={field.onChange}
          models={models}
        />

        <CreativityLevelSubmenu
          generationSettings={field.value}
          setGenerationSettings={field.onChange}
        />

        {supportsResponseFormat && (
          <ResponseFormatSubmenu
            generationSettings={field.value}
            setGenerationSettings={field.onChange}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
