import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";

export type ResourceSearchResult =
  | {
      type: "skill";
      resource: SkillWithoutInstructionsAndToolsType;
      score: number;
    }
  | { type: "agent"; resource: LightAgentConfigurationType; score: number };

export interface ResourceSearchResponse {
  results: ResourceSearchResult[];
  nextCursor: string | null;
}
