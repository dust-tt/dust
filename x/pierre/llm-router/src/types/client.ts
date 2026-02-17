import type z from "zod";

import type { ClaudeSonnet4_5V20250929 } from "@/providers/anthropic/models/claude-sonnet-4-5-20250929";
import type { GptFiveDotTwoV20251211 } from "@/providers/openai/models/gpt-5.2-2025-12-11";
import type { Payload } from "./history";

export type StreamInput =
  | {
      modelId: typeof ClaudeSonnet4_5V20250929.modelId;
      payload: Payload;
      config: z.input<typeof ClaudeSonnet4_5V20250929.configSchema>;
    }
  | {
      modelId: typeof GptFiveDotTwoV20251211.modelId;
      payload: Payload;
      config: z.input<typeof GptFiveDotTwoV20251211.configSchema>;
    };
