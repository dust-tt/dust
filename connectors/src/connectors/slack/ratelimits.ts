// See slack docs for more details: https://docs.slack.dev/apis/web-api/rate-limits

import type { RateLimit } from "@connectors/lib/throttle";

export const RATE_LIMITS = {
  "chat.update": {
    limit: 50,
    windowInMs: 60 * 1000,
  },
  "users.info": {
    limit: 100,
    windowInMs: 60 * 1000,
  },
} satisfies Record<string, RateLimit>;
