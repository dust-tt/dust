import {
  Chip,
  ContextItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Spinner,
} from "@dust-tt/sparkle";

import { useCreateTag, useTagsSuggestions } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

export const MAX_TAG_LENGTH = 100;

export const TagsSuggestDialog = ({
  owner,
  isOpen,
  setIsOpen,
  onTagsCreated,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onTagsCreated: (tags: TagType[]) => void;
}) => {
  const { createTag } = useCreateTag({ owner });

  const { suggestions, isSuggestionsLoading } = useTagsSuggestions({ owner });

  const handleCreateTag = async () => {
    const tags = [];
    for (const s of suggestions) {
      const tag = await createTag(
        s.name,
        s.agents.map((a) => a.sId)
      );
      if (tag) {
        tags.push(tag);
      }
    }
    onTagsCreated(tags);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Agent tag suggestions</DialogTitle>
          <DialogDescription>
            {isSuggestionsLoading ? (
              <>Analyzing your agents to create tags...</>
            ) : (
              <>Tag suggestions from your workspace agents :</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isSuggestionsLoading && (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {suggestions.length > 0 && (
            <ScrollArea className="max-h-[500px]">
              <ContextItem.List>
                {suggestions.map((suggestion) => (
                  <ContextItem
                    key={suggestion.name}
                    title=""
                    visual={undefined}
                  >
                    <Chip
                      size="xs"
                      label={suggestion.name}
                      color="golden"
                      className="mb-2"
                    />
                    <ContextItem.Description
                      description={suggestion.agents
                        .map((agent) => `@${agent.name}`)
                        .join(", ")}
                    />
                  </ContextItem>
                ))}
              </ContextItem.List>
            </ScrollArea>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Apply tagging plan",
            variant: "primary",
            onClick: handleCreateTag,
            disabled: suggestions.length === 0,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
