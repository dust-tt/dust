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
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useCreateTag, useTags, useTagsSuggestions } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";

export const MAX_TAG_LENGTH = 100;

export const TagsSuggestDialog = ({
  owner,
  isOpen,
  setIsOpen,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  const { createTag } = useCreateTag({ owner });
  const sendNotification = useSendNotification();

  const { suggestions, isSuggestionsLoading, isSuggestionsError } =
    useTagsSuggestions({ owner, disabled: !isOpen });
  const { mutateTags } = useTags({
    owner,
    disabled: true,
  });

  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "manage",
      includes: ["authors", "usage", "feedbacks"],
      disabled: true,
    });

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

    await mutateTags();
    await mutateAgentConfigurations();

    sendNotification({
      type: "success",
      title: "Tagging plan applied",
      description: "All tags have been successfully created for your agents.",
    });
  };

  useEffect(() => {
    if (isSuggestionsError) {
      sendNotification({
        type: "error",
        title: "Error getting suggestions",
        description:
          "Please try again. If the problem persists, please contact support.",
      });

      setIsOpen(false);
    }
  }, [isSuggestionsError, sendNotification, setIsOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Agent tag suggestions</DialogTitle>
          <DialogDescription>
            {isSuggestionsLoading ? (
              <>Analyzing your agents to create tags...</>
            ) : (
              <>Tag suggestions from your workspace agents:</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer className="h-[500px]">
          {isSuggestionsLoading && (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="-mt-4 max-h-[500px]">
              <ScrollArea>
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
            </div>
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
