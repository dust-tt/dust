// @vitest-environment node

import { AnthropicClaudeSonnetFiveGlobalEdgeeStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_global_edgee";
import { AnthropicClaudeSonnetFiveGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_five_global_anthropic.test";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

// Same expectations as Anthropic direct, not yet verified against the live Edgee gateway.
export const AnthropicClaudeSonnetFiveGlobalEdgeeStreamSetup: StreamSetup = {
  ...AnthropicClaudeSonnetFiveGlobalAnthropicStreamSetup,
  createInstance: () =>
    new AnthropicClaudeSonnetFiveGlobalEdgeeStream({
      EDGEE_API_KEY: process.env.EDGEE_TEST_API_KEY ?? "",
    }),
};

// EDGEE_TEST_API_KEY=... NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 lib/model_constructors/test/endpoints/anthropic_claude_sonnet_five_global_edgee.test.ts
runStreamEndpointTests(
  AnthropicClaudeSonnetFiveGlobalEdgeeStream,
  AnthropicClaudeSonnetFiveGlobalEdgeeStreamSetup
);
