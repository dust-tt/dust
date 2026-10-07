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
  AgentEditorsSuggestionType,
  AgentInstructionsSuggestionType,
  AgentModelSuggestionType,
  AgentNameSuggestionType,
  AgentScopeSuggestionType,
  AgentSkillsSuggestionType,
  AgentStructuredOutputSuggestionType,
  AgentSubAgentSuggestionType,
  AgentSuggestionState,
  AgentTagsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import type { ActionCardState } from "@dust-tt/sparkle";
import { ActionCardBlock, Avatar } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

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
  | AgentEditorsSuggestionType
  | AgentInstructionsSuggestionType
  | AgentModelSuggestionType
  | AgentNameSuggestionType
  | AgentScopeSuggestionType
  | AgentSkillsSuggestionType
  | AgentStructuredOutputSuggestionType
  | AgentSubAgentSuggestionType
  | AgentTagsSuggestionType
  | AgentToolsSuggestionType;

interface AgentSuggestionActionCardProps {
  agentSuggestion: AgentActionCardSuggestionType;
  onAccept: () => void;
  onReject: () => void;
  /** Forces the busy/disabled visual, e.g. while an accept/reject request is in flight. */
  disabled?: boolean;
  pictureUrl?: string;
}

function getAgentSuggestionLabels(
  agentSuggestion: AgentActionCardSuggestionType,
  t: (descriptor: MessageDescriptor) => string
): {
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
        title: t(msg`Create "${name}" agent`),
        acceptedTitle: t(msg`"${name}" agent creation accepted`),
        rejectedTitle: t(msg`"${name}" agent creation rejected`),
        description: analysis ?? description,
      };
    }

    case "delete": {
      const { name } = agentSuggestion.suggestion;
      return {
        title: t(msg`Delete "${name}" agent`),
        acceptedTitle: t(msg`"${name}" agent deletion accepted`),
        rejectedTitle: t(msg`"${name}" agent deletion rejected`),
        description: analysis ?? undefined,
      };
    }

    case "description": {
      const { description } = agentSuggestion.suggestion;
      return {
        title: t(msg`Change description to "${description}"`),
        acceptedTitle: t(msg`Description change to "${description}" accepted`),
        rejectedTitle: t(msg`Description change to "${description}" rejected`),
        description: analysis ?? undefined,
      };
    }

    case "model": {
      const modelName = getModelDisplayNameFromId(
        agentSuggestion.suggestion.modelId
      );
      return {
        title: t(msg`Change model to "${modelName}"`),
        acceptedTitle: t(msg`Model change to "${modelName}" accepted`),
        rejectedTitle: t(msg`Model change to "${modelName}" rejected`),
        description: analysis ?? undefined,
      };
    }

    case "name": {
      const { name } = agentSuggestion.suggestion;
      return {
        title: t(msg`Rename agent to "${name}"`),
        acceptedTitle: t(msg`Rename to "${name}" accepted`),
        rejectedTitle: t(msg`Rename to "${name}" rejected`),
        description: analysis ?? undefined,
      };
    }

    case "scope": {
      const isPublishing = agentSuggestion.suggestion.scope === "visible";
      return {
        title: isPublishing ? t(msg`Publish agent`) : t(msg`Unpublish agent`),
        acceptedTitle: isPublishing
          ? t(msg`Agent published`)
          : t(msg`Agent unpublished`),
        rejectedTitle: isPublishing
          ? t(msg`Publish rejected`)
          : t(msg`Unpublish rejected`),
        description: analysis ?? undefined,
      };
    }

    case "editors": {
      return {
        title: t(msg`Update agent editors`),
        acceptedTitle: t(msg`Editors update accepted`),
        rejectedTitle: t(msg`Editors update rejected`),
        description: analysis ?? undefined,
      };
    }

    case "tags": {
      return {
        title: t(msg`Update agent tags`),
        acceptedTitle: t(msg`Tags update accepted`),
        rejectedTitle: t(msg`Tags update rejected`),
        description: analysis ?? undefined,
      };
    }

    case "structured_output": {
      if (agentSuggestion.suggestion.responseFormat === null) {
        return {
          title: t(msg`Remove structured output`),
          acceptedTitle: t(msg`Structured output removal accepted`),
          rejectedTitle: t(msg`Structured output removal rejected`),
          description: analysis ?? undefined,
        };
      }
      return {
        title: t(msg`Update structured output`),
        acceptedTitle: t(msg`Structured output update accepted`),
        rejectedTitle: t(msg`Structured output update rejected`),
        description: analysis ?? undefined,
      };
    }

    case "instructions": {
      return {
        title: t(msg`Update agent instructions`),
        acceptedTitle: t(msg`Instructions update accepted`),
        rejectedTitle: t(msg`Instructions update rejected`),
        description: analysis ?? undefined,
      };
    }

    case "skills": {
      const isAddition = agentSuggestion.suggestion.action === "add";
      return {
        title: isAddition ? t(msg`Add a skill`) : t(msg`Remove a skill`),
        acceptedTitle: isAddition ? t(msg`Skill added`) : t(msg`Skill removed`),
        rejectedTitle: isAddition
          ? t(msg`Skill addition rejected`)
          : t(msg`Skill removal rejected`),
        description: analysis ?? undefined,
      };
    }

    case "sub_agent": {
      const isAddition = agentSuggestion.suggestion.action === "add";
      return {
        title: isAddition
          ? t(msg`Add a sub-agent`)
          : t(msg`Remove a sub-agent`),
        acceptedTitle: isAddition
          ? t(msg`Sub-agent added`)
          : t(msg`Sub-agent removed`),
        rejectedTitle: isAddition
          ? t(msg`Sub-agent addition rejected`)
          : t(msg`Sub-agent removal rejected`),
        description: analysis ?? undefined,
      };
    }

    case "tools": {
      const isAddition = agentSuggestion.suggestion.action === "add";
      return {
        title: isAddition ? t(msg`Add a tool`) : t(msg`Remove a tool`),
        acceptedTitle: isAddition ? t(msg`Tool added`) : t(msg`Tool removed`),
        rejectedTitle: isAddition
          ? t(msg`Tool addition rejected`)
          : t(msg`Tool removal rejected`),
        description: analysis ?? undefined,
      };
    }

    default:
      assertNeverAndIgnore(agentSuggestion);
      return {
        title: t(msg`Agent suggestion`),
        acceptedTitle: t(msg`Agent suggestion accepted`),
        rejectedTitle: t(msg`Agent suggestion rejected`),
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
  const { t } = useLingui();
  const { state } = agentSuggestion;
  const cardState = disabled
    ? "disabled"
    : mapSuggestionStateToCardState(state);

  const labels = getAgentSuggestionLabels(agentSuggestion, t);

  return (
    <ActionCardBlock
      title={labels.title}
      applyLabel={t`Accept`}
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
