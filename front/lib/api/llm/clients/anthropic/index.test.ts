import { buildSystemBlocks } from "@app/lib/api/llm/clients/anthropic/index";
import type { StructuredSystemPrompt } from "@app/lib/api/llm/types/options";
import { TOOL_SEARCH_INSTRUCTION } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { describe, expect, it } from "vitest";

const prompt: StructuredSystemPrompt = {
  instructions: [{ role: "instruction", content: "You are a helpful agent." }],
  sharedContext: [{ role: "context", content: "Shared directives." }],
  ephemeralContext: [{ role: "context", content: "Per-call data." }],
};

function systemText(blocks: { text: string }[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}

describe("buildSystemBlocks", () => {
  it("omits the tool search instruction by default", () => {
    const blocks = buildSystemBlocks(prompt, {});

    expect(systemText(blocks)).not.toContain(TOOL_SEARCH_INSTRUCTION);
  });

  it("appends the tool search instruction to the shared tier when requested", () => {
    const blocks = buildSystemBlocks(prompt, {
      includeToolSearchInstruction: true,
    });

    // The instruction lands in the shared tier, not the instructions tier (see
    // the placement rationale in buildSystemBlocks).
    const sharedBlock = blocks.find((b) =>
      b.text.includes("Shared directives.")
    );
    expect(sharedBlock?.text).toContain(TOOL_SEARCH_INSTRUCTION);

    const instructionsBlock = blocks.find((b) =>
      b.text.includes("You are a helpful agent.")
    );
    expect(instructionsBlock?.text).not.toContain(TOOL_SEARCH_INSTRUCTION);
  });

  it("emits a shared block carrying the instruction even with no shared context", () => {
    const blocks = buildSystemBlocks(
      { ...prompt, sharedContext: [] },
      { includeToolSearchInstruction: true }
    );

    expect(systemText(blocks)).toContain(TOOL_SEARCH_INSTRUCTION);
  });
});
