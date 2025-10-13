import { useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { TagsSelector } from "@app/components/agent_builder/settings/TagsSelector";
import { fetchWithErr } from "@app/components/agent_builder/settings/utils";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";
import { useSendNotification } from "@app/hooks/useNotification";
import { useTags } from "@app/lib/swr/tags";
import type {
  APIError,
  BuilderSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";
import { isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

const MIN_INSTRUCTIONS_LENGTH_FOR_DROPDOWN_SUGGESTIONS = 20;

async function getTagsSuggestions({
  owner,
  instructions,
  description,
  tags,
}: {
  owner: WorkspaceType;
  instructions: string;
  description: string;
  tags: string[];
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "tags",
      inputs: {
        instructions,
        description,
        tags,
        isAdmin: false,
      },
    }),
  });
}

export function TagsSection() {
  const { owner } = useAgentBuilderContext();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { tags: allTags } = useTags({ owner });
  const {
    fields: selectedTags,
    append,
    remove,
  } = useFieldArray<AgentBuilderFormData, "agentSettings.tags">({
    name: "agentSettings.tags",
  });
  const sendNotification = useSendNotification();

  const [isSuggestLoading, setIsSuggestLoading] = useState(false);

  const instructions = getValues("instructions");

  const availableTagsCount = useMemo(() => {
    const currentTagIds = new Set(selectedTags.map((field) => field.sId));
    return allTags.filter((t) => !currentTagIds.has(t.sId)).length;
  }, [allTags, selectedTags]);

  const isButtonDisabled = useMemo(() => {
    return (
      isSuggestLoading ||
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_FOR_DROPDOWN_SUGGESTIONS ||
      availableTagsCount === 0
    );
  }, [isSuggestLoading, instructions, availableTagsCount]);

  const getSuggestedTags = async (): Promise<TagType[]> => {
    if (
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_FOR_DROPDOWN_SUGGESTIONS
    ) {
      return [];
    }

    try {
      const description = getValues("agentSettings.description");

      const tagsSuggestionsResult = await getTagsSuggestions({
        owner,
        instructions,
        description,
        tags: allTags.map((t) => t.name),
      });

      if (tagsSuggestionsResult.isOk()) {
        const tagsSuggestions = tagsSuggestionsResult.value;

        if (tagsSuggestions.status === "ok") {
          const currentTagIds = new Set(selectedTags.map((field) => field.sId));
          return allTags
            .filter((t) => !currentTagIds.has(t.sId))
            .filter((t) => isBuilder(owner) || t.kind !== "protected")
            .filter(
              (tag) =>
                tagsSuggestions.suggestions?.findIndex(
                  (t) => tag.name.toLowerCase() === t.toLowerCase()
                ) !== -1
            )
            .slice(0, 3);
        }
      }
    } catch (err) {
      sendNotification({
        title: "Could not get tag suggestions.",
        type: "error",
        description:
          "An error occurred while generating tag suggestions. Please contact us if the error persists.",
      });
    }

    return [];
  };

  const handleSuggestTags = async (): Promise<TagType[]> => {
    if (isSuggestLoading) {
      return [];
    }

    setIsSuggestLoading(true);

    try {
      const suggestedTags = await getSuggestedTags();

      if (suggestedTags.length === 0) {
        sendNotification({
          title: "No tag suggestions available",
          type: "info",
          description:
            "We couldn't find any relevant tags to suggest for this agent.",
        });
        return [];
      }

      return suggestedTags;
    } finally {
      setIsSuggestLoading(false);
    }
  };

  const handleAddTag = (tag: TagType) => {
    append(tag);
  };

  const handleRemoveTag = (tagId: string) => {
    const index = selectedTags.findIndex((field) => field.sId === tagId);
    if (index !== -1) {
      remove(index);
    }
  };

  return (
    <SettingSectionContainer title="Tags" className="h-full">
      <TagsSelector
        owner={owner}
        tags={selectedTags}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onSuggestTags={handleSuggestTags}
        isSuggestLoading={isSuggestLoading}
        isSuggestDisabled={isButtonDisabled}
        instructions={instructions}
      />
    </SettingSectionContainer>
  );
}
