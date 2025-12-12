import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";

export type SkillStatus = "active" | "archived";

export type SkillConfigurationType = {
  id: number;
  sId: string;
  createdAt: number;
  updatedAt: number | null;
  status: SkillStatus;
  name: string;
  description: string;
  instructions: string | null;
  icon: string | null;
  requestedSpaceIds: ModelId[];
  tools: { mcpServerViewId: string }[];
  canWrite: boolean;
};

export type SkillConfigurationRelations = {
  usage: AgentsUsageType;
  editors: UserType[] | null;
};
