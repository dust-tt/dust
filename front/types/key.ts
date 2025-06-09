import { RoleType } from "@app/types/user";
import type { ModelId } from "@app/types/shared/model_id";

export type KeyType = {
  id: ModelId;
  createdAt: number;
  lastUsedAt: number | null;
  creator: string | null;
  secret: string;
  status: string;
  name: string | null;
  groupId?: ModelId;
  role: RoleType;
};
