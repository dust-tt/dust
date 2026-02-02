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
import React from "react";

import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
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

  return (
    <DiffBlock
      changes={[{ old: oldString, new: newString }]}
      autoCollapsible
      collapseHeightPx={150}
      collapsibleLabel="Suggested instructions change"
      collapsibleOpenLabel="Collapse"
      actions={
        <Button variant="outline" size="sm" label="Review" icon={EyeIcon} />
      }
    />
  );
}

// Tool card for a single tool (addition or deletion)
function ToolActionCard({
  tool,
  isAddition,
  state,
  analysis,
}: {
  tool: MCPServerViewType;
  isAddition: boolean;
  state: ActionCardState;
  analysis?: string | null;
}) {
  const serverName = getMcpServerViewDisplayName(tool);

  return (
    <ActionCardBlock
      title={
        isAddition
          ? `Add ${serverName} tool`
          : `Remove ${serverName} tool`
      }
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={state}
      applyLabel={isAddition ? "Add" : "Remove"}
      rejectLabel="Dismiss"
      actionsPosition="header"
    />
  );
}

// Tools suggestion: renders separate card per addition/deletion
function ToolsSuggestionCards({
  agentSuggestion,
}: {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "tools" }>;
}) {
  const { relations, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);

  return (
    <>
      {relations.additions.map((tool) => (
        <ToolActionCard
          key={`add-${tool.sId}`}
          tool={tool}
          isAddition={true}
          state={cardState}
          analysis={analysis}
        />
      ))}
      {relations.deletions.map((tool) => (
        <ToolActionCard
          key={`del-${tool.sId}`}
          tool={tool}
          isAddition={false}
          state={cardState}
          analysis={analysis}
        />
      ))}
    </>
  );
}

// Skill card for a single skill (addition or deletion)
function SkillActionCard({
  skill,
  isAddition,
  state,
  analysis,
}: {
  skill: SkillType;
  isAddition: boolean;
  state: ActionCardState;
  analysis?: string | null;
}) {
  return (
    <ActionCardBlock
      title={
        isAddition ? `Add ${skill.name} skill` : `Remove ${skill.name} skill`
      }
      visual={<Icon visual={getSkillAvatarIcon(skill.icon)} />}
      description={analysis ?? undefined}
      state={state}
      applyLabel={isAddition ? "Add" : "Remove"}
      rejectLabel="Dismiss"
      actionsPosition="header"
    />
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
  const { relations, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);

  return (
    <>
      {relations.additions.map((skill) => (
        <SkillActionCard
          key={`add-${skill.sId}`}
          skill={skill}
          isAddition={true}
          state={cardState}
          analysis={analysis}
        />
      ))}
      {relations.deletions.map((skill) => (
        <SkillActionCard
          key={`del-${skill.sId}`}
          skill={skill}
          isAddition={false}
          state={cardState}
          analysis={analysis}
        />
      ))}
    </>
  );
}

// Model card
function ModelActionCard({
  model,
  state,
  analysis,
}: {
  model: ModelConfigurationType | null;
  state: ActionCardState;
  analysis?: string | null;
}) {
  const modelName = model?.displayName ?? model?.modelId ?? "Unknown model";

  return (
    <ActionCardBlock
      title={`Change model to: ${modelName}`}
      description={analysis ?? undefined}
      state={state}
      applyLabel="Change"
      rejectLabel="Dismiss"
      actionsPosition="header"
    />
  );
}

// Model suggestion
function ModelSuggestionCard({
  agentSuggestion,
}: {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "model" }>;
}) {
  const { relations, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);

  return (
    <ModelActionCard
      model={relations.model}
      state={cardState}
      analysis={analysis}
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
