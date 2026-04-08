import { createPlugin } from "@app/lib/api/poke/types";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import {
  isSkillSuggestionSource,
  isSkillSuggestionState,
  SKILL_SUGGESTION_SOURCES,
  SKILL_SUGGESTION_STATES,
} from "@app/types/suggestions/skill_suggestion";

export const cleanSkillSuggestionsPlugin = createPlugin({
  manifest: {
    id: "clean-skill-suggestions",
    name: "Clean Suggestions",
    description:
      "Delete suggestions matching selected states and sources. Selections are ANDed: a suggestion must match one of the selected states AND one of the selected sources to be deleted.",
    resourceTypes: ["skills"],
    args: {
      states: {
        type: "enum",
        label: "States",
        description: "Select which suggestion states to delete",
        values: mapToEnumValues(SKILL_SUGGESTION_STATES, (s) => ({
          label: s,
          value: s,
        })),
        multiple: true,
      },
      sources: {
        type: "enum",
        label: "Sources",
        description: "Select which suggestion sources to delete",
        values: mapToEnumValues(SKILL_SUGGESTION_SOURCES, (s) => ({
          label: s,
          value: s,
        })),
        multiple: true,
      },
    },
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Skill not found"));
    }

    const rawStates = args.states || [];
    const rawSources = args.sources || [];

    const invalidState = rawStates.find((s) => !isSkillSuggestionState(s));
    if (invalidState !== undefined) {
      return new Err(new Error(`Invalid suggestion state: "${invalidState}".`));
    }

    const invalidSource = rawSources.find((s) => !isSkillSuggestionSource(s));
    if (invalidSource !== undefined) {
      return new Err(
        new Error(`Invalid suggestion source: "${invalidSource}".`)
      );
    }

    const selectedStates = rawStates.filter(isSkillSuggestionState);
    const selectedSources = rawSources.filter(isSkillSuggestionSource);

    if (selectedStates.length === 0 || selectedSources.length === 0) {
      return new Err(
        new Error("You must select at least one state and one source.")
      );
    }

    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(
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

    const deleteResult = await SkillSuggestionResource.bulkDelete(
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
