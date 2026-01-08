import { Button, Input, SparklesIcon, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { BLUR_EVENT_NAME } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { getDescriptionSuggestion } from "@app/components/agent_builder/settings/utils";
import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { useSendNotification } from "@app/hooks/useNotification";

const DESCRIPTION_FIELD_NAME = "agentSettings.description";
const MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS = 20;

interface AgentBuilderDescriptionSectionProps {
  isCreatingNew: boolean;
}

export function AgentBuilderDescriptionSection({
  isCreatingNew,
}: AgentBuilderDescriptionSectionProps) {
  const { owner } = useAgentBuilderContext();
  const { setValue } = useFormContext<AgentBuilderFormData>();
  const sendNotification = useSendNotification();

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
  const name = useWatch<AgentBuilderFormData, "agentSettings.name">({
    name: "agentSettings.name",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const blurListenerRef = useRef<() => void>();
  const userSetDescriptionRef = useRef(false);

  const handleGenerateDescription = useCallback(async () => {
    if (
      isGenerating ||
      userSetDescriptionRef.current ||
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      return;
    }

    setIsGenerating(true);

    const result = await getDescriptionSuggestion({
      owner,
      instructions,
      name: name || "Assistant",
    });

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to generate description",
        description: result.error.message,
      });
      setIsGenerating(false);
      return;
    }

    if (
      result.value.status === "ok" &&
      result.value.suggestions &&
      result.value.suggestions.length > 0
    ) {
      setValue(DESCRIPTION_FIELD_NAME, result.value.suggestions[0], {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      sendNotification({
        type: "info",
        title: "No description suggestions available",
        description:
          "Try adding more details to your instructions to get better suggestions.",
      });
    }
    setIsGenerating(false);
  }, [instructions, isGenerating, name, owner, sendNotification, setValue]);

  useEffect(() => {
    const onInstructionsBlur = () => {
      if (isCreatingNew && !userSetDescriptionRef.current) {
        void handleGenerateDescription();
      }
    };

    blurListenerRef.current = onInstructionsBlur;
    window.addEventListener(BLUR_EVENT_NAME, onInstructionsBlur);

    return () => {
      if (blurListenerRef.current) {
        window.removeEventListener(BLUR_EVENT_NAME, blurListenerRef.current);
      }
    };
  }, [handleGenerateDescription, isCreatingNew]);

  return (
    <BaseFormFieldSection
      title="Description"
      fieldName={DESCRIPTION_FIELD_NAME}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <div className="relative">
          <Input
            ref={registerRef}
            placeholder="Enter agent description"
            onChange={(e) => {
              userSetDescriptionRef.current = true;
              onChange(e);
            }}
            message={errorMessage}
            messageStatus={hasError ? "error" : "default"}
            {...registerProps}
          />
          <Button
            icon={isGenerating ? () => <Spinner size="xs" /> : SparklesIcon}
            variant="outline"
            size="xs"
            className="absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0"
            disabled={
              isGenerating ||
              !instructions ||
              instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
            }
            onClick={handleGenerateDescription}
            tooltip={
              isGenerating
                ? "Generating description..."
                : !instructions ||
                    instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
                  ? `Add at least ${MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS} characters to the instructions to get suggestions`
                  : "Generate description"
            }
          />
        </div>
      )}
    </BaseFormFieldSection>
  );
}
