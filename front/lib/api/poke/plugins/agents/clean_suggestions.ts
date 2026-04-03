import { createPlugin } from "@app/lib/api/poke/types";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import type {
  AgentSuggestionSource,
  AgentSuggestionState,
} from "@app/types/suggestions/agent_suggestion";
import {
  AGENT_SUGGESTION_SOURCES,
  AGENT_SUGGESTION_STATES,
} from "@app/types/suggestions/agent_suggestion";

export const cleanSuggestionsPlugin = createPlugin({
  manifest: {
    id: "clean-suggestions",
    name: "Clean Suggestions",
    description:
      "Delete suggestions matching selected states and sources. Selections are ANDed: a suggestion must match one of the selected states AND one of the selected sources to be deleted.",
    resourceTypes: ["agents"],
    args: {
      states: {
        type: "enum",
        label: "States",
        description: "Select which suggestion states to delete",
        values: mapToEnumValues(AGENT_SUGGESTION_STATES, (s) => ({
          label: s,
          value: s,
        })),
        multiple: true,
      },
      sources: {
        type: "enum",
        label: "Sources",
        description: "Select which suggestion sources to delete",
        values: mapToEnumValues(AGENT_SUGGESTION_SOURCES, (s) => ({
          label: s,
          value: s,
        })),
        multiple: true,
      },
    },
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const selectedStates = (args.states || []) as AgentSuggestionState[];
    const selectedSources = (args.sources || []) as AgentSuggestionSource[];

    if (selectedStates.length === 0 || selectedSources.length === 0) {
      return new Err(
        new Error("You must select at least one state and one source.")
      );
    }

    const suggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        resource.sId,
        {
          states: selectedStates,
          sources: selectedSources,
        }
      );

    if (suggestions.length === 0) {
      return new Ok({
        display: "text",
        value: "No suggestions matched the selected filters.",
      });
    }

    const deleteResult = await AgentSuggestionResource.bulkDelete(
      auth,
      suggestions
    );

    if (deleteResult.isErr()) {
      return new Err(deleteResult.error);
    }

    return new Ok({
      display: "text",
      value: `Deleted ${deleteResult.value} suggestion(s) matching states=[${selectedStates.join(", ")}] and sources=[${selectedSources.join(", ")}].`,
    });
  },
  isApplicableTo: (_auth, resource) => {
    if (!resource) {
      return false;
    }
    return resource.status === "active";
  },
});
