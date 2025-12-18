import { Button, Input, SparklesIcon, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { getSkillDescriptionSuggestion } from "@app/components/skill_builder/utils";
import { useSendNotification } from "@app/hooks/useNotification";

const USER_FACING_DESCRIPTION_FIELD_NAME = "userFacingDescription";
const MIN_INSTRUCTIONS_LENGTH = 20;

export function SkillBuilderUserFacingDescriptionSection() {
  const { owner } = useSkillBuilderContext();
  const sendNotification = useSendNotification();
  const [isGenerating, setIsGenerating] = useState(false);
  const { setValue } = useFormContext<SkillBuilderFormData>();

  const instructions = useWatch<SkillBuilderFormData, "instructions">({
    name: "instructions",
  });
  const agentFacingDescription = useWatch<
    SkillBuilderFormData,
    "agentFacingDescription"
  >({
    name: "agentFacingDescription",
  });
  const tools = useWatch<SkillBuilderFormData, "tools">({
    name: "tools",
  });

  const canGenerate =
    instructions &&
    instructions.length >= MIN_INSTRUCTIONS_LENGTH &&
    agentFacingDescription &&
    agentFacingDescription.length > 0;

  const handleGenerateDescription = async () => {
    if (isGenerating || !canGenerate) {
      return;
    }

    setIsGenerating(true);

    const result = await getSkillDescriptionSuggestion({
      owner,
      instructions,
      agentFacingDescription,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    });

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to generate description",
        description: result.error.message,
      });
    } else if (result.value.suggestion) {
      setValue(USER_FACING_DESCRIPTION_FIELD_NAME, result.value.suggestion, {
        shouldDirty: true,
      });
    }

    setIsGenerating(false);
  };

  const getTooltip = () => {
    if (isGenerating) {
      return "Generating description...";
    }
    if (!instructions || instructions.length < MIN_INSTRUCTIONS_LENGTH) {
      return `Add at least ${MIN_INSTRUCTIONS_LENGTH} characters to instructions`;
    }
    if (!agentFacingDescription || agentFacingDescription.length === 0) {
      return "Add a description of when to use the skill";
    }
    return "Generate description";
  };

  return (
    <BaseFormFieldSection
      title="Description"
      fieldName={USER_FACING_DESCRIPTION_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <div className="relative">
          <Input
            ref={registerRef}
            placeholder="Enter skill description"
            onChange={onChange}
            message={errorMessage}
            messageStatus={hasError ? "error" : "default"}
            className="pr-10"
            {...registerProps}
          />
          <Button
            icon={isGenerating ? () => <Spinner size="xs" /> : SparklesIcon}
            variant="outline"
            size="xs"
            className="absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0"
            disabled={isGenerating || !canGenerate}
            onClick={handleGenerateDescription}
            tooltip={getTooltip()}
          />
        </div>
      )}
    </BaseFormFieldSection>
  );
}
