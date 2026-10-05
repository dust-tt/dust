import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import {
  InstructionSuggestionExtension,
  SUGGESTION_DIFF_CLASSES,
} from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import type { AgentActionCardSuggestionType } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { formatModelEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { getIcon } from "@app/components/resources/resources_icons";
import type { SuggestedChangeAction } from "@app/components/shared/SuggestedChangeRow";
import { SuggestedChangeRow } from "@app/components/shared/SuggestedChangeRow";
import { SuggestedEditors } from "@app/components/shared/SuggestedEditors";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionInstructionsDiffBlock } from "@app/components/shared/SuggestionInstructionsDiffBlock";
import { SuggestionNewInstructionsBlock } from "@app/components/shared/SuggestionNewInstructionsBlock";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAgentScopeLabel } from "@app/lib/agent_builder/helpers";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPServerView } from "@app/lib/swr/mcp_servers";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useTags } from "@app/lib/swr/tags";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { formatResponseFormat } from "@app/types/assistant/models/utils";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, DiffBlock, Eye, EyeOff, Tag01 } from "@dust-tt/sparkle";
import { diffLines } from "diff";
import type { ReactNode } from "react";
import { useMemo } from "react";

interface SuggestedModelRowProps {
  action: SuggestedChangeAction;
  modelId: string;
  reasoningEffort?: ReasoningEffort;
}

function SuggestedModelRow({
  action,
  modelId,
  reasoningEffort,
}: SuggestedModelRowProps) {
  const { isDark } = useTheme();
  const model = SUPPORTED_MODEL_CONFIGS.find((m) => m.modelId === modelId);
  const modelName = model?.displayName ?? modelId;

  return (
    <SuggestedChangeRow
      action={action}
      visual={
        <Avatar
          size="xs"
          icon={
            model ? getModelProviderLogo(model.providerId, isDark) : undefined
          }
        />
      }
      title={
        reasoningEffort
          ? formatModelEffortLabel(modelName, reasoningEffort)
          : modelName
      }
      description={model?.description}
    />
  );
}

interface SuggestedScopeRowProps {
  action: SuggestedChangeAction;
  scope: AgentConfigurationScope;
}

function SuggestedScopeRow({ action, scope }: SuggestedScopeRowProps) {
  return (
    <SuggestedChangeRow
      action={action}
      visual={<Avatar size="xs" icon={scope === "visible" ? Eye : EyeOff} />}
      title={getAgentScopeLabel(scope)}
    />
  );
}

interface SuggestedSkillRowProps {
  owner: LightWorkspaceType;
  action: SuggestedChangeAction;
  skillId: string;
  pendingSkillName: string | undefined;
}

function SuggestedSkillRow({
  owner,
  action,
  skillId,
  pendingSkillName,
}: SuggestedSkillRowProps) {
  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
    disabled: pendingSkillName !== undefined,
  });
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill ?? null), [skill]);

  const displayName =
    pendingSkillName ?? skill?.name ?? (isSkillLoading ? "Loading…" : skillId);

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

interface SuggestedTagsProps {
  owner: LightWorkspaceType;
  addTags: string[];
  removeTags: string[];
}

function SuggestedTags({ owner, addTags, removeTags }: SuggestedTagsProps) {
  const { tags, isTagsLoading } = useTags({ owner });
  const existingTagNames = useMemo(
    () => new Set(tags.map((tag) => tag.name.toLowerCase())),
    [tags]
  );

  return (
    <SuggestedChangesSection label="Tags">
      {addTags.map((name) => (
        <SuggestedChangeRow
          key={`add-${name}`}
          action="add"
          visual={<Avatar size="xs" icon={Tag01} />}
          title={name}
          description={
            !isTagsLoading && !existingTagNames.has(name.toLowerCase())
              ? "New tag"
              : undefined
          }
        />
      ))}
      {removeTags.map((name) => (
        <SuggestedChangeRow
          key={`remove-${name}`}
          action="remove"
          visual={<Avatar size="xs" icon={Tag01} />}
          title={name}
        />
      ))}
    </SuggestedChangesSection>
  );
}

interface SuggestedStructuredOutputProps {
  currentResponseFormat: string | undefined;
  responseFormat: string | null;
}

