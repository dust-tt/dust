import type { RateLimiterState } from "@app/lib/api/credits/members_usage";
import { Chip } from "@dust-tt/sparkle";

// The rate-limiter's verdict, rendered as a chip. Labels distinguish capped vs
// near-limit (both warning-toned).
const RATE_LIMITER_STATE_CHIP: Record<
  RateLimiterState,
  { color: "success" | "warning"; label: string }
> = {
  capped: { color: "warning", label: "capped" },
  near_limit: { color: "warning", label: "near limit" },
  ok: { color: "success", label: "ok" },
};

interface RateLimiterStateChipProps {
  rateLimiterState: RateLimiterState | null;
}

// A chip summarizing the rate-limiter verdict for a member or API key. Renders
// an em dash when the state is unknown (not yet computed).
export function RateLimiterStateChip({
  rateLimiterState,
}: RateLimiterStateChipProps) {
  if (rateLimiterState === null) {
    return <span>—</span>;
  }
  const { color, label } = RATE_LIMITER_STATE_CHIP[rateLimiterState];
  return <Chip size="xs" color={color} label={label} />;
}
