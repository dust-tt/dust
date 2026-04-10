import {
  PER_SKILL_CONVERSATION_CAP,
  WEIGHT_FEEDBACK,
  WEIGHT_TOOL_ERRORS,
  WEIGHT_USER_ENGAGEMENT,
} from "@app/lib/reinforcement/constants";
import { scoreAndSelectConversations } from "@app/lib/reinforcement/selection";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

function makeConversationSkillMap(
  entries: { convId: ModelId; skillIds: string[] }[]
): Map<ModelId, Set<string>> {
  const map = new Map<ModelId, Set<string>>();
  for (const { convId, skillIds } of entries) {
    map.set(convId, new Set(skillIds));
  }
  return map;
}

function makeConvIdMap(
  entries: { convId: ModelId; sId: string }[]
): Map<ModelId, string> {
  return new Map(entries.map(({ convId, sId }) => [convId, sId]));
}

describe("scoreAndSelectConversations", () => {
  it("returns empty when no conversations are provided", () => {
    const results = scoreAndSelectConversations(
      new Map(),
      new Map(),
      {
        userMessageCount: new Map(),
        feedbackCount: new Map(),
        toolErrorCount: new Map(),
      },
      300
    );
    expect(results).toEqual([]);
  });

  it("excludes conversations with no feedback and fewer than 2 user messages", () => {
    const skillMap = makeConversationSkillMap([
      { convId: 1 as ModelId, skillIds: ["skill-a"] },
      { convId: 2 as ModelId, skillIds: ["skill-a"] },
    ]);
    const convIdMap = makeConvIdMap([
      { convId: 1 as ModelId, sId: "conv-1" },
      { convId: 2 as ModelId, sId: "conv-2" },
    ]);

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        // conv-1: 1 user message, no feedback -> excluded
        // conv-2: 0 user messages, no feedback -> excluded
        userMessageCount: new Map([[1 as ModelId, 1]]),
        feedbackCount: new Map(),
        toolErrorCount: new Map(),
      },
      300
    );
    expect(results).toEqual([]);
  });

  it("includes conversation with feedback even if fewer than 2 user messages", () => {
    const skillMap = makeConversationSkillMap([
      { convId: 1 as ModelId, skillIds: ["skill-a"] },
    ]);
    const convIdMap = makeConvIdMap([{ convId: 1 as ModelId, sId: "conv-1" }]);

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        userMessageCount: new Map([[1 as ModelId, 1]]),
        feedbackCount: new Map([[1 as ModelId, 1]]),
        toolErrorCount: new Map(),
      },
      300
    );
    expect(results).toHaveLength(1);
    expect(results[0].conversationId).toBe("conv-1");
  });

  it("includes conversation with 2+ user messages even without feedback", () => {
    const skillMap = makeConversationSkillMap([
      { convId: 1 as ModelId, skillIds: ["skill-a"] },
    ]);
    const convIdMap = makeConvIdMap([{ convId: 1 as ModelId, sId: "conv-1" }]);

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        userMessageCount: new Map([[1 as ModelId, 2]]),
        feedbackCount: new Map(),
        toolErrorCount: new Map(),
      },
      300
    );
    expect(results).toHaveLength(1);
  });

  it("scores conversations correctly and sorts by score descending", () => {
    // conv-1: high feedback, no errors
    // conv-2: no feedback, high errors
    // conv-3: moderate feedback, moderate errors, high engagement
    const skillMap = makeConversationSkillMap([
      { convId: 1 as ModelId, skillIds: ["skill-a"] },
      { convId: 2 as ModelId, skillIds: ["skill-a"] },
      { convId: 3 as ModelId, skillIds: ["skill-a"] },
    ]);
    const convIdMap = makeConvIdMap([
      { convId: 1 as ModelId, sId: "conv-1" },
      { convId: 2 as ModelId, sId: "conv-2" },
      { convId: 3 as ModelId, sId: "conv-3" },
    ]);

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        userMessageCount: new Map([
          [1 as ModelId, 2],
          [2 as ModelId, 2],
          [3 as ModelId, 10],
        ]),
        feedbackCount: new Map([
          [1 as ModelId, 5],
          [3 as ModelId, 2],
        ]),
        toolErrorCount: new Map([
          [2 as ModelId, 4],
          [3 as ModelId, 2],
        ]),
      },
      300
    );

    expect(results).toHaveLength(3);

    // conv-1: feedback=5/5=1.0, errors=0/4=0, engagement=0/8=0
    //   score = 0.45*1.0 + 0.30*0.0 + 0.25*0.0 = 0.45
    // conv-2: feedback=0/5=0, errors=4/4=1.0, engagement=0/8=0
    //   score = 0.45*0.0 + 0.30*1.0 + 0.25*0.0 = 0.30
    // conv-3: feedback=2/5=0.4, errors=2/4=0.5, engagement=8/8=1.0
    //   score = 0.45*0.4 + 0.30*0.5 + 0.25*1.0 = 0.18+0.15+0.25 = 0.58
    expect(results[0].conversationId).toBe("conv-3"); // highest: 0.58
    expect(results[1].conversationId).toBe("conv-1"); // second: 0.45
    expect(results[2].conversationId).toBe("conv-2"); // third: 0.30
  });

  it("respects maxConversations limit", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      convId: (i + 1) as ModelId,
      skillIds: ["skill-a"],
    }));
    const skillMap = makeConversationSkillMap(entries);
    const convIdMap = makeConvIdMap(
      entries.map((e) => ({ convId: e.convId, sId: `conv-${e.convId}` }))
    );

    const feedbackCount = new Map<ModelId, number>();
    for (const e of entries) {
      feedbackCount.set(e.convId, 1);
    }

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        userMessageCount: new Map(),
        feedbackCount,
        toolErrorCount: new Map(),
      },
      3
    );
    expect(results).toHaveLength(3);
  });

  it("enforces per-skill conversation cap", () => {
    // Create PER_SKILL_CONVERSATION_CAP + 5 conversations all using skill-a.
    const count = PER_SKILL_CONVERSATION_CAP + 5;
    const entries = Array.from({ length: count }, (_, i) => ({
      convId: (i + 1) as ModelId,
      skillIds: ["skill-a"],
    }));
    const skillMap = makeConversationSkillMap(entries);
    const convIdMap = makeConvIdMap(
      entries.map((e) => ({ convId: e.convId, sId: `conv-${e.convId}` }))
    );

    const feedbackCount = new Map<ModelId, number>();
    for (const e of entries) {
      feedbackCount.set(e.convId, 1);
    }

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        userMessageCount: new Map(),
        feedbackCount,
        toolErrorCount: new Map(),
      },
      300
    );
    expect(results).toHaveLength(PER_SKILL_CONVERSATION_CAP);
  });

  it("conversation at cap for skill A can still be included for skill B", () => {
    // Fill skill-a to its cap with conversations 1..CAP.
    const capEntries = Array.from(
      { length: PER_SKILL_CONVERSATION_CAP },
      (_, i) => ({
        convId: (i + 1) as ModelId,
        skillIds: ["skill-a"],
      })
    );

    // Conversation CAP+1 uses both skill-a and skill-b.
    const multiSkillConvId = (PER_SKILL_CONVERSATION_CAP + 1) as ModelId;
    const allEntries = [
      ...capEntries,
      { convId: multiSkillConvId, skillIds: ["skill-a", "skill-b"] },
    ];

    const skillMap = makeConversationSkillMap(allEntries);
    const convIdMap = makeConvIdMap(
      allEntries.map((e) => ({ convId: e.convId, sId: `conv-${e.convId}` }))
    );

    // Give all conversations equal feedback so they all score the same.
    const feedbackCount = new Map<ModelId, number>();
    for (const e of allEntries) {
      feedbackCount.set(e.convId, 1);
    }

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        userMessageCount: new Map(),
        feedbackCount,
        toolErrorCount: new Map(),
      },
      300
    );

    // All CAP+1 conversations should be included.
    expect(results).toHaveLength(PER_SKILL_CONVERSATION_CAP + 1);

    // The multi-skill conversation should only be tagged with skill-b
    // (skill-a is at cap).
    const multiSkillResult = results.find(
      (r) => r.conversationId === `conv-${multiSkillConvId}`
    );
    expect(multiSkillResult).toBeDefined();
    expect(multiSkillResult!.skillIds).toEqual(["skill-b"]);
  });

  it("all signals contribute to score with correct weights", () => {
    // Single conversation: verify the score formula.
    const skillMap = makeConversationSkillMap([
      { convId: 1 as ModelId, skillIds: ["skill-a"] },
    ]);
    const convIdMap = makeConvIdMap([{ convId: 1 as ModelId, sId: "conv-1" }]);

    const results = scoreAndSelectConversations(
      skillMap,
      convIdMap,
      {
        // With a single conversation, all signals normalize to 1.0
        // (or 0 if the raw value is 0).
        userMessageCount: new Map([[1 as ModelId, 5]]), // engagement = 5-2 = 3
        feedbackCount: new Map([[1 as ModelId, 3]]),
        toolErrorCount: new Map([[1 as ModelId, 2]]),
      },
      300
    );

    expect(results).toHaveLength(1);
    // With a single conversation, all normalized values are 1.0.
    // score = WEIGHT_FEEDBACK*1 + WEIGHT_TOOL_ERRORS*1 + WEIGHT_USER_ENGAGEMENT*1
    //       = 0.45 + 0.30 + 0.25 = 1.0
    expect(WEIGHT_FEEDBACK + WEIGHT_TOOL_ERRORS + WEIGHT_USER_ENGAGEMENT).toBe(
      1.0
    );
  });
});
