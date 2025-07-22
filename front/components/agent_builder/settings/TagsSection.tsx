import {
  Button,
  Chip,
  PopoverContent,
  PopoverTrigger,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { PopoverRoot } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { TagsSelector } from "@app/components/agent_builder/settings/TagsSelector";
import { fetchWithErr } from "@app/components/agent_builder/settings/utils";
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
  const { field } = useController<AgentBuilderFormData, "agentSettings.tags">({
    name: "agentSettings.tags",
  });
  const sendNotification = useSendNotification();

  const selectedTags = field.value;

  const [filteredTagsSuggestions, setFilteredTagsSuggestions] = useState<
    TagType[]
  >([]);
  const [isTagsSuggestionLoading, setTagsSuggestionsLoading] = useState(false);

  const updateTagsSuggestions = async () => {
    if (isTagsSuggestionLoading) {
      return;
    }

    const instructions = getValues("instructions");
    if (
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_FOR_DROPDOWN_SUGGESTIONS
    ) {
      return;
    }

    setTagsSuggestionsLoading(true);
    setFilteredTagsSuggestions([]);

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

        let filtered: TagType[] = [];
        if (tagsSuggestions.status === "ok") {
          const currentTagIds = new Set(selectedTags.map((t) => t.sId));
          // We make sure we don't suggest tags that already exists.
          filtered = allTags
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

        setFilteredTagsSuggestions(filtered);

        if (tagsSuggestions.status === "ok" && filtered.length === 0) {
          sendNotification({
            title: "No tag suggestions available",
            type: "info",
            description:
              "We couldn't find any relevant tags to suggest for this agent.",
          });
        }
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
    <div className="flex h-full flex-col gap-4">
      <h3>Tags</h3>
      <TagsSelector
        owner={owner}
        tags={selectedTags}
        onTagsChange={field.onChange}
        suggestionButton={
          <PopoverRoot onOpenChange={(open) => open && updateTagsSuggestions()}>
            <PopoverTrigger asChild>
              <Button
                label="Suggest"
                size="xs"
                icon={SparklesIcon}
                variant="outline"
                isSelect
                disabled={(() => {
                  const instructions = getValues("instructions");
                  return (
                    !instructions ||
                    instructions.length <
                      MIN_INSTRUCTIONS_LENGTH_FOR_DROPDOWN_SUGGESTIONS
                  );
                })()}
                tooltip={(() => {
                  const instructions = getValues("instructions");
                  return !instructions ||
                    instructions.length <
                      MIN_INSTRUCTIONS_LENGTH_FOR_DROPDOWN_SUGGESTIONS
                    ? "Add at least 20 characters to instructions to get suggestions"
                    : undefined;
                })()}
              />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              {isTagsSuggestionLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner size="sm" />
                </div>
              ) : filteredTagsSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground-night">
                    Suggestions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {filteredTagsSuggestions.map((tag) => (
                      <Chip
                        key={`tag-suggestion-chip-${tag.sId}`}
                        label={tag.name}
                        size="xs"
                        color="golden"
                        onClick={() => {
                          field.onChange([...selectedTags, tag]);
                          setFilteredTagsSuggestions((prev) =>
                            prev.filter((t) => t.sId !== tag.sId)
                          );
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                  No suggestions available
                </div>
              )}
            </PopoverContent>
          </PopoverRoot>
        }
      />
    </div>
  );
}
