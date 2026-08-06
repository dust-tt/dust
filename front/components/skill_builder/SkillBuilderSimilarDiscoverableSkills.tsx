import { SimilarSkillsDisplay } from "@app/components/skill_builder/SimilarSkillsDisplay";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useSimilarSkills, useSkills } from "@app/lib/swr/skill_configurations";
import type {
  SkillAvailability,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import { useCallback, useEffect, useState } from "react";
import { useWatch } from "react-hook-form";

const DEBOUNCE_DELAY_MS = 250;
const MIN_DESCRIPTION_LENGTH = 10;

const DISCOVERABLE_AVAILABILITIES: SkillAvailability[] = ["users_and_agents"];

// Skills available to members and agents are auto-discovered by agents, so a duplicate there is
// more harmful than elsewhere: we surface the overlap with that subset specifically.
export function SkillBuilderSimilarDiscoverableSkills() {
  const { owner, skillId } = useSkillBuilderContext();

  const { getSimilarSkills } = useSimilarSkills({ owner });
  const { skills } = useSkills({ owner });

  const availability = useWatch<SkillBuilderFormData, "availability">({
    name: "availability",
  });
  const agentFacingDescription = useWatch<
    SkillBuilderFormData,
    "agentFacingDescription"
  >({ name: "agentFacingDescription" });

  const [similarSkills, setSimilarSkills] = useState<
    SkillWithoutInstructionsAndToolsType[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSimilarSkills = useCallback(
    async (description: string, signal: AbortSignal) => {
      setIsLoading(true);

      const result = await getSimilarSkills(description, {
        excludeSkillId: skillId,
        availabilities: DISCOVERABLE_AVAILABILITIES,
        signal,
      });

      if (!signal.aborted) {
        setIsLoading(false);
        if (result.isOk()) {
          const similarSkillIds = new Set(result.value);
          setSimilarSkills(
            skills.filter((skill) => similarSkillIds.has(skill.sId))
          );
        }
      }
    },
    [getSimilarSkills, skillId, skills]
  );

  const triggerSimilarSkillsFetch = useDebounceWithAbort(fetchSimilarSkills, {
    delayMs: DEBOUNCE_DELAY_MS,
  });

  const isDiscoverable = availability === "users_and_agents";
  const description = agentFacingDescription?.trim() ?? "";

  // Runs on mount, whenever the description changes, and whenever the availability switches to
  // (or away from) "Members and agents".
  useEffect(() => {
    if (!isDiscoverable || description.length < MIN_DESCRIPTION_LENGTH) {
      setSimilarSkills([]);
      setIsLoading(false);
      return;
    }

    triggerSimilarSkillsFetch(description);
  }, [description, isDiscoverable, triggerSimilarSkillsFetch]);

  if (!isDiscoverable) {
    return null;
  }

  return (
    <SimilarSkillsDisplay
      owner={owner}
      similarSkills={similarSkills}
      isLoading={isLoading}
      loadingLabel="Checking for similar skills available to members and agents..."
      title="Similar skills already available to members and agents"
    />
  );
}
