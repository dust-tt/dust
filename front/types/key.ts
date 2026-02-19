import type { ModelId } from "@app/types/shared/model_id";
import type { RoleType } from "@app/types/user";

export type KeyType = {
  id: ModelId;
  createdAt: number;
  lastUsedAt: number | null;
  creator: string | null;
  secret: string;
  status: string;
  name: string;
  groupId: ModelId;
  role: RoleType;
  scope: "default" | "restricted_group_only";
  monthlyCapMicroUsd: number | null;
};
