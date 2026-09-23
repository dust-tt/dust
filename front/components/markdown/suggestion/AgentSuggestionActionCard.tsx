/**
 * For cards that don't depend on the agent builder's form context or its tiptap
 * instructions editor, so they can be rendered from a plain conversation message.
 */

import { getIcon } from "@app/components/resources/resources_icons";
import { getModelDisplayNameFromId } from "@app/types/assistant/models/models";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentCreateSuggestionType,
  AgentDeleteSuggestionType,
  AgentDescriptionSuggestionType,
  AgentInstructionsSuggestionType,
  AgentModelSuggestionType,
  AgentNameSuggestionType,
  AgentScopeSuggestionType,
  AgentSuggestionState,
} from "@app/types/suggestions/agent_suggestion";
import type { ActionCardState } from "@dust-tt/sparkle";
import { ActionCardBlock, Avatar } from "@dust-tt/sparkle";

export function mapSuggestionStateToCardState(
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
      assertNeverAndIgnore(state);
      return "disabled";
  }
}

export type AgentActionCardSuggestionType =
  | AgentCreateSuggestionType
  | AgentDeleteSuggestionType
  | AgentDescriptionSuggestionType
  | AgentInstructionsSuggestionType
  | AgentModelSuggestionType
  | AgentNameSuggestionType
  | AgentScopeSuggestionType;

interface AgentSuggestionActionCardProps {
  agentSuggestion: AgentActionCardSuggestionType;
  onAccept: () => void;
  onReject: () => void;
  /** Forces the busy/disabled visual, e.g. while an accept/reject request is in flight. */
  disabled?: boolean;
  pictureUrl?: string;
}

function getLabels(agentSuggestion: AgentActionCardSuggestionType): {
  title: string;
  acceptedTitle: string;
  rejectedTitle: string;
  description: string | undefined;
} {
  const { analysis } = agentSuggestion;

  switch (agentSuggestion.kind) {
    case "create": {
      const { name, description } = agentSuggestion.suggestion;
      return {
        title: `Create "${name}" agent`,
        acceptedTitle: `"${name}" agent creation accepted`,
        rejectedTitle: `"${name}" agent creation rejected`,
        description: analysis ?? description,
      };
    }

    case "delete": {
      const { name } = agentSuggestion.suggestion;
      return {
        title: `Delete "${name}" agent`,
        acceptedTitle: `"${name}" agent deletion accepted`,
        rejectedTitle: `"${name}" agent deletion rejected`,
        description: analysis ?? undefined,
      };
    }

    case "description": {
      const { description } = agentSuggestion.suggestion;
      return {
        title: `Change description to "${description}"`,
        acceptedTitle: `Description change to "${description}" accepted`,
        rejectedTitle: `Description change to "${description}" rejected`,
        description: analysis ?? undefined,
      };
    }

    case "model": {
      const modelName = getModelDisplayNameFromId(
        agentSuggestion.suggestion.modelId
      );
      return {
        title: `Change model to "${modelName}"`,
        acceptedTitle: `Model change to "${modelName}" accepted`,
        rejectedTitle: `Model change to "${modelName}" rejected`,
        description: analysis ?? undefined,
      };
    }

    case "name": {
      const { name } = agentSuggestion.suggestion;
      return {
        title: `Rename agent to "${name}"`,
        acceptedTitle: `Rename to "${name}" accepted`,
        rejectedTitle: `Rename to "${name}" rejected`,
        description: analysis ?? undefined,
      };
    }

    case "scope": {
      const isPublishing = agentSuggestion.suggestion.scope === "visible";
      return {
        title: isPublishing ? "Publish agent" : "Unpublish agent",
        acceptedTitle: isPublishing ? "Agent published" : "Agent unpublished",
        rejectedTitle: isPublishing ? "Publish rejected" : "Unpublish rejected",
        description: analysis ?? undefined,
      };
    }

    case "instructions": {
      return {
        title: "Update agent instructions",
        acceptedTitle: "Instructions update accepted",
        rejectedTitle: "Instructions update rejected",
        description: analysis ?? undefined,
      };
    }

    default:
      assertNeverAndIgnore(agentSuggestion);
      return {
        title: "Agent suggestion",
        acceptedTitle: "Agent suggestion accepted",
        rejectedTitle: "Agent suggestion rejected",
        description: undefined,
      };
  }
}

export function AgentSuggestionActionCard({
  agentSuggestion,
  onAccept,
  onReject,
  disabled,
  pictureUrl,
}: AgentSuggestionActionCardProps) {
  const { state } = agentSuggestion;
  const cardState = disabled
    ? "disabled"
    : mapSuggestionStateToCardState(state);

  const labels = getLabels(agentSuggestion);

  return (
    <ActionCardBlock
      title={labels.title}
      applyLabel="Accept"
      acceptedTitle={labels.acceptedTitle}
      rejectedTitle={labels.rejectedTitle}
      visual={
        pictureUrl ? (
          <Avatar visual={pictureUrl} size="sm" />
        ) : (
          <Avatar icon={getIcon("ActionRobotIcon")} size="sm" />
        )
      }
      description={labels.description}
      state={cardState}
      actionsPosition="header"
      onClickAccept={onAccept}
      onClickReject={onReject}
    />
  );
}
