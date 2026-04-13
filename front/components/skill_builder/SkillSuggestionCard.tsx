import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type {
  SkillInstructionEditItemType,
  SkillSuggestionType,
  SkillToolEditItemType,
} from "@app/types/suggestions/skill_suggestion";
import { Button, Card, Chip, DiffBlock } from "@dust-tt/sparkle";
import { useMemo } from "react";

function useToolDisplayNames(
  toolEdits: SkillToolEditItemType[]
): Map<string, string> {
  const { mcpServerViews } = useMCPServerViewsContext();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const edit of toolEdits) {
      const view = mcpServerViews.find((v) => v.sId === edit.toolId);
      map.set(
        edit.toolId,
        view ? getMcpServerViewDisplayName(view) : edit.toolId
      );
    }
    return map;
  }, [toolEdits, mcpServerViews]);
}

interface ToolEditsSectionProps {
  toolEdits: SkillToolEditItemType[];
}

function ToolEditsSection({ toolEdits }: ToolEditsSectionProps) {
  const displayNames = useToolDisplayNames(toolEdits);

  const toolsToAdd = toolEdits.filter((e) => e.action === "add");
  const toolsToRemove = toolEdits.filter((e) => e.action === "remove");

  return (
    <div className="flex flex-col gap-2">
      {toolsToAdd.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground dark:text-foreground-night">
            Tools to add
          </span>
          <div className="flex flex-wrap gap-2">
            {toolsToAdd.map((edit) => (
              <Chip
                key={edit.toolId}
                size="sm"
                color="highlight"
                label={displayNames.get(edit.toolId) ?? edit.toolId}
              />
            ))}
          </div>
        </div>
      )}
      {toolsToRemove.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground dark:text-foreground-night">
            Tools to remove
          </span>
          <div className="flex flex-wrap gap-2">
            {toolsToRemove.map((edit) => (
              <Chip
                key={edit.toolId}
                size="sm"
                color="warning"
                label={displayNames.get(edit.toolId) ?? edit.toolId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
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
        <ToolEditsSection toolEdits={toolEdits} />
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
