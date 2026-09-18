/**
 * Card for the "create" and "delete" agent suggestion kinds.
 *
 * Unlike the other agent suggestion kinds (tools, skills, model, knowledge, sub_agent,
 * instructions), these two don't depend on the agent builder's form context or its tiptap
 * instructions editor, so they can be rendered the same way from the agent builder sidekick and
 * from a plain conversation message. Accept/reject wiring is passed in by the caller instead of
 * being pulled from a context, so each surface can use its own data source.
 */

import { getIcon } from "@app/components/resources/resources_icons";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentCreateSuggestionType,
  AgentDeleteSuggestionType,
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

interface AgentCreateOrDeleteSuggestionCardProps {
  agentSuggestion: AgentCreateSuggestionType | AgentDeleteSuggestionType;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * @cc [owner:avervaet,label:react;architecture] no-suggestion-context-dependency
 * `AgentCreateOrDeleteSuggestionCard` MUST NOT read from `SidekickSuggestionsContext` or any other
 * provider, and MUST NOT fetch its own data: it is rendered by both the agent builder sidekick and
 * plain conversation messages, which have different data sources and no shared provider. Accept and
 * reject MUST come in as `onAccept`/`onReject` props.
 */
export function AgentCreateOrDeleteSuggestionCard({
  agentSuggestion,
  onAccept,
  onReject,
}: AgentCreateOrDeleteSuggestionCardProps) {
  const { kind, suggestion, state, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const name = suggestion.name;

  const labels =
    kind === "create"
      ? {
          title: `Create "${name}" agent`,
          acceptedTitle: `"${name}" agent creation accepted`,
          rejectedTitle: `"${name}" agent creation rejected`,
          description: analysis ?? suggestion.description,
        }
      : {
          title: `Delete "${name}" agent`,
          acceptedTitle: `"${name}" agent deletion accepted`,
          rejectedTitle: `"${name}" agent deletion rejected`,
          description: analysis ?? undefined,
        };

  return (
    <ActionCardBlock
      title={labels.title}
      applyLabel="Accept"
      acceptedTitle={labels.acceptedTitle}
      rejectedTitle={labels.rejectedTitle}
      visual={<Avatar icon={getIcon("ActionRobotIcon")} size="sm" />}
      description={labels.description}
      state={cardState}
      actionsPosition="header"
      onClickAccept={onAccept}
      onClickReject={onReject}
    />
  );
}
