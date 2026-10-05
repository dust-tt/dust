import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { PodMetadataType } from "@app/types/project_metadata";

export type GetPodMetadataResponseBody = {
  projectMetadata: PodMetadataType | null;
  defaultSkills?: SkillWithoutInstructionsAndToolsType[];
};

export type PatchPodMetadataResponseBody = {
  projectMetadata: PodMetadataType;
};
