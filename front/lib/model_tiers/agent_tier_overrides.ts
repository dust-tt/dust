import { expandTiersUpTo } from "@app/lib/model_tiers/tier_order";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";

// Sidekick is free and picks its own model server-side (user model selections are
// ignored for it), so it always runs on the Standard stream whatever the member's
// own tier cap is. The Standard stream's candidates never exceed the `balanced`
// tier, so this can never hand a member a premium model.
const SIDEKICK_MAX_MODEL_TIER: ModelsTierName = "balanced";

// Tiers an agent may use regardless of the member's own tier grants, or null when
// the member's grants apply as usual.
export function getAgentAllowedTierNamesOverride(
  agentSId: string
): ModelsTierName[] | null {
  return agentSId === GLOBAL_AGENTS_SID.SIDEKICK
    ? expandTiersUpTo(SIDEKICK_MAX_MODEL_TIER)
    : null;
}
