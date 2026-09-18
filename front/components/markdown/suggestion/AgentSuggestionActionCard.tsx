/**
 * For cards that don't depend on the agent builder's form context or its tiptap
 * instructions editor, so they can be rendered from a plain conversation message.
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

interface AgentSuggestionActionCardProps {
  agentSuggestion: AgentCreateSuggestionType | AgentDeleteSuggestionType;
  onAccept: () => void;
  onReject: () => void;
  /** Forces the busy/disabled visual, e.g. while an accept/reject request is in flight. */
  disabled?: boolean;
}

/**
 * @cc [owner:avervaet,label:react;architecture] no-suggestion-context-dependency
 * This card MUST NOT read from any context or provider, and MUST NOT fetch its own data: it is
 * rendered from multiple call sites with different data sources and no guarantee of a shared
 * provider between them. Accept and reject MUST come in as `onAccept`/`onReject` props.
 */
export function AgentSuggestionActionCard({
  agentSuggestion,
  onAccept,
  onReject,
  disabled,
}: AgentSuggestionActionCardProps) {
  const { kind, suggestion, state, analysis } = agentSuggestion;
  const cardState = disabled
    ? "disabled"
    : mapSuggestionStateToCardState(state);
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
