import type { ModelId } from "./shared/model_id";
import type { UserType } from "./user";

export type SkillStatus = "active" | "archived";
export type SkillScope = "private" | "workspace";

export type SkillConfigurationType = {
  sId: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  status: SkillStatus;
  scope: SkillScope;
  name: string;
  description: string;
  instructions: string;
  requestedSpaceIds: ModelId[];
};

export type SkillConfigurationWithAuthorType = SkillConfiguration & {
  author: Omit<UserType, "lastLoginAt" | "provider">;
};
