import {
  Checkbox,
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
import { useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useCreateTag, useTagsSuggestions } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";

const MAX_TAG_LENGTH = 100;

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
  const [appliedSuggestion, setAppliedSuggestion] = useState<
    Record<string, boolean>
  >({});
  const { suggestions, isSuggestionsLoading, isSuggestionsError } =
    useTagsSuggestions({ owner, disabled: !isOpen });

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
      if (appliedSuggestion[s.name]) {
        const tag = await createTag(
          s.name,
          s.agents.map((a) => a.sId)
        );
        if (tag) {
          tags.push(tag);
        }
      }
    }

    await mutateAgentConfigurations();

    sendNotification({
      type: "success",
      title: "Tag suggestions applied",
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

  useEffect(() => {
    setAppliedSuggestion(
      suggestions.reduce(
        (acc, suggestion) => {
          acc[suggestion.name] = true;
          return acc;
        },
        {} as Record<string, boolean>
      )
    );
  }, [suggestions]);

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
        <DialogContainer className="h-125">
          {isSuggestionsLoading && (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="-mt-4 max-h-125">
              <ScrollArea>
                <ContextItem.List>
                  {suggestions.map((suggestion) => (
                    <ContextItem
                      key={suggestion.name}
                      title=""
                      visual={undefined}
                      action={
                        <Checkbox
                          checked={appliedSuggestion[suggestion.name]}
                          onClick={() => {
                            setAppliedSuggestion((prev) => ({
                              ...prev,
                              [suggestion.name]: !prev[suggestion.name],
                            }));
                          }}
                        />
                      }
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
            label: "Apply tag suggestions",
            variant: "primary",
            onClick: handleCreateTag,
            disabled: !Object.values(appliedSuggestion).some((value) => value),
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
