import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { SKILL_BUILDER_AGENT_DESCRIPTION_BLUR_EVENT } from "@app/components/skill_builder/events";
import { SimilarSkillsDisplay } from "@app/components/skill_builder/SimilarSkillsDisplay";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useSimilarSkills, useSkills } from "@app/lib/swr/skill_configurations";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { TextArea } from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";

const AGENT_FACING_DESCRIPTION_FIELD_NAME = "agentFacingDescription";
const DEBOUNCE_DELAY_MS = 250;
const MIN_DESCRIPTION_LENGTH = 10;

export function SkillBuilderAgentFacingDescriptionSection() {
  const { owner, skillId } = useSkillBuilderContext();

  const { getSimilarSkills } = useSimilarSkills({ owner });
  const { skills } = useSkills({
    owner,
  });

  const [similarSkills, setSimilarSkills] = useState<SkillType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSimilarSkills = useCallback(
    async (description: string, signal: AbortSignal) => {
      if (description.length < MIN_DESCRIPTION_LENGTH) {
        setSimilarSkills([]);
        setIsLoading(false);
        return;
      }

      const result = await getSimilarSkills(description, {
        excludeSkillId: skillId, // Exclude the skill being edited.
        signal,
      });

      // Only update state if the request was not aborted
      if (!signal.aborted) {
        setIsLoading(false);
        if (result.isOk()) {
          const similarSkillIds = result.value;
          const similarSkillIdsSet = new Set(similarSkillIds);
          const matchedSkills = skills.filter((skill) =>
            similarSkillIdsSet.has(skill.sId)
          );
          setSimilarSkills(matchedSkills);
        }
      }
    },
    [getSimilarSkills, skillId, skills]
  );

  const triggerSimilarSkillsFetch = useDebounceWithAbort(fetchSimilarSkills, {
    delayMs: DEBOUNCE_DELAY_MS,
  });

  const handleDescriptionChange = useCallback(
    (
      e: ChangeEvent<HTMLTextAreaElement>,
      formOnChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
    ) => {
      formOnChange(e);
      const value = e.target.value;
      // Set loading immediately when description is long enough
      setIsLoading(value.length >= MIN_DESCRIPTION_LENGTH);
      triggerSimilarSkillsFetch(value);
    },
    [triggerSimilarSkillsFetch]
  );

  return (
    <BaseFormFieldSection
      title="What will this skill be used for?"
      titleClassName="heading-lg"
      fieldName={AGENT_FACING_DESCRIPTION_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <div className="space-y-3">
          <TextArea
            ref={registerRef}
            placeholder="When should this skill be used? What is this skill good for?"
            className="h-40 text-base placeholder:italic placeholder:text-gray-400"
            resize="vertical"
            onChange={(e) => handleDescriptionChange(e, onChange)}
            error={hasError ? errorMessage : undefined}
            showErrorLabel={hasError}
            {...registerProps}
            onBlur={() => {
              registerProps.onBlur();
              window.dispatchEvent(
                new CustomEvent(SKILL_BUILDER_AGENT_DESCRIPTION_BLUR_EVENT)
              );
            }}
          />
          <SimilarSkillsDisplay
            owner={owner}
            similarSkills={similarSkills}
            isLoading={isLoading}
          />
        </div>
      )}
    </BaseFormFieldSection>
  );
}
