import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type {
  SkillInstructionEditItemType,
  SkillSuggestionType,
  SkillToolEditItemType,
} from "@app/types/suggestions/skill_suggestion";
import {
  Button,
  Card,
  Chip,
  DiffBlock,
  PlusIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

function useToolDisplayName(toolId: string): string {
  const { mcpServerViews } = useMCPServerViewsContext();

  return useMemo(() => {
    const view = mcpServerViews.find((v) => v.sId === toolId);
    if (!view) {
      return toolId;
    }
    return getMcpServerViewDisplayName(view);
  }, [mcpServerViews, toolId]);
}

interface ToolEditChipProps {
  toolEdit: SkillToolEditItemType;
}

function ToolEditChip({ toolEdit }: ToolEditChipProps) {
  const displayName = useToolDisplayName(toolEdit.toolId);
  const isAdd = toolEdit.action === "add";

  return (
    <Chip
      size="sm"
      color={isAdd ? "highlight" : "warning"}
      icon={isAdd ? PlusIcon : XMarkIcon}
      label={displayName}
    />
  );
}

interface InstructionEditBlockProps {
  edit: SkillInstructionEditItemType;
}

function InstructionEditBlock({ edit }: InstructionEditBlockProps) {
  const changes = [
    {
      old: edit.old_string,
      new: edit.new_string || undefined,
    },
  ];

  return <DiffBlock changes={changes} />;
}

interface SkillSuggestionCardProps {
  suggestion: SkillSuggestionType;
  onAccept: (suggestion: SkillSuggestionType) => void;
  onDecline: (suggestion: SkillSuggestionType) => void;
}

export function SkillSuggestionCard({
  suggestion,
  onAccept,
  onDecline,
}: SkillSuggestionCardProps) {
  const { instructionEdits, toolEdits } = suggestion.suggestion;

  return (
    <Card variant="primary" size="md" className="flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="heading-base text-foreground dark:text-foreground-night">
          Suggestion
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Decline"
            onClick={() => onDecline(suggestion)}
          />
          <Button
            variant="highlight"
            size="sm"
            label="Accept"
            onClick={() => onAccept(suggestion)}
          />
        </div>
      </div>

      {suggestion.analysis && (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {suggestion.analysis}
        </p>
      )}

      {toolEdits && toolEdits.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground dark:text-foreground-night">
            Tools
          </span>
          <div className="flex flex-wrap gap-2">
            {toolEdits.map((toolEdit, index) => (
              <ToolEditChip key={index} toolEdit={toolEdit} />
            ))}
          </div>
        </div>
      )}

      {instructionEdits && instructionEdits.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground dark:text-foreground-night">
            Instruction changes
          </span>
          {instructionEdits.map((edit, index) => (
            <InstructionEditBlock key={index} edit={edit} />
          ))}
        </div>
      )}
    </Card>
  );
}
