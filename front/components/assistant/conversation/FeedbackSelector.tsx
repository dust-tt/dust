import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ButtonGroup,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HandThumbUpIcon,
  Label,
  MagicIcon,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

export type ThumbReaction = "up" | "down";

export type FeedbackType = {
  thumb: ThumbReaction;
  feedbackContent: string | null;
  isConversationShared: boolean;
};

export interface FeedbackSelectorBaseProps {
  feedback: FeedbackType | null;
  onSubmitThumb: (
    p: FeedbackType & {
      shouldRemoveExistingFeedback: boolean;
    }
  ) => Promise<void>;
  isSubmittingThumb: boolean;
}

interface FeedbackSelectorProps extends FeedbackSelectorBaseProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  agentName: string;
  isGlobalAgent: boolean;
}

function makeFeedbackSchema(thumbDirection: ThumbReaction) {
  return z.object({
    feedbackContent:
      thumbDirection === "down"
        ? z.string().min(1, "Please describe what should be improved.")
        : z.string(),
    isConversationShared: z.boolean(),
  });
}

type FeedbackFormValues = z.infer<ReturnType<typeof makeFeedbackSchema>>;

export function FeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
  agentName,
}: FeedbackSelectorProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [thumbDirection, setThumbDirection] =
    React.useState<ThumbReaction>("up");

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(makeFeedbackSchema(thumbDirection)),
    defaultValues: {
      feedbackContent: "",
      isConversationShared: true,
    },
  });

  const openDialog = (direction: ThumbReaction) => {
    setThumbDirection(direction);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    form.reset();
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    const feedbackContent = data.feedbackContent.trim() || null;

    await onSubmitThumb({
      thumb: thumbDirection,
      shouldRemoveExistingFeedback: false,
      feedbackContent,
      isConversationShared: data.isConversationShared,
    });
    closeDialog();
  });

  const handleThumbClick = async (direction: ThumbReaction) => {
    const shouldRemoveExistingFeedback = feedback?.thumb === direction;
    if (shouldRemoveExistingFeedback) {
      await onSubmitThumb({
        thumb: direction,
        shouldRemoveExistingFeedback,
        feedbackContent: null,
        isConversationShared: false,
      });
      return;
    }

    openDialog(direction);
  };

  return (
    <div className="flex items-center">
      <ButtonGroup>
        <Button
          tooltip="I found this helpful"
          variant={feedback?.thumb === "up" ? "primary" : "outline"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => handleThumbClick("up")}
          icon={HandThumbUpIcon}
          className={feedback?.thumb === "up" ? "" : "text-muted-foreground"}
        />
        <Button
          tooltip="Improve this agent"
          variant="outline"
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => openDialog("down")}
          icon={MagicIcon}
          label="Improve this agent"
          className="text-muted-foreground"
        />
      </ButtonGroup>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                Improve @{agentName}
              </span>
            </DialogTitle>
          </DialogHeader>

          <DialogContainer className="py-3">
            {isSubmittingThumb ? (
              <div className="m-3 flex items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 pt-2">
                <div>
                  <div className="text-sm font-semibold mb-2">
                    {thumbDirection === "down"
                      ? "What should the agent do differently?"
                      : "Glad you liked it! Tell us more?"}
                  </div>
                  <Controller
                    control={form.control}
                    name="feedbackContent"
                    render={({ field, fieldState }) => (
                      <div>
                        <TextArea
                          placeholder={
                            thumbDirection === "down"
                              ? "Describe what didn’t work"
                              : "Share details (optional)"
                          }
                          resize="vertical"
                          rows={5}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          error={fieldState.error?.message ?? null}
                          showErrorLabel
                        />
                      </div>
                    )}
                  />
                </div>

                <Controller
                  control={form.control}
                  name="isConversationShared"
                  render={({ field }) => (
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="share-conversation"
                        checked={field.value}
                        onCheckedChange={(value) => {
                          field.onChange(!!value);
                        }}
                        size="xs"
                        className="mt-1"
                      />
                      <div className="flex flex-col">
                        <Label htmlFor="share-conversation">
                          Share conversation with the agent’s builders
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          Visible to whoever manages this agent.
                        </span>
                      </div>
                    </div>
                  )}
                />
              </div>
            )}
          </DialogContainer>

          <DialogFooter
            rightButtonProps={{
              label: "Submit",
              variant: "primary",
              onClick: handleSubmit,
              disabled: isSubmittingThumb,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
