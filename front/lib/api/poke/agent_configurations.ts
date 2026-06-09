import type { DatasourceRetrievalData } from "@app/lib/api/assistant/observability/datasource_retrieval";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SpaceType } from "@app/types/space";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { UserType } from "@app/types/user";

export type PokeAgentConfigurationType = LightAgentConfigurationType & {
  versionAuthor?: UserType | null;
};

export type PokeGetAgentConfigurationsResponseBody = {
  agentConfigurations: PokeAgentConfigurationType[];
};

export type PokeGetAgentDetails = {
  agentConfigurations: AgentConfigurationType[];
  authors: UserType[];
  lastVersionEditors: UserType[];
  spaces: SpaceType[];
  skillsByVersion: Record<number, SkillType[]>;
};

export type PokeGetDatasourceRetrievalResponse = {
  datasources: DatasourceRetrievalData[];
  total: number;
};

export type PokeListSuggestions = {
  suggestions: AgentSuggestionType[];
};
