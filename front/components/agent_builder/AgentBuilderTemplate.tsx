import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListAddIcon,
  Markdown,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import React, { useContext } from "react";
import { useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfirmContext } from "@app/components/Confirm";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";

interface AgentBuilderTemplateProps {
  assistantTemplate: FetchAssistantTemplateResponse;
}

export function AgentBuilderTemplate({
  assistantTemplate,
}: AgentBuilderTemplateProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-4">
        <TemplateButtons assistantTemplate={assistantTemplate} />
        {assistantTemplate.helpInstructions && (
          <>
            <Markdown content={assistantTemplate.helpInstructions} />
            {assistantTemplate.helpActions && (
              <div className="h-px bg-border" />
            )}
          </>
        )}
        {assistantTemplate.helpActions && (
          <Markdown content={assistantTemplate.helpActions} />
        )}
      </div>
    </div>
  );
}

interface TemplateButtonsProps {
  assistantTemplate: FetchAssistantTemplateResponse;
}

function TemplateButtons({ assistantTemplate }: TemplateButtonsProps) {
  const confirm = useContext(ConfirmContext);
  const { setValue } = useFormContext<AgentBuilderFormData>();

  const handleResetInstructions = async () => {
    const confirmed = await confirm({
      title: "Are you sure?",
      message:
        "You will lose the changes you have made to the agent's instructions and go back to the template's default settings.",
      validateVariant: "warning",
    });

    if (confirmed && assistantTemplate.presetInstructions) {
      setValue("instructions", assistantTemplate.presetInstructions);
    }
  };

  const handleResetActions = async () => {
    const confirmed = await confirm({
      title: "Are you sure?",
      message: "You will lose the changes you have made to the agent's tools.",
      validateVariant: "warning",
    });

    if (confirmed) {
      setValue("actions", []);
    }
  };

  return (
    <div className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="Reset" size="sm" variant="outline" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            label="Reset instructions"
            description="Set instructions back to template's default"
            icon={PencilSquareIcon}
            onClick={handleResetInstructions}
            disabled={!assistantTemplate.presetInstructions}
          />
          <DropdownMenuItem
            label="Reset tools"
            description="Remove all tools"
            icon={ListAddIcon}
            onClick={handleResetActions}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
