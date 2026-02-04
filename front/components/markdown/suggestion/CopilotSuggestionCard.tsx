import type { ActionCardState } from "@dust-tt/sparkle";
import {
  ActionCardBlock,
  Avatar,
  Button,
  ContentMessage,
  DiffBlock,
  ExclamationCircleIcon,
  EyeIcon,
  Icon,
  LoadingBlock,
} from "@dust-tt/sparkle";
import React, { useCallback } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
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

interface SuggestionCardProps {
  agentSuggestion: AgentSuggestionWithRelationsType;
}

// Instructions suggestion: collapsible diff view using DiffBlock
function InstructionsSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "instructions" }
  >;
}) {
  const { oldString, newString } = agentSuggestion.suggestion;
  const { focusOnSuggestion } = useCopilotSuggestions();

  return (
    <DiffBlock
      changes={[{ old: oldString, new: newString }]}
      autoCollapsible
      collapseHeightPx={150}
      collapsibleLabel="Suggested instructions change"
      collapsibleOpenLabel="Collapse"
      actions={
        <Button
          variant="outline"
          size="sm"
          label="Review"
          icon={EyeIcon}
          onClick={() => focusOnSuggestion(agentSuggestion.sId)}
        />
      }
    />
  );
}

// Tools suggestion: renders separate card per addition/deletion
function ToolsSuggestionCards({
  agentSuggestion,
}: {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "tools" }>;
}) {
  const { relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const handleAcceptAddition = useCallback(
    async (tool: MCPServerViewType) => {
      const success = await acceptSuggestion(sId);
      if (success) {
        const currentActions = getValues("actions");
        const alreadyExists = currentActions.some(
          (a) => a.configuration.mcpServerViewId === tool.sId
        );
        if (!alreadyExists) {
          setValue("actions", [...currentActions, getDefaultMCPAction(tool)], {
            shouldDirty: true,
          });
        }
      }
    },
    [acceptSuggestion, sId, getValues, setValue]
  );

  const handleAcceptDeletion = useCallback(
    async (tool: MCPServerViewType) => {
      const success = await acceptSuggestion(sId);
      if (success) {
        const currentActions = getValues("actions");
        setValue(
          "actions",
          currentActions.filter(
            (a) => a.configuration.mcpServerViewId !== tool.sId
          ),
          { shouldDirty: true }
        );
      }
    },
    [acceptSuggestion, sId, getValues, setValue]
  );

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  return (
    <div className="flex flex-col gap-2">
      {relations.additions.map((tool) => {
        const serverName = getMcpServerViewDisplayName(tool);
        return (
          <ActionCardBlock
            key={`add-${tool.sId}`}
            title={`Add ${serverName} tool`}
            visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
            description={analysis ?? undefined}
            state={cardState}
            applyLabel="Add"
            rejectLabel="Dismiss"
            acceptedTitle={`${serverName} tool added`}
            rejectedTitle={`${serverName} tool dismissed`}
            actionsPosition="header"
            onClickAccept={() => handleAcceptAddition(tool)}
            onClickReject={handleReject}
          />
        );
      })}
      {relations.deletions.map((tool) => {
        const serverName = getMcpServerViewDisplayName(tool);
        return (
          <ActionCardBlock
            key={`del-${tool.sId}`}
            title={`Remove ${serverName} tool`}
            visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
            description={analysis ?? undefined}
            state={cardState}
            applyLabel="Remove"
            rejectLabel="Dismiss"
            acceptedTitle={`${serverName} tool removed`}
            rejectedTitle={`${serverName} tool dismissed`}
            actionsPosition="header"
            onClickAccept={() => handleAcceptDeletion(tool)}
            onClickReject={handleReject}
          />
        );
      })}
    </div>
  );
}

// Skills suggestion: renders separate card per addition/deletion
function SkillsSuggestionCards({
  agentSuggestion,
}: {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "skills" }
  >;
}) {
  const { relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const handleAcceptAddition = useCallback(
    async (skill: SkillType) => {
      const success = await acceptSuggestion(sId);
      if (success) {
        const currentSkills = getValues("skills");
        const alreadyExists = currentSkills.some((s) => s.sId === skill.sId);
        if (!alreadyExists) {
          setValue(
            "skills",
            [
              ...currentSkills,
              {
                sId: skill.sId,
                name: skill.name,
                description: skill.userFacingDescription,
                icon: skill.icon,
              },
            ],
            { shouldDirty: true }
          );
        }
      }
    },
    [acceptSuggestion, sId, getValues, setValue]
  );

  const handleAcceptDeletion = useCallback(
    async (skill: SkillType) => {
      const success = await acceptSuggestion(sId);
      if (success) {
        const currentSkills = getValues("skills");
        setValue(
          "skills",
          currentSkills.filter((s) => s.sId !== skill.sId),
          { shouldDirty: true }
        );
      }
    },
    [acceptSuggestion, sId, getValues, setValue]
  );

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  return (
    <div className="flex flex-col gap-2">
      {relations.additions.map((skill) => (
        <ActionCardBlock
          key={`add-${skill.sId}`}
          title={`Add ${skill.name} skill`}
          visual={<Icon visual={getSkillAvatarIcon(skill.icon)} />}
          description={analysis ?? undefined}
          state={cardState}
          applyLabel="Add"
          rejectLabel="Dismiss"
          acceptedTitle={`${skill.name} skill added`}
          rejectedTitle={`${skill.name} skill dismissed`}
          actionsPosition="header"
          onClickAccept={() => handleAcceptAddition(skill)}
          onClickReject={handleReject}
        />
      ))}
      {relations.deletions.map((skill) => (
        <ActionCardBlock
          key={`del-${skill.sId}`}
          title={`Remove ${skill.name} skill`}
          visual={<Icon visual={getSkillAvatarIcon(skill.icon)} />}
          description={analysis ?? undefined}
          state={cardState}
          applyLabel="Remove"
          rejectLabel="Dismiss"
          acceptedTitle={`${skill.name} skill removed`}
          rejectedTitle={`${skill.name} skill dismissed`}
          actionsPosition="header"
          onClickAccept={() => handleAcceptDeletion(skill)}
          onClickReject={handleReject}
        />
      ))}
    </div>
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
      rejectLabel="Dismiss"
      acceptedTitle={`Model changed to ${modelName}`}
      rejectedTitle={`${modelName} model dismissed`}
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
      return <ToolsSuggestionCards agentSuggestion={agentSuggestion} />;
    case "skills":
      return <SkillsSuggestionCards agentSuggestion={agentSuggestion} />;
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
