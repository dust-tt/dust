import {
  liveDelegationInput,
  mergeLiveTranscript,
  splitLiveAppend,
} from "@app/lib/client/live";
import { LiveEventSchema } from "@app/types/assistant/live";
import { describe, expect, it } from "vitest";

describe("GPT-Live protocol", () => {
  it("reads client delegation metadata without expecting task text", () => {
    expect(
      LiveEventSchema.parse({
        type: "session.delegation.created",
        event_id: "event_1",
        offset_ms: 1000,
        delegation: { id: "item_opaque", type: "delegation", target: "client" },
      })
    ).toMatchObject({ delegation: { id: "item_opaque" } });
  });

  it("orders late transcript fragments and preserves who said each one", () => {
    const input = liveDelegationInput([
      {
        id: "2",
        speaker: "user",
        text: "Actually, Thursday.",
        startMs: 2000,
        endMs: 2500,
      },
      {
        id: "1",
        speaker: "assistant",
        text: "Which day?",
        startMs: 1000,
        endMs: 1500,
      },
    ]);
    expect(input.indexOf("assistant: Which day?")).toBeLessThan(
      input.indexOf("user: Actually, Thursday.")
    );
  });

  it("chunks multilingual results within the append budget without losing text", () => {
    const text = "Résultat 日本語 🎙️ ".repeat(200);
    const chunks = splitLiveAppend(text);
    expect(chunks.join("")).toBe(text);
    expect(
      chunks.every((chunk) => new TextEncoder().encode(chunk).length <= 400)
    ).toBe(true);
    expect(splitLiveAppend("")).toEqual([]);
  });

  it("reassembles split words without changing the source fragments", () => {
    const fragments = [
      {
        id: "1",
        speaker: "user" as const,
        text: " twenty",
        startMs: 1000,
        endMs: 1200,
      },
      {
        id: "2",
        speaker: "user" as const,
        text: "-three",
        startMs: 1200,
        endMs: 1400,
      },
    ];
    expect(mergeLiveTranscript(fragments)).toMatchObject([
      { text: " twenty-three", endMs: 1400 },
    ]);
    expect(fragments[0].text).toBe(" twenty");
  });
});
