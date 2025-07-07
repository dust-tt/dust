import { Button, SparklesIcon, useSendNotification } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { TagsSelector } from "@app/components/agent_builder/settings/TagsSelector";
import { fetchWithErr } from "@app/components/agent_builder/settings/utils";
import { useTags } from "@app/lib/swr/tags";
import type {
  APIError,
  BuilderSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";
import { isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

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

interface TagsSuggestionsProps {
  tags: TagType[];
  onTagsChange: (tags: TagType[]) => void;
  tagsSuggestions: TagType[];
}

function TagsSuggestions({
  tags,
  onTagsChange,
  tagsSuggestions,
}: TagsSuggestionsProps) {
  const addTag = (tag: TagType) => {
    const isTagInAgent = tags.findIndex((t) => t.sId === tag.sId) !== -1;

    if (!isTagInAgent) {
      onTagsChange([...tags, tag]);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="text-muted-foregroup text-xs font-semibold dark:text-muted-foreground-night">
        Suggestions:
      </div>

      {tagsSuggestions.map((tag) => (
        <Button
          key={`tag-suggestion-${tag.sId}`}
          size="xs"
          variant="outline"
          label={tag.name}
          onClick={() => addTag(tag)}
        />
      ))}
    </div>
  );
}

export function TagsSection() {
  const { owner } = useAgentBuilderContext();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { tags: allTags } = useTags({ owner });
  const { field } = useController<AgentBuilderFormData, "agentSettings.tags">({
    name: "agentSettings.tags",
  });
  const sendNotification = useSendNotification();

  const selectedTags = field.value;

  const [tagsSuggestions, setTagsSuggestions] =
    useState<BuilderSuggestionsType>({
      status: "unavailable",
      reason: "irrelevant",
    });
  const [isTagsSuggestionLoading, setTagsSuggestionsLoading] = useState(false);

  const filteredTagsSuggestions = useMemo(() => {
    if (tagsSuggestions.status !== "ok") {
      return [];
    }
    const currentTagIds = new Set(selectedTags.map((t) => t.sId));
    // We make sure we don't suggest tags that already exists.
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
  }, [tagsSuggestions, selectedTags, allTags, owner]);

  const updateTagsSuggestions = async () => {
    setTagsSuggestionsLoading(true);

    try {
      // We don't need to subscribe to the values change,
      // so we should use getValues instead of useWatch.
      const instructions = getValues("instructions");
      const description = getValues("agentSettings.description");

      const tagsSuggestionsResult = await getTagsSuggestions({
        owner,
        instructions,
        description,
        tags: allTags.map((t) => t.name),
      });

      if (tagsSuggestionsResult.isOk()) {
        setTagsSuggestions(tagsSuggestionsResult.value);
      }
    } catch (err) {
      sendNotification({
        title: "Could not populate any tag suggestions.",
        type: "error",
        description:
          "An error occurred while generating tag suggestions. Please contact us if the error persists.",
      });
    } finally {
      setTagsSuggestionsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3>Tags</h3>
      {tagsSuggestions.status === "ok" &&
        filteredTagsSuggestions.length > 0 && (
          <TagsSuggestions
            tags={selectedTags}
            onTagsChange={field.onChange}
            tagsSuggestions={filteredTagsSuggestions}
          />
        )}
      <TagsSelector
        owner={owner}
        tags={selectedTags}
        onTagsChange={field.onChange}
        suggestionButton={
          <Button
            label="Suggest"
            size="xs"
            icon={SparklesIcon}
            variant="outline"
            isLoading={isTagsSuggestionLoading}
            onClick={updateTagsSuggestions}
          />
        }
      />
    </div>
  );
}
