import type { ModelId } from "./shared/model_id";
import type { UserType } from "./user";

export type SkillStatus = "active" | "archived";

export type SkillConfigurationType = {
  sId: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  status: SkillStatus;
  name: string;
  description: string;
  instructions: string;
  requestedSpaceIds: ModelId[];
  tools: { mcpServerViewId: string }[];
};

export type SkillConfigurationWithAuthorType = SkillConfigurationType & {
  author: Omit<UserType, "lastLoginAt" | "provider">;
};
