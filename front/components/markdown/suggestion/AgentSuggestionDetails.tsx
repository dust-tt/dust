import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { formatModelEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { getIcon } from "@app/components/resources/resources_icons";
import type { SuggestedChangeAction } from "@app/components/shared/SuggestedChangeRow";
import { SuggestedChangeRow } from "@app/components/shared/SuggestedChangeRow";
import { SuggestedEditors } from "@app/components/shared/SuggestedEditors";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import { SuggestionNewInstructionsBlock } from "@app/components/shared/SuggestionNewInstructionsBlock";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAgentScopeLabel } from "@app/lib/agent_builder/labels";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPServerView } from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { getModelDisplayNameFromId } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useMemo } from "react";

function formatModel(modelId: string, reasoningEffort?: ReasoningEffort) {
  const modelName = getModelDisplayNameFromId(modelId);
  return reasoningEffort
    ? formatModelEffortLabel(modelName, reasoningEffort)
    : modelName;
}

interface SuggestedSkillRowProps {
  owner: LightWorkspaceType;
  action: SuggestedChangeAction;
  skillId: string;
}

function SuggestedSkillRow({ owner, action, skillId }: SuggestedSkillRowProps) {
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
  });
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill ?? null), [skill]);

  const displayName = skill?.name ?? (isSkillLoading ? "Loading…" : skillId);

  return (
    <SuggestedChangeRow
      action={action}
      visual={<SkillAvatar size="xs" />}
      title={displayName}
      description={skill?.userFacingDescription}
    />
  );
}

interface SuggestedToolRowProps {
  owner: LightWorkspaceType;
  action: SuggestedChangeAction;
  toolId: string;
}

function SuggestedToolRow({ owner, action, toolId }: SuggestedToolRowProps) {
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
    <SuggestedChangeRow
      action={action}
      visual={
        <Avatar
          size="xs"
          icon={serverView ? getIcon(serverView.server.icon) : undefined}
        />
      }
      title={displayName}
      description={
        serverView ? getMcpServerViewDescription(serverView) : undefined
      }
    />
  );
}

interface SuggestedSubAgentRowProps {
  owner: LightWorkspaceType;
  action: SuggestedChangeAction;
  childAgentId: string;
}

function SuggestedSubAgentRow({
  owner,
  action,
  childAgentId,
}: SuggestedSubAgentRowProps) {
  const { agentConfiguration: subAgent, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: childAgentId,
    });

  const displayName = subAgent
    ? `@${subAgent.name}`
    : isAgentConfigurationLoading
      ? "Loading…"
      : childAgentId;

  return (
    <SuggestedChangeRow
      action={action}
      visual={<Avatar size="xs" visual={subAgent?.pictureUrl} />}
      title={displayName}
      description={subAgent?.description}
    />
  );
}

interface NewCapabilitiesSectionProps {
  label: string;
  children: ReactNode;
}

function NewCapabilitiesSection({
  label,
  children,
}: NewCapabilitiesSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="divide-y divide-border">{children}</div>
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
      const {
        name,
        description,
        instructions,
        toolIds = [],
        skillIds = [],
      } = suggestion.suggestion;
      return (
        <div className="flex flex-col gap-3">
          <SuggestionFieldEditSection
            layout="inline"
            label="Name"
            currentValue=""
            newValue={name}
          />
          <SuggestionFieldEditSection
            layout="inline"
            label="Description"
            currentValue=""
            newValue={description}
          />
          <SuggestionNewInstructionsBlock
            layout="inline"
            instructionsHtml={instructions}
            extensions={buildAgentInstructionsReadOnlyExtensions()}
          />
          {skillIds.length > 0 && (
            <NewCapabilitiesSection label="Skills">
              {skillIds.map((skillId) => (
                <SuggestedSkillRow
                  key={skillId}
                  owner={owner}
                  action="add"
                  skillId={skillId}
                />
              ))}
            </NewCapabilitiesSection>
          )}
          {toolIds.length > 0 && (
            <NewCapabilitiesSection label="Tools">
              {toolIds.map((toolId) => (
                <SuggestedToolRow
                  key={toolId}
                  owner={owner}
                  action="add"
                  toolId={toolId}
                />
              ))}
            </NewCapabilitiesSection>
          )}
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
          layout="inline"
          label="Description"
          currentValue={agentConfiguration?.description ?? ""}
          newValue={suggestion.suggestion.description}
        />
      );

    case "editors":
      return (
        <SuggestedEditors
          suggestion={suggestion.suggestion}
          workspaceId={owner.sId}
        />
      );

    case "instructions":
      return (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Instructions</span>
          <SuggestionInstructionsDiffBlock
            layout="inline"
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
          layout="inline"
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
          layout="inline"
          label="Name"
          currentValue={agentConfiguration?.name ?? ""}
          newValue={suggestion.suggestion.name}
        />
      );

    case "scope":
      return (
        <SuggestionFieldEditSection
          layout="inline"
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
      return (
        <SuggestedSkillRow
          owner={owner}
          action={suggestion.suggestion.action}
          skillId={suggestion.suggestion.skillId}
        />
      );

    case "sub_agent":
      return (
        <SuggestedSubAgentRow
          owner={owner}
          action={suggestion.suggestion.action}
          childAgentId={suggestion.suggestion.childAgentId}
        />
      );

    case "tools":
      return (
        <SuggestedToolRow
          owner={owner}
          action={suggestion.suggestion.action}
          toolId={suggestion.suggestion.toolId}
        />
      );

    default:
      assertNeverAndIgnore(suggestion);
      return null;
  }
}
