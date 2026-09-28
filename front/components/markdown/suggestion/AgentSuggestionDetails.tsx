import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { formatModelEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import { getAgentScopeLabel } from "@app/lib/agent_builder/labels";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { getModelDisplayNameFromId } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { AgentSkillsSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, DiffBlock } from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";

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
      <DiffBlock
        className="[&_.rounded-2xl.border]:border-0 [&_.rounded-2xl.border]:bg-transparent"
        collapsedLines={Number.POSITIVE_INFINITY}
      >
        {editor && <EditorContent editor={editor} />}
      </DiffBlock>
    </div>
  );
}

interface SuggestedSkillRowProps {
  owner: LightWorkspaceType;
  suggestion: AgentSkillsSuggestionType;
}

function SuggestedSkillRow({ owner, suggestion }: SuggestedSkillRowProps) {
  const { action, skillId } = suggestion.suggestion;
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
  });
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill ?? null), [skill]);

  const displayName = skill?.name ?? (isSkillLoading ? "Loading…" : skillId);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <SkillAvatar size="xs" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{displayName}</div>
        {skill && (
          <div className="truncate text-xs text-muted-foreground">
            {skill.userFacingDescription}
          </div>
        )}
      </div>
      <Chip
        size="xs"
        color={action === "add" ? "highlight" : "warning"}
        label={action === "add" ? "Add" : "Remove"}
      />
    </div>
  );
}

interface AgentSuggestionDetailsProps {
  owner: LightWorkspaceType;
  suggestion: AgentActionCardSuggestionType;
  agentConfiguration: AgentConfigurationType | null;
}

export function AgentSuggestionDetails({
  owner,
  suggestion,
  agentConfiguration,
}: AgentSuggestionDetailsProps) {
  switch (suggestion.kind) {
    case "create": {
      const { name, description, instructions } = suggestion.suggestion;
      return (
        <div className="flex flex-col gap-3">
          <SuggestionFieldEditSection
            isCollapsible={false}
            label="Name"
            currentValue=""
            newValue={name}
          />
          <SuggestionFieldEditSection
            isCollapsible={false}
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
        <SuggestionFieldEditSection
          isCollapsible={false}
          label="Description"
          currentValue={agentConfiguration?.description ?? ""}
          showWordDiff
          newValue={suggestion.suggestion.description}
        />
      );

    case "instructions":
      return (
        // The diff box's background is not configurable, so it is overridden here to blend in
        // with the surrounding section.
        <div className="flex flex-col gap-2 [&_.rounded-2xl.border]:bg-transparent">
          <span className="text-sm text-muted-foreground">Instructions</span>
          <SuggestionInstructionsDiffBlock
            isCollapsible={false}
            instructionsHtml={agentConfiguration?.instructionsHtml ?? ""}
            targetBlockId={suggestion.suggestion.targetBlockId}
            content={suggestion.suggestion.content}
            extensions={[
              ...buildAgentInstructionsReadOnlyExtensions(),
              InstructionSuggestionExtension.configure({
                hideUnchangedBlocks: true,
                showBlockHighlight: false,
              }),
            ]}
          />
        </div>
      );

    case "model": {
      const { modelId, reasoningEffort } = suggestion.suggestion;
      return (
        <SuggestionFieldEditSection
          isCollapsible={false}
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
        <SuggestionFieldEditSection
          isCollapsible={false}
          label="Name"
          currentValue={agentConfiguration?.name ?? ""}
          showWordDiff
          newValue={suggestion.suggestion.name}
        />
      );

    case "scope":
      return (
        <SuggestionFieldEditSection
          isCollapsible={false}
          label="Visibility"
          currentValue={
            agentConfiguration
              ? getAgentScopeLabel(agentConfiguration.scope)
              : ""
          }
          newValue={getAgentScopeLabel(suggestion.suggestion.scope)}
        />
      );

    case "skills":
      return <SuggestedSkillRow owner={owner} suggestion={suggestion} />;

    default:
      assertNeverAndIgnore(suggestion);
      return null;
  }
}
