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
import { getSkillAvatarIcon } from "@app/lib/skill";
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

// Tools suggestion: renders separate card per addition/deletion
function ToolsSuggestionCards({
  agentSuggestion,
}: {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "tools" }>;
}) {
  const { relations, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);

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
            actionsPosition="header"
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
            actionsPosition="header"
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
  const { relations, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);

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
          actionsPosition="header"
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
          actionsPosition="header"
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
  const { relations, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const modelName =
    relations.model?.displayName ?? relations.model?.modelId ?? "Unknown model";

  return (
    <ActionCardBlock
      title={`Change model to: ${modelName}`}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel="Change"
      rejectLabel="Dismiss"
      actionsPosition="header"
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
