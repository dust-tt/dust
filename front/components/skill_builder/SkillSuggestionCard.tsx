import { useMaybeMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getBlockOuterHtml } from "@app/components/shared/utils";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import type {
  SkillInstructionEditItemType,
  SkillSuggestionType,
  SkillToolEditItemType,
} from "@app/types/suggestions/skill_suggestion";
import { Button, Card, Chip, DiffBlock } from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";

function useToolDisplayNames(
  toolEdits: SkillToolEditItemType[]
): Map<string, string> {
  const ctx = useMaybeMCPServerViewsContext();

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const edit of toolEdits) {
      const view = ctx?.mcpServerViews.find((v) => v.sId === edit.toolId);
      map.set(
        edit.toolId,
        view ? getMcpServerViewDisplayName(view) : edit.toolId
      );
    }
    return map;
  }, [toolEdits, ctx]);
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

interface InstructionEditDiffBlockProps {
  edit: SkillInstructionEditItemType;
  getSkillInstructionsHtml: () => string;
}

function InstructionEditDiffBlock({
  edit,
  getSkillInstructionsHtml,
}: InstructionEditDiffBlockProps) {
  const { targetBlockId, content } = edit;

  const blockHtml = useMemo(() => {
    const instructionsHtml = getSkillInstructionsHtml();
    if (!instructionsHtml) {
      return "";
    }
    return getBlockOuterHtml(instructionsHtml, targetBlockId);
  }, [targetBlockId, getSkillInstructionsHtml]);

  const editor = useEditor(
    {
      extensions: [...buildSkillInstructionsExtensions(true)],
      editable: false,
      content: blockHtml,
      immediatelyRender: false,
      onCreate: ({ editor: e }) => {
        if (!content) {
          return;
        }
        e.commands.applySuggestion({
          id: targetBlockId,
          targetBlockId,
          content,
        });
        e.commands.setHighlightedSuggestion(targetBlockId);
      },
    },
    [blockHtml]
  );

  return <DiffBlock>{editor && <EditorContent editor={editor} />}</DiffBlock>;
}

interface SkillSuggestionCardProps {
  suggestion: SkillSuggestionType;
  onAccept?: (suggestion: SkillSuggestionType) => void;
  onDecline?: (suggestion: SkillSuggestionType) => void;
  getSkillInstructionsHtml: () => string;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function SkillSuggestionCard({
  suggestion,
  onAccept,
  onDecline,
  getSkillInstructionsHtml,
  isSelected = false,
  onSelect,
}: SkillSuggestionCardProps) {
  const { instructionEdits, toolEdits } = suggestion.suggestion;
  const isClickable = !!onSelect;
  const hasActions = !!onAccept && !!onDecline;

  return (
    <div
      className={`rounded-xl ${isClickable ? "cursor-pointer transition-shadow" : ""} ${isSelected ? "ring-2 ring-highlight-300 dark:ring-highlight-300-night" : ""}`}
      onClick={onSelect}
    >
      <Card variant="primary" size="md" className="flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="heading-base text-foreground dark:text-foreground-night">
            {suggestion.title ?? "Suggestion"}
          </span>
          {hasActions && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
          )}
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
              <InstructionEditDiffBlock
                key={index}
                edit={edit}
                getSkillInstructionsHtml={getSkillInstructionsHtml}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
