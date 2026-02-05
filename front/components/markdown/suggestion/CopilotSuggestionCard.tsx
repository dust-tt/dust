import type { ActionCardState } from "@dust-tt/sparkle";
import {
  ActionCardBlock,
  Avatar,
  Button,
  CheckIcon,
  ClockIcon,
  ContentMessage,
  DiffBlock,
  ExclamationCircleIcon,
  EyeIcon,
  Icon,
  LoadingBlock,
  XMarkIcon,
} from "@dust-tt/sparkle";
import DOMPurify from "dompurify";
import React, { useCallback, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { nameToStorageFormat } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  AgentInstructionsSuggestionType,
  AgentSuggestionKind,
  AgentSuggestionState,
  AgentSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";

function mapSuggestionStateToCardState(
  state: AgentSuggestionState
): ActionCardState {
  switch (state) {
    case "pending":
      return "active";
    case "approved":
      return "accepted";
    case "rejected":
      return "rejected";
    case "outdated":
      return "disabled";
    default:
      assertNever(state);
  }
}

const INSTRUCTIONS_ACTION_CONFIG: Record<
  ActionCardState,
  { icon: typeof CheckIcon; tooltip: string }
> = {
  active: { icon: EyeIcon, tooltip: "Review" },
  accepted: { icon: CheckIcon, tooltip: "Accepted" },
  rejected: { icon: XMarkIcon, tooltip: "Rejected" },
  disabled: { icon: ClockIcon, tooltip: "Outdated" },
};

function getInstructionsAction(
  state: ActionCardState,
  onClick: () => void
): React.ReactNode {
  const { icon, tooltip } = INSTRUCTIONS_ACTION_CONFIG[state];

  return (
    <Button
      variant="outline"
      size="xs"
      icon={icon}
      tooltip={tooltip}
      onClick={onClick}
      disabled={state !== "active"}
    />
  );
}

interface SuggestionCardProps {
  agentSuggestion: AgentSuggestionWithRelationsType;
}

function InstructionsSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: AgentInstructionsSuggestionType;
}) {
  const { content, targetBlockId } = agentSuggestion.suggestion;
  // TODO(2026-02-05 COPILOT): focusOnSuggestion uses text position over proper position.
  const { focusOnSuggestion } = useCopilotSuggestions();

  const cardState = mapSuggestionStateToCardState(agentSuggestion.state);
  const actions = getInstructionsAction(cardState, () =>
    focusOnSuggestion(agentSuggestion.sId)
  );

  // Sanitize HTML content to prevent XSS attacks.
  const sanitizedContent = DOMPurify.sanitize(content);

  // TODO(2026-02-05 COPILOT): Find a better way to display the diff.
  return (
    <DiffBlock
      changes={[
        {
          old: `[Block ${targetBlockId}]`,
          new: sanitizedContent,
        },
      ]}
      actions={actions}
      className={cardState !== "active" ? "opacity-70" : undefined}
    />
  );
}

function isToolAlreadyAdded(
  currentActions: AgentBuilderFormData["actions"],
  toolSId: string
): boolean {
  return currentActions.some(
    (action) => action.configuration.mcpServerViewId === toolSId
  );
}

function isSubAgentAlreadyAdded(
  currentActions: AgentBuilderFormData["actions"],
  childAgentId: string
): boolean {
  return currentActions.some(
    (action) => action.configuration.childAgentId === childAgentId
  );
}

function getNewSubAgentAction(
  tool: MCPServerViewType,
  childAgentId: string,
  childAgentName: string | null
): ReturnType<typeof getDefaultMCPAction> {
  const newAction = getDefaultMCPAction(tool);
  newAction.configuration.childAgentId = childAgentId;
  if (childAgentName) {
    newAction.name = nameToStorageFormat(`run_${childAgentName}`);
  }
  return newAction;
}

function ToolSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "tools" }>;
}) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const isAddition = suggestion.action === "add";
  const tool = relations.tool;

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        const currentActions = getValues("actions");
        if (!isToolAlreadyAdded(currentActions, tool.sId)) {
          const newAction = getDefaultMCPAction(tool);
          setValue("actions", [...currentActions, newAction], {
            shouldDirty: true,
          });
        }
      } else {
        const currentActions = getValues("actions");
        const filteredActions = currentActions.filter(
          (action) => action.configuration.mcpServerViewId !== tool.sId
        );
        setValue("actions", filteredActions, { shouldDirty: true });
      }
    }
  }, [acceptSuggestion, sId, getValues, setValue, isAddition, tool]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  const displayName = getMcpServerViewDisplayName(tool);

  return (
    <ActionCardBlock
      title={
        isAddition ? `Add ${displayName} tool` : `Remove ${displayName} tool`
      }
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      rejectLabel="Dismiss"
      acceptedTitle={
        isAddition ? `${displayName} tool added` : `${displayName} tool removed`
      }
      rejectedTitle={`${displayName} tool dismissed`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

function SubAgentSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "sub_agent" }
  >;
}) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();
  const { owner } = useAgentBuilderContext();

  const isAddition = suggestion.action === "add";
  const tool = relations.tool;
  const childAgentId = suggestion.childAgentId;

  // Fetch agent configurations to resolve childAgentId to name.
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });

  // Resolve child agent name from childAgentId.
  const childAgentName = useMemo(() => {
    const childAgent = agentConfigurations.find((a) => a.sId === childAgentId);
    return childAgent?.name ?? null;
  }, [childAgentId, agentConfigurations]);

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        const currentActions = getValues("actions");
        if (!isSubAgentAlreadyAdded(currentActions, childAgentId)) {
          const newAction = getNewSubAgentAction(
            tool,
            childAgentId,
            childAgentName
          );
          setValue("actions", [...currentActions, newAction], {
            shouldDirty: true,
          });
        }
      } else {
        const currentActions = getValues("actions");
        const filteredActions = currentActions.filter(
          (action) => action.configuration.childAgentId !== childAgentId
        );
        setValue("actions", filteredActions, { shouldDirty: true });
      }
    }
  }, [
    acceptSuggestion,
    sId,
    getValues,
    setValue,
    isAddition,
    tool,
    childAgentId,
    childAgentName,
  ]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  const displayName = childAgentName
    ? `Run ${childAgentName}`
    : "Run sub-agent";

  return (
    <ActionCardBlock
      title={isAddition ? `Add ${displayName}` : `Remove ${displayName}`}
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      acceptedTitle={
        isAddition ? `${displayName} added` : `${displayName} removed`
      }
      rejectedTitle={`${displayName} dismissed`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

function SkillSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "skills" }
  >;
}) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const isAddition = suggestion.action === "add";
  const skill = relations.skill;

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        const currentSkills = getValues("skills");
        const alreadyExists = currentSkills.some((s) => s.sId === skill.sId);
        if (!alreadyExists) {
          const newSkill = {
            sId: skill.sId,
            name: skill.name,
            description: skill.userFacingDescription,
            icon: skill.icon,
          };
          setValue("skills", [...currentSkills, newSkill], {
            shouldDirty: true,
          });
        }
      } else {
        const currentSkills = getValues("skills");
        const filteredSkills = currentSkills.filter((s) => s.sId !== skill.sId);
        setValue("skills", filteredSkills, { shouldDirty: true });
      }
    }
  }, [acceptSuggestion, sId, getValues, setValue, isAddition, skill]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  return (
    <ActionCardBlock
      title={
        isAddition ? `Add ${skill.name} skill` : `Remove ${skill.name} skill`
      }
      visual={<Icon visual={getSkillAvatarIcon(skill.icon)} />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      acceptedTitle={
        isAddition ? `${skill.name} skill added` : `${skill.name} skill removed`
      }
      rejectedTitle={`${skill.name} skill suggestion rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

// Model suggestion
function ModelSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "model" }>;
}) {
  const { relations, suggestion, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const modelName =
    relations.model?.displayName ?? relations.model?.modelId ?? "Unknown model";
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { control } = useFormContext<AgentBuilderFormData>();

  const { field: modelSettingsField } = useController({
    control,
    name: "generationSettings.modelSettings",
  });

  const { field: reasoningEffortField } = useController({
    control,
    name: "generationSettings.reasoningEffort",
  });

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success && relations.model) {
      modelSettingsField.onChange({
        modelId: relations.model.modelId,
        providerId: relations.model.providerId,
      });
      reasoningEffortField.onChange(
        suggestion.reasoningEffort ?? relations.model.defaultReasoningEffort
      );
    }
  }, [
    sId,
    acceptSuggestion,
    relations.model,
    suggestion.reasoningEffort,
    modelSettingsField,
    reasoningEffortField,
  ]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [sId, rejectSuggestion]);

  return (
    <ActionCardBlock
      title={`Change model to: ${modelName}`}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel="Change"
      acceptedTitle={`Model changed to ${modelName}`}
      rejectedTitle={`${modelName} model suggestion rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

export function CopilotSuggestionCard({
  agentSuggestion,
}: SuggestionCardProps) {
  switch (agentSuggestion.kind) {
    case "instructions":
      return <InstructionsSuggestionCard agentSuggestion={agentSuggestion} />;
    case "tools":
      return <ToolSuggestionCard agentSuggestion={agentSuggestion} />;
    case "sub_agent":
      return <SubAgentSuggestionCard agentSuggestion={agentSuggestion} />;
    case "skills":
      return <SkillSuggestionCard agentSuggestion={agentSuggestion} />;
    case "model":
      return <ModelSuggestionCard agentSuggestion={agentSuggestion} />;
    default:
      assertNever(agentSuggestion);
  }
}

interface SuggestionCardSkeletonProps {
  kind?: AgentSuggestionKind;
}

export function SuggestionCardSkeleton({ kind }: SuggestionCardSkeletonProps) {
  if (kind === "instructions") {
    return <LoadingBlock className="h-24 w-full" />;
  }

  // For tools/skills/model, match ActionCardBlock structure
  return (
    <ActionCardBlock
      state="accepted"
      description={<LoadingBlock className="h-14 w-full" />}
    />
  );
}

export function SuggestionCardError() {
  return (
    <div className="mb-2 inline-block w-full max-w-md align-top">
      <ContentMessage
        title="Failed to load suggestion"
        icon={ExclamationCircleIcon}
        variant="warning"
        size="sm"
      >
        <span className="text-sm">
          The suggestion could not be loaded. Please try refreshing the page.
        </span>
      </ContentMessage>
    </div>
  );
}
