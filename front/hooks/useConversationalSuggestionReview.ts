import {
  usePatchSkillSuggestions,
  useSkillSuggestions,
} from "@app/hooks/useSkillSuggestions";
import { useSuggestionActions } from "@app/hooks/useSuggestionActions";
import {
  useAgentSuggestions,
  usePatchAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSkill } from "@app/lib/swr/skill_configurations";

interface UseConversationAgentSuggestionReviewParams {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  skipAgentConfiguration: boolean;
}

/**
 * @cc [owner:avervaet,label:product] refetch-agent-on-accept
 * Once an accept request succeeds, the reviewed agent's configuration MUST be revalidated so the
 * applied change shows without a reload; a failed accept MUST NOT trigger it.
 */
/**
 * @cc [owner:avervaet,label:product] conversational-source-only
 * `suggestions` MUST only contain `conversational` suggestions of the agent created in
 * `conversationId`.
 */
export function useConversationAgentSuggestionReview({
  workspaceId,
  agentId,
  conversationId,
  skipAgentConfiguration,
}: UseConversationAgentSuggestionReviewParams) {
  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useAgentSuggestions({
      agentConfigurationId: agentId,
      workspaceId,
      sources: ["conversational"],
      conversationId,
    });

  const { patchSuggestions } = usePatchAgentSuggestions({
    agentConfigurationId: agentId,
    workspaceId,
  });
  const { getPendingAction, batchAcceptSuggestions, batchRejectSuggestions } =
    useSuggestionActions({ patchSuggestions, mutateSuggestions });

  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationValidating,
    mutateAgentConfiguration,
  } = useAgentConfiguration({
    workspaceId,
    agentConfigurationId: agentId,
    disabled: skipAgentConfiguration,
  });

  const acceptSuggestions = async (toAccept: { sId: string }[]) => {
    if (await batchAcceptSuggestions(toAccept)) {
      void mutateAgentConfiguration();
    }
  };

  return {
    suggestions,
    agentConfiguration,
    isLoading: isSuggestionsLoading || isAgentConfigurationLoading,
    isAgentConfigurationValidating,
    getPendingAction,
    acceptSuggestions,
    rejectSuggestions: batchRejectSuggestions,
  };
}

interface UseConversationSkillSuggestionReviewParams {
  workspaceId: string;
  skillId: string;
  conversationId: string;
}

/**
 * @cc [owner:avervaet,label:product] refetch-skill-on-accept
 * Once an accept request succeeds, the reviewed skill MUST be revalidated so the applied change
 * shows without a reload; a failed accept MUST NOT trigger it.
 */
/**
 * @cc [owner:avervaet,label:product] conversational-source-only
 * `suggestions` MUST only contain `conversational` suggestions of the skill created in
 * `conversationId`.
 */
export function useConversationSkillSuggestionReview({
  workspaceId,
  skillId,
  conversationId,
}: UseConversationSkillSuggestionReviewParams) {
  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useSkillSuggestions({
      skillId,
      workspaceId,
      sources: ["conversational"],
      conversationId,
    });

  const { skill, isSkillLoading, mutateSkillRegardlessOfQueryParams } =
    useSkill({
      workspaceId,
      skillId,
    });

  const { patchSuggestions } = usePatchSkillSuggestions({
    skillId,
    workspaceId,
  });
  const { getPendingAction, batchAcceptSuggestions, batchRejectSuggestions } =
    useSuggestionActions({ patchSuggestions, mutateSuggestions });

  const acceptSuggestions = async (toAccept: { sId: string }[]) => {
    if (await batchAcceptSuggestions(toAccept)) {
      mutateSkillRegardlessOfQueryParams();
    }
  };

  return {
    suggestions,
    skill,
    isLoading: isSuggestionsLoading || isSkillLoading,
    getPendingAction,
    acceptSuggestions,
    rejectSuggestions: batchRejectSuggestions,
  };
}
