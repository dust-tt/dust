import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import {
  SKILL_BUILDER_AGENT_DESCRIPTION_BLUR_EVENT,
  SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT,
} from "@app/components/skill_builder/events";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/skillBuilderFormSchema";
import { getSkillDescriptionSuggestion } from "@app/components/skill_builder/utils";
import { useAutoGenerateOnBlur } from "@app/hooks/useAutoGenerateOnBlur";
import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { isEmptyString } from "@app/types/shared/utils/general";
import { Button, Input, Spinner, Stars02 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

const USER_FACING_DESCRIPTION_FIELD_NAME = "userFacingDescription";
const MIN_INSTRUCTIONS_LENGTH = 20;

export function SkillBuilderUserFacingDescriptionSection() {
  const { t } = useLingui();
  const { owner } = useSkillBuilderContext();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const [isGenerating, setIsGenerating] = useState(false);

  const { field } = useController<
    SkillBuilderFormData,
    typeof USER_FACING_DESCRIPTION_FIELD_NAME
  >({
    name: USER_FACING_DESCRIPTION_FIELD_NAME,
  });
  const isReadOnly = field.disabled ?? false;

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

  const canGenerate = useMemo(
    () =>
      instructions &&
      instructions.length >= MIN_INSTRUCTIONS_LENGTH &&
      agentFacingDescription &&
      agentFacingDescription.length > 0,
    [instructions, agentFacingDescription]
  );

  const generateDescription = async (): Promise<boolean> => {
    if (isReadOnly || isGenerating || !canGenerate) {
      return false;
    }

    setIsGenerating(true);

    const result = await getSkillDescriptionSuggestion({
      owner,
      instructions,
      agentFacingDescription,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    });

    setIsGenerating(false);

    if (result.isErr()) {
      sendApiErrorNotification({
        title: t`Failed to generate description`,
        error: result.error,
      });
      return false;
    }

    if (isEmptyString(result.value.suggestion)) {
      return false;
    }

    field.onChange(result.value.suggestion);
    return true;
  };

  const { markAsUserEdited, generate } = useAutoGenerateOnBlur({
    fieldValue: field.value,
    onGenerate: generateDescription,
    blurEventNames: [
      SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT,
      SKILL_BUILDER_AGENT_DESCRIPTION_BLUR_EVENT,
    ],
  });

  const getTooltip = () => {
    if (isGenerating) {
      return t`Generating description...`;
    }
    if (!instructions || instructions.length < MIN_INSTRUCTIONS_LENGTH) {
      return t`Add at least ${MIN_INSTRUCTIONS_LENGTH} characters to instructions`;
    }
    if (!agentFacingDescription || agentFacingDescription.length === 0) {
      return t`Add a description of when to use the skill`;
    }
    return t`Generate description`;
  };

  return (
    <BaseFormFieldSection
      className="space-y-2"
      title={t`Description`}
      fieldName={USER_FACING_DESCRIPTION_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <>
          <div className="relative">
            <Input
              ref={registerRef}
              placeholder={t`Enter skill description`}
              onChange={(e) => {
                markAsUserEdited();
                onChange(e);
              }}
              isError={hasError}
              className="pr-10"
              {...registerProps}
            />
            <Button
              icon={isGenerating ? () => <Spinner size="xs" /> : Stars02}
              variant="outline"
              size="xs"
              className="absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0"
              disabled={isReadOnly || isGenerating || !canGenerate}
              onClick={generate}
              tooltip={getTooltip()}
            />
          </div>
          {errorMessage && (
            <div className="mt-1 text-xs text-warning">{errorMessage}</div>
          )}
        </>
      )}
    </BaseFormFieldSection>
  );
}
