import {
  BookOpenIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListAddIcon,
  Markdown,
  Page,
  PencilSquareIcon,
  Separator,
} from "@dust-tt/sparkle";
import React, { useContext } from "react";
import { useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfirmContext } from "@app/components/Confirm";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { MultiActionPreset, TemplateActionPreset } from "@app/types";

interface AgentBuilderTemplateProps {
  assistantTemplate: FetchAssistantTemplateResponse;
  onAddPresetAction?: (presetAction: TemplateActionPreset) => void;
}

export function AgentBuilderTemplate({
  assistantTemplate,
  onAddPresetAction,
}: AgentBuilderTemplateProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6">
      <div className="flex flex-col gap-4">
        <TemplateButtons assistantTemplate={assistantTemplate} />
        {assistantTemplate.helpInstructions && (
          <>
            <Markdown content={assistantTemplate.helpInstructions} />
            {assistantTemplate.helpActions && <Separator />}
          </>
        )}
        {assistantTemplate.helpActions && (
          <Markdown content={assistantTemplate.helpActions} />
        )}
        {assistantTemplate.presetActions &&
          assistantTemplate.presetActions.length > 0 && (
            <>
              <Separator />
              <TemplatePresetActions
                presetActions={assistantTemplate.presetActions}
                onAddAction={onAddPresetAction}
              />
            </>
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

  const handleResetInstructions = () => {
    // Defer confirm dialog to next tick to allow dropdown to close properly
    setTimeout(async () => {
      const confirmed = await confirm({
        title: "Are you sure?",
        message:
          "You will lose the changes you have made to the agent's instructions and go back to the template's default settings.",
        validateVariant: "warning",
      });

      if (confirmed && assistantTemplate.presetInstructions) {
        setValue("instructions", assistantTemplate.presetInstructions);
      }
    }, 0);
  };

  const handleResetActions = () => {
    // Defer confirm dialog to next tick to allow dropdown to close properly
    setTimeout(async () => {
      const confirmed = await confirm({
        title: "Are you sure?",
        message:
          "You will lose the changes you have made to the agent's tools.",
        validateVariant: "warning",
      });

      if (confirmed) {
        setValue("actions", []);
      }
    }, 0);
  };

  return (
    <div className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label="Reset" size="sm" variant="outline" isSelect />
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

interface TemplatePresetActionsProps {
  presetActions: TemplateActionPreset[];
  onAddAction?: (presetAction: TemplateActionPreset) => void;
}

function TemplatePresetActions({
  presetActions,
  onAddAction,
}: TemplatePresetActionsProps) {
  const getActionIcon = (type: MultiActionPreset) => {
    if (
      type === "RETRIEVAL_SEARCH" ||
      type === "TABLES_QUERY" ||
      type === "PROCESS"
    ) {
      return BookOpenIcon;
    }
    return ListAddIcon;
  };

  const getActionLabel = (type: MultiActionPreset) => {
    switch (type) {
      case "RETRIEVAL_SEARCH":
        return "Search Data";
      case "TABLES_QUERY":
        return "Query Tables";
      case "PROCESS":
        return "Extract Data";
      case "WEB_NAVIGATION":
        return "Add Web Search";
      default:
        return "Add tool";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Page.SectionHeader title="Suggested knowledge & tools" />
      {presetActions.map((presetAction, index) => (
        <div className="flex flex-col gap-2" key={index}>
          <div className="text-sm text-foreground">{presetAction.help}</div>
          <div>
            <Button
              label={getActionLabel(presetAction.type)}
              icon={getActionIcon(presetAction.type)}
              size="sm"
              variant="outline"
              onClick={() => onAddAction?.(presetAction)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
