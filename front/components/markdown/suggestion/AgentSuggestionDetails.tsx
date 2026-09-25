import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { formatModelEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import { SkillFieldEditSection } from "@app/components/skill_builder/SkillFieldEditSection";
import { getAgentScopeLabel } from "@app/lib/agent_builder/labels";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { getModelDisplayNameFromId } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { DiffBlock } from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";

function formatModel(modelId: string, reasoningEffort?: ReasoningEffort) {
  const modelName = getModelDisplayNameFromId(modelId);
  return reasoningEffort
    ? formatModelEffortLabel(modelName, reasoningEffort)
    : modelName;
}

interface NewInstructionsBlockProps {
  instructionsHtml: string;
}

function NewInstructionsBlock({ instructionsHtml }: NewInstructionsBlockProps) {
  const editor = useEditor(
    {
      extensions: buildAgentInstructionsReadOnlyExtensions(),
      editable: false,
      content: instructionsHtml,
      immediatelyRender: false,
    },
    [instructionsHtml]
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Instructions</span>
      <DiffBlock className="[&_.rounded-2xl.border]:border-0">
        {editor && <EditorContent editor={editor} />}
      </DiffBlock>
    </div>
  );
}

interface AgentSuggestionDetailsProps {
  suggestion: AgentActionCardSuggestionType;
  agentConfiguration: AgentConfigurationType | null;
}

export function AgentSuggestionDetails({
  suggestion,
  agentConfiguration,
}: AgentSuggestionDetailsProps) {
  switch (suggestion.kind) {
    case "create": {
      const { name, description, instructions } = suggestion.suggestion;
      return (
        <div className="flex flex-col gap-3">
          <SkillFieldEditSection label="Name" currentValue="" newValue={name} />
          <SkillFieldEditSection
            label="Description"
            currentValue=""
            newValue={description}
          />
          <NewInstructionsBlock instructionsHtml={instructions} />
        </div>
      );
    }

    case "delete":
      return (
        <p className="text-sm text-foreground">
          Delete the{" "}
          <span className="font-medium">{suggestion.suggestion.name}</span>{" "}
          agent.
        </p>
      );

    case "description":
      return (
        <SkillFieldEditSection
          label="Description"
          currentValue={agentConfiguration?.description ?? ""}
          newValue={suggestion.suggestion.description}
        />
      );

    case "instructions":
      return (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Instructions</span>
          <SuggestionInstructionsDiffBlock
            instructionsHtml={agentConfiguration?.instructionsHtml ?? ""}
            targetBlockId={suggestion.suggestion.targetBlockId}
            content={suggestion.suggestion.content}
            extensions={[
              ...buildAgentInstructionsReadOnlyExtensions(),
              InstructionSuggestionExtension.configure({
                showBlockHighlight: false,
              }),
            ]}
          />
        </div>
      );

    case "model": {
      const { modelId, reasoningEffort } = suggestion.suggestion;
      return (
        <SkillFieldEditSection
          label="Model"
          currentValue={
            agentConfiguration
              ? formatModel(
                  agentConfiguration.model.modelId,
                  agentConfiguration.model.reasoningEffort
                )
              : ""
          }
          newValue={formatModel(modelId, reasoningEffort)}
        />
      );
    }

    case "name":
      return (
        <SkillFieldEditSection
          label="Name"
          currentValue={agentConfiguration?.name ?? ""}
          newValue={suggestion.suggestion.name}
        />
      );

    case "scope":
      return (
        <SkillFieldEditSection
          label="Visibility"
          currentValue={
            agentConfiguration
              ? getAgentScopeLabel(agentConfiguration.scope)
              : ""
          }
          newValue={getAgentScopeLabel(suggestion.suggestion.scope)}
        />
      );

    default:
      assertNeverAndIgnore(suggestion);
      return null;
  }
}
