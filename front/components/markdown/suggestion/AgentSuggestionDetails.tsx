import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { formatModelEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { getIcon } from "@app/components/resources/resources_icons";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAgentScopeLabel } from "@app/lib/agent_builder/labels";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useMCPServerView } from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { getModelDisplayNameFromId } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentSkillsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, Chip, DiffBlock } from "@dust-tt/sparkle";
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
      <DiffBlock className="[&_.rounded-2xl.border]:border-0">
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

interface SuggestedToolRowProps {
  owner: LightWorkspaceType;
  suggestion: AgentToolsSuggestionType;
}

function SuggestedToolRow({ owner, suggestion }: SuggestedToolRowProps) {
  const { action, toolId } = suggestion.suggestion;
  const { serverView, isMCPServerViewLoading } = useMCPServerView({
    owner,
    viewId: toolId,
  });

  const displayName = serverView
    ? getMcpServerViewDisplayName(serverView)
    : isMCPServerViewLoading
      ? "Loading…"
      : toolId;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar
        size="xs"
        icon={serverView ? getIcon(serverView.server.icon) : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{displayName}</div>
        {serverView && (
          <div className="truncate text-xs text-muted-foreground">
            {getMcpServerViewDescription(serverView)}
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
            label="Name"
            currentValue=""
            newValue={name}
          />
          <SuggestionFieldEditSection
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
        <SuggestionFieldEditSection
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
          label="Name"
          currentValue={agentConfiguration?.name ?? ""}
          newValue={suggestion.suggestion.name}
        />
      );

    case "scope":
      return (
        <SuggestionFieldEditSection
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

    case "tools":
      return <SuggestedToolRow owner={owner} suggestion={suggestion} />;

    default:
      assertNeverAndIgnore(suggestion);
      return null;
  }
}
