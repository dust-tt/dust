import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
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

const FEEDBACK_PREDEFINED_ANSWERS = [
  "Factually incorrect",
  "Didn’t fully follow instructions",
  "Don’t like the tone",
  "Wrong data sources",
  "Took too long",
  "Other (please explain below)",
] as const;

const OTHER_ANSWER = "Other (please explain below)";

const feedbackSchema = z
  .object({
    selectedAnswer: z.string(),
    feedbackContent: z.string(),
    isConversationShared: z.boolean(),
  })
  .refine(
    (data) =>
      data.selectedAnswer !== OTHER_ANSWER ||
      data.feedbackContent.trim().length > 0,
    {
      message: "Please describe what should be improved.",
      path: ["feedbackContent"],
    }
  );

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

export function FeedbackSelector({
  feedback,
  onSubmitThumb,
  isSubmittingThumb,
  owner,
  agentConfigurationId,
  agentName,
  isGlobalAgent,
}: FeedbackSelectorProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [thumbDirection, setThumbDirection] =
    React.useState<ThumbReaction>("up");

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      selectedAnswer: "",
      feedbackContent: "",
      isConversationShared: true,
    },
  });

  const selectedAnswer = form.watch("selectedAnswer");

  const openDialog = (direction: ThumbReaction) => {
    setThumbDirection(direction);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    form.reset();
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    const predefinedAnswer = data.selectedAnswer.trim();
    const details = data.feedbackContent.trim();

    const feedbackContent =
      [predefinedAnswer, details].filter(Boolean).join("\n\n") || null;

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
          variant={feedback?.thumb === "up" ? "primary" : "outline"}
          size="xs"
          disabled={isSubmittingThumb}
          onClick={() => handleThumbClick("up")}
          icon={HandThumbUpIcon}
          className={feedback?.thumb === "up" ? "" : "text-muted-foreground"}
        />
        <Button
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
        <DialogContent size="lg">
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
                <Spinner size="xs" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 pt-2">
                {thumbDirection === "down" && (
                  <div>
                    <Label className="mb-2 block">
                      What should the agent do differently?
                    </Label>
                    <Controller
                      control={form.control}
                      name="selectedAnswer"
                      render={({ field }) => (
                        <div className="flex flex-wrap gap-2">
                          {FEEDBACK_PREDEFINED_ANSWERS.map((answer) => (
                            <Button
                              key={answer}
                              label={answer}
                              size="xs"
                              variant={
                                field.value === answer ? "primary" : "outline"
                              }
                              onClick={() => {
                                field.onChange(
                                  field.value === answer ? "" : answer
                                );
                              }}
                            />
                          ))}
                        </div>
                      )}
                    />
                  </div>
                )}

                <div>
                  {thumbDirection === "up" && (
                    <Label htmlFor="feedback-content" className="mb-2 block">
                      Glad you liked it! Tell us more?
                    </Label>
                  )}
                  <Controller
                    control={form.control}
                    name="feedbackContent"
                    render={({ field, fieldState }) => (
                      <div>
                        <TextArea
                          id="feedback-content"
                          placeholder={
                            thumbDirection === "down"
                              ? "Add more details"
                              : "Share details"
                          }
                          resize="vertical"
                          rows={3}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          error={fieldState.error?.message ?? null}
                          showErrorLabel={selectedAnswer === OTHER_ANSWER}
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
                          Share conversation with the agent’s editors
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          Visible to whoever manages this agent.
                        </span>
                      </div>
                    </div>
                  )}
                />

                <FeedbackSelectorPopoverContent
                  owner={owner}
                  agentConfigurationId={agentConfigurationId}
                  isGlobalAgent={isGlobalAgent}
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
