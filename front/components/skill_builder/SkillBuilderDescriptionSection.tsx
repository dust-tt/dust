import { TextArea } from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { SimilarSkillsDisplay } from "@app/components/skill_builder/SimilarSkillsDisplay";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import {
  useSimilarSkills,
  useSkillConfigurations,
} from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

const DESCRIPTION_FIELD_NAME = "description";
const DEBOUNCE_DELAY_MS = 250;
const MIN_DESCRIPTION_LENGTH = 10;

export function SkillBuilderDescriptionSection() {
  const { owner } = useSkillBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const isSimilarSkillsEnabled = hasFeature("skills_similar_display");

  const { getSimilarSkills } = useSimilarSkills({ owner });
  const { skillConfigurations } = useSkillConfigurations({
    owner,
    disabled: !isSimilarSkillsEnabled,
  });

  const [similarSkills, setSimilarSkills] = useState<SkillConfigurationType[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);

  const fetchSimilarSkills = useCallback(
    async (description: string, signal: AbortSignal) => {
      if (!isSimilarSkillsEnabled) {
        return;
      }

      if (description.length < MIN_DESCRIPTION_LENGTH) {
        setSimilarSkills([]);
        setIsLoading(false);
        return;
      }

      const result = await getSimilarSkills(description, signal);

      // Only update state if the request was not aborted
      if (!signal.aborted) {
        setIsLoading(false);
        if (result.isOk()) {
          const similarSkillIds = result.value;
          const matchedSkills = skillConfigurations.filter((skill) =>
            similarSkillIds.includes(skill.sId)
          );
          setSimilarSkills(matchedSkills);
        }
      }
    },
    [getSimilarSkills, isSimilarSkillsEnabled, skillConfigurations]
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
      if (isSimilarSkillsEnabled) {
        const value = e.target.value;
        // Set loading immediately when description is long enough
        setIsLoading(value.length >= MIN_DESCRIPTION_LENGTH);
        triggerSimilarSkillsFetch(value);
      }
    },
    [triggerSimilarSkillsFetch, isSimilarSkillsEnabled]
  );

  return (
    <BaseFormFieldSection
      title="What will this skill be used for?"
      fieldName={DESCRIPTION_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <div className="space-y-3">
          <TextArea
            ref={registerRef}
            placeholder="When should this skill be used? What will this skill be good for?"
            className="min-h-24"
            onChange={(e) => handleDescriptionChange(e, onChange)}
            error={hasError ? errorMessage : undefined}
            showErrorLabel={hasError}
            {...registerProps}
          />
          {isSimilarSkillsEnabled && (
            <SimilarSkillsDisplay
              similarSkills={similarSkills}
              isLoading={isLoading}
            />
          )}
        </div>
      )}
    </BaseFormFieldSection>
  );
}
