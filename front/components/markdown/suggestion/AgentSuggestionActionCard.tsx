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
  AgentModelSuggestionType,
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

interface AgentSuggestionActionCardProps {
  agentSuggestion:
    | AgentCreateSuggestionType
    | AgentDeleteSuggestionType
    | AgentModelSuggestionType;
  onAccept: () => void;
  onReject: () => void;
  /** Forces the busy/disabled visual, e.g. while an accept/reject request is in flight. */
  disabled?: boolean;
  pictureUrl?: string;
}

export function AgentSuggestionActionCard({
  agentSuggestion,
  onAccept,
  onReject,
  disabled,
  pictureUrl,
}: AgentSuggestionActionCardProps) {
  const { state, analysis } = agentSuggestion;
  const cardState = disabled
    ? "disabled"
    : mapSuggestionStateToCardState(state);

  let labels: {
    title: string;
    acceptedTitle: string;
    rejectedTitle: string;
    description?: string;
  };
  switch (agentSuggestion.kind) {
    case "create": {
      const { name, description } = agentSuggestion.suggestion;
      labels = {
        title: `Create "${name}" agent`,
        acceptedTitle: `"${name}" agent creation accepted`,
        rejectedTitle: `"${name}" agent creation rejected`,
        description: analysis ?? description,
      };
      break;
    }
    case "delete": {
      const { name } = agentSuggestion.suggestion;
      labels = {
        title: `Delete "${name}" agent`,
        acceptedTitle: `"${name}" agent deletion accepted`,
        rejectedTitle: `"${name}" agent deletion rejected`,
        description: analysis ?? undefined,
      };
      break;
    }
    case "model": {
      const modelName = getModelDisplayNameFromId(
        agentSuggestion.suggestion.modelId
      );
      labels = {
        title: `Change model to "${modelName}"`,
        acceptedTitle: `Model change to "${modelName}" accepted`,
        rejectedTitle: `Model change to "${modelName}" rejected`,
        description: analysis ?? undefined,
      };
      break;
    }
    default:
      assertNeverAndIgnore(agentSuggestion);
      labels = { title: "", acceptedTitle: "", rejectedTitle: "" };
  }

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
