import type {
  SkillType,
  SkillWithVersionType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import type { AgentsUsageType } from "@app/types/data_source";
import type { SpaceType } from "@app/types/space";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { UserType } from "@app/types/user";

export type GetPokeSkillsResponseBody = {
  skills: SkillType[];
};

// Request body for the poke skill-suggestion endpoint. The runtime validation schema lives with
// its only consumer, the handler (front-api/routes/poke/workspaces/[wId]/skills/suggestions.ts);
// this type only needs to describe the shape the client sends.
export type PostSkillSuggestionBodyType = {
  name: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  instructions: string;
  icon: string | null;
  mcpServerViewIds: string[];
};

export type PokeGetSkillDetails = {
  skill: SkillType;
  editedByUser: UserType | null;
  spaces: SpaceType[];
  // Agents that use this skill.
  agentsUsage: AgentsUsageType;
  // Parent skills that reference this skill.
  usedBySkills: UsedBySkillType[];
};

export type PokeGetSkillVersions = {
  versions: SkillWithVersionType[];
};

export type PokeListSkillSuggestions = {
  suggestions: SkillSuggestionType[];
};

export type PokeGetSkillSuggestionDetails = {
  suggestion: SkillSuggestionType;
  skillInstructionsHtml: string | null;
  skillAgentFacingDescription: string | null;
};
