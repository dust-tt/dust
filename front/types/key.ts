import type { ModelId } from "@app/types/shared/model_id";
import type { SpaceType } from "@app/types/space";
import type { RoleType } from "@app/types/user";

// Per-API-key credit state, mirroring the per-user `memberships.creditState`
// but with only two states for new-pricing (credit) plans:
//   - "on_pool": the key can spend from the workspace pool.
//   - "capped": the key hit its admin-configured per-key spend cap and is
//     blocked until the cap resets (billing-period renewal) or is raised.
export const API_KEY_CREDIT_STATES = ["on_pool", "capped"] as const;

export type ApiKeyCreditState = (typeof API_KEY_CREDIT_STATES)[number];

export function isApiKeyCreditState(
  value: unknown
): value is ApiKeyCreditState {
  return (
    typeof value === "string" &&
    (API_KEY_CREDIT_STATES as readonly string[]).includes(value)
  );
}

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
