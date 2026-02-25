import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { BLUR_EVENT_NAME } from "@app/components/agent_builder/instructions/constants";
import { getNameSuggestions } from "@app/components/agent_builder/settings/utils";
import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

const NAME_FIELD_NAME = "agentSettings.name";
const MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS = 20;

interface AgentBuilderNameSectionProps {
  isCreatingNew?: boolean;
}

export function AgentBuilderNameSection({
  isCreatingNew = false,
}: AgentBuilderNameSectionProps) {
  const { owner } = useAgentBuilderContext();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();
  const sendNotification = useSendNotification();

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
  const description = useWatch<
    AgentBuilderFormData,
    "agentSettings.description"
  >({
    name: "agentSettings.description",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const userSetNameRef = useRef(false);

  const handleGenerateNameSuggestions = async () => {
    if (
      isGenerating ||
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      return;
    }

    setIsGenerating(true);
    setNameSuggestions([]);

    const result = await getNameSuggestions({
      owner,
      instructions,
      description,
    });

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to generate name suggestions",
        description: result.error.message,
      });
      setIsGenerating(false);
      return;
    }

    if (result.value.status === "ok" && result.value.suggestions) {
      setNameSuggestions(result.value.suggestions);
      if (result.value.suggestions.length === 0) {
        sendNotification({
          type: "info",
          title: "No suggestions available",
          description:
            "Try adding more details to your instructions to get better suggestions.",
        });
      }
    }

    setIsGenerating(false);
  };

  const handleSelectNameSuggestion = (suggestion: string) => {
    setValue(NAME_FIELD_NAME, suggestion, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleAutoGenerateName = useCallback(async () => {
    if (
      isGenerating ||
      userSetNameRef.current ||
      !instructions ||
      instructions.length < MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
    ) {
      return;
    }
    const currentName = getValues("agentSettings.name");
    if (currentName?.trim()) {
      return;
    }
    setIsGenerating(true);
    const result = await getNameSuggestions({
      owner,
      instructions,
      description: description ?? "",
    });
    if (
      result.isOk() &&
      result.value.status === "ok" &&
      result.value.suggestions?.[0]
    ) {
      setValue(NAME_FIELD_NAME, result.value.suggestions[0], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setIsGenerating(false);
  }, [description, getValues, instructions, isGenerating, owner, setValue]);

  useEffect(() => {
    if (!isCreatingNew) {
      return;
    }
    const onInstructionsBlur = () => {
      void handleAutoGenerateName();
    };
    window.addEventListener(BLUR_EVENT_NAME, onInstructionsBlur);
    return () =>
      window.removeEventListener(BLUR_EVENT_NAME, onInstructionsBlur);
  }, [handleAutoGenerateName, isCreatingNew]);

  return (
    <BaseFormFieldSection title="Name" fieldName={NAME_FIELD_NAME}>
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <div className="relative">
          <Input
            ref={registerRef}
            placeholder="Enter agent name"
            className="pr-10"
            onChange={(e) => {
              userSetNameRef.current = true;
              onChange(e);
            }}
            message={errorMessage}
            messageStatus={hasError ? "error" : "default"}
            {...registerProps}
          />
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) {
                void handleGenerateNameSuggestions();
              }
            }}
          >
            <DropdownMenuTrigger asChild>
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
                tooltip={
                  isGenerating
                    ? "Generating name..."
                    : !instructions ||
                        instructions.length <
                          MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
                      ? `Add at least ${MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS} characters to instructions to get suggestions`
                      : "Get name suggestions"
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              {isGenerating ? (
                <div className="flex items-center justify-center p-4">
                  <Spinner size="sm" />
                </div>
              ) : nameSuggestions.length > 0 ? (
                nameSuggestions.map((suggestion, index) => (
                  <DropdownMenuItem
                    key={`naming-suggestion-${index}`}
                    label={suggestion}
                    onClick={() => handleSelectNameSuggestion(suggestion)}
                  />
                ))
              ) : (
                <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                  No suggestions available
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </BaseFormFieldSection>
  );
}
