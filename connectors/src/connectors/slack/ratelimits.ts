// See slack docs for more details: https://docs.slack.dev/apis/web-api/rate-limits
// Tier 1: 1/min, Tier 2: 20/min, Tier 3: 50/min, Tier 4: 100+/min

import type { RateLimit } from "@connectors/lib/throttle";

export const RATE_LIMITS = {
  // Tier 3 methods (50/min) - apply conservative limit to avoid bursts
  "chat.update": {
    limit: 50,
    windowInMs: 60 * 1000,
  },
  "conversations.history": {
    limit: 40,
    windowInMs: 60 * 1000,
  },
  "conversations.replies": {
    limit: 40,
    windowInMs: 60 * 1000,
  },
  "conversations.info": {
    limit: 40,
    windowInMs: 60 * 1000,
  },
  // Tier 4 methods (100+/min)
  "users.info": {
    limit: 100,
    windowInMs: 60 * 1000,
  },
} satisfies Record<string, RateLimit>;
