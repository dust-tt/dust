import { FeedbackSelectorPopoverContent } from "@app/components/assistant/conversation/FeedbackSelectorPopoverContent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Label,
  MagicIcon,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useController, useForm } from "react-hook-form";
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

const OTHER_ANSWER = "Other";

const FEEDBACK_PREDEFINED_ANSWERS = [
  "Factually incorrect",
  "Didn’t follow instructions",
  "Don’t like the tone",
  "Wrong data sources",
  "Took too long",
  OTHER_ANSWER,
] as const;

const feedbackSchema = z
  .object({
    thumbDirection: z.enum(["up", "down"]).nullable().default(null),
    selectedAnswer: z.string().default(""),
    feedbackContent: z.string().default(""),
    isConversationShared: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.thumbDirection !== "down") {
        return true;
      }
      const hasAnswer =
        data.selectedAnswer.length > 0 && data.selectedAnswer !== OTHER_ANSWER;
      const hasContent = data.feedbackContent.trim().length > 0;
      return hasAnswer || hasContent;
    },
    {
      message: "Please select a reason or describe the issue.",
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
  const isSidekick = agentConfigurationId === GLOBAL_AGENTS_SID.SIDEKICK;
  // Predefined answers are not so relevant in the context of sidekick.
  const showPredefinedAnswers = !isSidekick;

  const improveLabel = isGlobalAgent
    ? "Provide feedback"
    : "Improve this agent";

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      thumbDirection: null,
      selectedAnswer: "",
      feedbackContent: "",
      isConversationShared: true,
    },
  });

  const thumbDirectionField = useController({
    control: form.control,
    name: "thumbDirection",
  });
  const selectedAnswerField = useController({
    control: form.control,
    name: "selectedAnswer",
  });
  const feedbackContentField = useController({
    control: form.control,
    name: "feedbackContent",
  });
  const isConversationSharedField = useController({
    control: form.control,
    name: "isConversationShared",
  });

  const thumbDirection = thumbDirectionField.field.value;

  const handleButtonClick = async () => {
    if (feedback) {
      await onSubmitThumb({
        thumb: feedback.thumb,
        shouldRemoveExistingFeedback: true,
        feedbackContent: null,
        isConversationShared: false,
      });
    } else {
      setIsDialogOpen(true);
    }
  };

  const handleThumbSelect = (direction: ThumbReaction) => {
    thumbDirectionField.field.onChange(direction);
    form.clearErrors();
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    form.reset();
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!data.thumbDirection) {
      return;
    }

    const predefinedAnswer = data.selectedAnswer.trim();
    const details = data.feedbackContent.trim();

    const feedbackContent =
      [predefinedAnswer, details].filter(Boolean).join("\n\n") || null;

    await onSubmitThumb({
      thumb: data.thumbDirection,
      shouldRemoveExistingFeedback: false,
      feedbackContent,
      isConversationShared: data.isConversationShared,
    });
    closeDialog();
  });

  return (
    <div className="flex items-center">
      <Button
        variant={feedback ? "primary" : "outline"}
        size="xs"
        disabled={isSubmittingThumb}
        onClick={handleButtonClick}
        icon={MagicIcon}
        label={improveLabel}
        className={feedback ? "" : "text-muted-foreground"}
      />

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
            <DialogTitle>Provide feedback on @{agentName}</DialogTitle>
          </DialogHeader>

          <DialogContainer className="py-3">
            {isSubmittingThumb ? (
              <div className="m-3 flex items-center justify-center">
                <Spinner size="xs" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 pt-2">
                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">Was this answer helpful?</p>
                  <div className="flex gap-2">
                    <Button
                      label="Yes, helpful"
                      icon={HandThumbUpIcon}
                      size="sm"
                      variant={thumbDirection === "up" ? "primary" : "outline"}
                      onClick={() => handleThumbSelect("up")}
                    />
                    <Button
                      label="Needs work"
                      icon={HandThumbDownIcon}
                      size="sm"
                      variant={
                        thumbDirection === "down" ? "primary" : "outline"
                      }
                      onClick={() => handleThumbSelect("down")}
                    />
                  </div>
                </div>

                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{
                    gridTemplateRows: thumbDirection ? "1fr" : "0fr",
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-4 pt-2">
                      <div>
                        <Label
                          htmlFor="feedback-content"
                          className="mb-2 block"
                        >
                          {thumbDirection === "down"
                            ? "What was the issue?"
                            : "Glad you liked it! Tell us more?"}
                        </Label>

                        {showPredefinedAnswers && (
                          <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{
                              gridTemplateRows:
                                thumbDirection === "down" ? "1fr" : "0fr",
                            }}
                          >
                            <div className="overflow-hidden">
                              <div className="mb-3 flex flex-wrap gap-2">
                                {FEEDBACK_PREDEFINED_ANSWERS.map((answer) => (
                                  <Button
                                    key={answer}
                                    label={answer}
                                    size="xs"
                                    variant={
                                      selectedAnswerField.field.value ===
                                      answer
                                        ? "primary"
                                        : "outline"
                                    }
                                    onClick={() => {
                                      selectedAnswerField.field.onChange(
                                        selectedAnswerField.field.value ===
                                          answer
                                          ? ""
                                          : answer
                                      );
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        <TextArea
                          id="feedback-content"
                          placeholder={
                            thumbDirection === "down"
                              ? "Describe what went wrong"
                              : "Share details"
                          }
                          resize="vertical"
                          rows={3}
                          value={feedbackContentField.field.value}
                          onChange={(e) =>
                            feedbackContentField.field.onChange(e.target.value)
                          }
                          error={
                            feedbackContentField.fieldState.error?.message ??
                            null
                          }
                          showErrorLabel={
                            !!feedbackContentField.fieldState.error
                          }
                        />
                      </div>

                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="share-conversation"
                          checked={isConversationSharedField.field.value}
                          onCheckedChange={(value) => {
                            isConversationSharedField.field.onChange(!!value);
                          }}
                          size="xs"
                          className="mt-1"
                        />
                        <div className="flex flex-col">
                          <Label htmlFor="share-conversation">
                            Share conversation with the agent’s editors
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            Helps editors improve the agent
                          </span>
                        </div>
                      </div>

                      <FeedbackSelectorPopoverContent
                        owner={owner}
                        agentConfigurationId={agentConfigurationId}
                        isGlobalAgent={isGlobalAgent}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContainer>

          <DialogFooter
            rightButtonProps={{
              label: "Submit",
              variant: "primary",
              onClick: handleSubmit,
              disabled: !thumbDirection || isSubmittingThumb,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
