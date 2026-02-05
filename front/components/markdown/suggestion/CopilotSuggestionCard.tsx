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
import React, { useCallback } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  AgentInstructionsSuggestionType,
  AgentSuggestionKind,
  AgentSuggestionState,
  AgentSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";
import { isLegacyInstructionsSuggestion } from "@app/types/suggestions/agent_suggestion";

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
  const { focusOnSuggestion } = useCopilotSuggestions();

  const cardState = mapSuggestionStateToCardState(agentSuggestion.state);
  const actions = getInstructionsAction(cardState, () =>
    focusOnSuggestion(agentSuggestion.sId)
  );

  // Handle both block-based and legacy suggestion formats.
  let changes: Array<{ old: string; new: string }>;
  if (isLegacyInstructionsSuggestion(agentSuggestion.suggestion)) {
    changes = [
      {
        old: agentSuggestion.suggestion.oldString,
        new: agentSuggestion.suggestion.newString,
      },
    ];
  } else {
    // For block-based suggestions, we show the HTML content as a replacement.
    changes = [
      {
        old: `[Block ${agentSuggestion.suggestion.targetBlockId}]`,
        new: agentSuggestion.suggestion.content,
      },
    ];
  }

  return (
    <DiffBlock
      changes={changes}
      actions={actions}
      className={cardState !== "active" ? "opacity-70" : undefined}
    />
  );
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
        const alreadyExists = currentActions.some(
          (action) => action.configuration.mcpServerViewId === tool.sId
        );
        if (!alreadyExists) {
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

  const serverName = getMcpServerViewDisplayName(tool);

  return (
    <ActionCardBlock
      title={
        isAddition ? `Add ${serverName} tool` : `Remove ${serverName} tool`
      }
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      acceptedTitle={
        isAddition ? `${serverName} tool added` : `${serverName} tool removed`
      }
      rejectedTitle={`${serverName} tool suggestion rejected`}
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
    case "skills":
      return <SkillSuggestionCard agentSuggestion={agentSuggestion} />;
    case "model":
      return <ModelSuggestionCard agentSuggestion={agentSuggestion} />;
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
