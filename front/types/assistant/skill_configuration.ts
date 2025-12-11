import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";

export type SkillStatus = "active" | "archived";

export type SkillConfigurationType = {
  id: number;
  sId: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  status: SkillStatus;
  name: string;
  description: string;
  instructions: string;
  requestedSpaceIds: ModelId[];
  tools: { mcpServerViewId: string }[];
  isGlobal: boolean;
};

export type SkillConfigurationRelations = {
  usage: AgentsUsageType;
  editors: UserType[];
};