function SuggestedStructuredOutput({
  currentResponseFormat,
  responseFormat,
}: SuggestedStructuredOutputProps) {
  const parts = useMemo(
    () =>
      // Indented, so the diff is line by line.
      diffLines(
        currentResponseFormat
          ? formatResponseFormat(currentResponseFormat)
          : "",
        responseFormat ? formatResponseFormat(responseFormat) : ""
      ),
    [currentResponseFormat, responseFormat]
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">
        Structured output (JSON schema)
      </span>
      <DiffBlock variant="plain">
        <pre className="whitespace-pre-wrap text-foreground">
          {parts.map((part, index) => (
            <span
              key={index}
              className={
                part.added
                  ? SUGGESTION_DIFF_CLASSES.add
                  : part.removed
                    ? SUGGESTION_DIFF_CLASSES.remove
                    : undefined
              }
            >
              {part.value}
            </span>
          ))}
        </pre>
      </DiffBlock>
    </div>
  );
}

interface SuggestedChangesSectionProps {
  label: string;
  children: ReactNode;
}

function SuggestedChangesSection({
  label,
  children,
}: SuggestedChangesSectionProps) {
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
  pendingSkillNameById: Map<string, string>;
}

export function AgentSuggestionDetails({
  owner,
  suggestion,
  agentConfiguration,
  pendingSkillNameById,
}: AgentSuggestionDetailsProps) {
  switch (suggestion.kind) {
    case "create": {
      const {
        name,
        description,
        instructions,
        toolIds = [],
        skillIds = [],
        subAgentIds = [],
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
            <SuggestedChangesSection label="Skills">
              {skillIds.map((skillId) => (
                <SuggestedSkillRow
                  key={skillId}
                  owner={owner}
                  action="add"
                  skillId={skillId}
                  pendingSkillName={pendingSkillNameById.get(skillId)}
                />
              ))}
            </SuggestedChangesSection>
          )}
          {toolIds.length > 0 && (
            <SuggestedChangesSection label="Tools">
              {toolIds.map((toolId) => (
                <SuggestedToolRow
                  key={toolId}
                  owner={owner}
                  action="add"
                  toolId={toolId}
                />
              ))}
            </SuggestedChangesSection>
          )}
          {subAgentIds.length > 0 && (
            <SuggestedChangesSection label="Sub-agents">
              {subAgentIds.map((subAgentId) => (
                <SuggestedSubAgentRow
                  key={subAgentId}
                  owner={owner}
                  action="add"
                  childAgentId={subAgentId}
                />
              ))}
            </SuggestedChangesSection>
          )}
        </div>
      );
    }

    // A deleted agent has nothing to review: its card shows no body.
    case "delete":
      return null;

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

    case "tags":
      return (
        <SuggestedTags
          owner={owner}
          addTags={suggestion.suggestion.addTags}
          removeTags={suggestion.suggestion.removeTags}
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
        <SuggestedChangesSection label="Model">
          {agentConfiguration && (
            <SuggestedModelRow
              action="remove"
              modelId={agentConfiguration.model.modelId}
              reasoningEffort={agentConfiguration.model.reasoningEffort}
            />
          )}
          <SuggestedModelRow
            action="add"
            modelId={modelId}
            reasoningEffort={reasoningEffort}
          />
        </SuggestedChangesSection>
      );
    }

    case "structured_output":
      return (
        <SuggestedStructuredOutput
          currentResponseFormat={agentConfiguration?.model.responseFormat}
          responseFormat={suggestion.suggestion.responseFormat}
        />
      );

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
        <SuggestedChangesSection label="Visibility">
          {agentConfiguration && (
            <SuggestedScopeRow
              action="remove"
              scope={agentConfiguration.scope}
            />
          )}
          <SuggestedScopeRow action="add" scope={suggestion.suggestion.scope} />
        </SuggestedChangesSection>
      );

    case "skills":
      return (
        <SuggestedSkillRow
          owner={owner}
          action={suggestion.suggestion.action}
          skillId={suggestion.suggestion.skillId}
          pendingSkillName={pendingSkillNameById.get(
            suggestion.suggestion.skillId
          )}
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
