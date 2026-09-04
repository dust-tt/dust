import type { ModelId } from "@app/types/shared/model_id";
import type { SpaceType } from "@app/types/space";
import type { RoleType } from "@app/types/user";

export type KeyType = {
  id: ModelId;
  createdAt: number;
  lastUsedAt: number | null;
  creator: string | null;
  secret: string;
  status: string;
  name: string;
  spaces: SpaceType[];
  role: RoleType;
  monthlyCapMicroUsd: number | null;
  monthlyCapAwuCredits: number | null;
  // "Blocked by the per-key spend cap" verdict — the signal the UI uses to show
  // the "capped" status, from the Redis rate-limiter counter. Mirrors
  // enforcement in lib/api/credits/access_control.ts (`isApiKeyBlocked`).
  isSpendCapped: boolean;
};
