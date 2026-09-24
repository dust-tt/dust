import { getDelimitersConfiguration } from "@app/lib/llms/agent_message_content_parser";
import { DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_haiku_four_dot_five_global_anthropic";
import { CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION } from "@app/types/assistant/chain_of_thought_meta_prompt";
import { describe, expect, it } from "vitest";

describe("getDelimitersConfiguration", () => {
  it("parses chain-of-thought tags while streaming, as on reload", () => {
    expect(
      getDelimitersConfiguration({
        endpoint: DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream,
        temperature: 0.7,
      })
    ).toEqual(CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION);
  });
});
