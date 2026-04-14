import {
  buildActionItems,
  buildPromptActionItems,
} from "@app/lib/project_todo/analyze_conversation/action_items";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

describe("buildActionItems", () => {
  it("reuses sId when it matches a previous sId", () => {
    const knownSId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const raw = [
      {
        sId: knownSId,
        text: "Review PR",
        source_message_rank: 3,
        status: "open" as const,
      },
    ];
    const result = buildActionItems(raw, new Set([knownSId]));
    expect(result[0].sId).toBe(knownSId);
  });

  it("maps open status correctly", () => {
    const raw = [
      {
        text: "Fix bug",
        source_message_rank: 1,
        status: "open" as const,
      },
    ];
    const result = buildActionItems(raw, new Set());
    expect(result[0].status).toBe("open");
    expect(result[0].detectedDoneAt).toBeNull();
    expect(result[0].detectedDoneRationale).toBeNull();
  });

  it("maps done status and sets detectedDoneAt to now", () => {
    const before = new Date().toISOString();
    const raw = [
      {
        text: "Send report",
        source_message_rank: 5,
        status: "done" as const,
        detected_done_rationale: "User confirmed it was sent",
      },
    ];
    const result = buildActionItems(raw, new Set());
    const after = new Date().toISOString();

    expect(result[0].status).toBe("done");
    expect(result[0].detectedDoneAt).not.toBeNull();
    expect(result[0].detectedDoneAt! >= before).toBe(true);
    expect(result[0].detectedDoneAt! <= after).toBe(true);
    expect(result[0].detectedDoneRationale).toBe("User confirmed it was sent");
  });

  it("maps assignee_name to assigneeName, null when absent", () => {
    const raw = [
      {
        text: "Call client",
        source_message_rank: 2,
        status: "open" as const,
        assignee_name: "Alice",
      },
      {
        text: "Write docs",
        source_message_rank: 3,
        status: "open" as const,
      },
    ];
    const result = buildActionItems(raw, new Set());
    expect(result[0].assigneeName).toBe("Alice");
    expect(result[1].assigneeName).toBeNull();
  });

  it("sets assigneeUserId to null (populated downstream)", () => {
    const raw = [
      { text: "Task", source_message_rank: 1, status: "open" as const },
    ];
    const result = buildActionItems(raw, new Set());
    expect(result[0].assigneeUserId).toBeNull();
  });

  it("preserves sourceMessageRank", () => {
    const raw = [
      { text: "Task", source_message_rank: 42, status: "open" as const },
    ];
    const result = buildActionItems(raw, new Set());
    expect(result[0].sourceMessageRank).toBe(42);
  });
});

describe("buildPromptActionItems", () => {
  it("returns a prompt with guidelines only when no previous items", () => {
    const prompt = buildPromptActionItems([]);
    expect(prompt).toContain("action items");
    expect(prompt).not.toContain("Known action items:");
  });

  it("includes known items section when previous items exist", () => {
    const items: TodoVersionedActionItem[] = [
      {
        sId: "abc",
        text: "Refactor auth",
        assigneeName: "Bob",
        assigneeUserId: null,
        sourceMessageRank: 1,
        status: "open",
        detectedDoneAt: null,
        detectedDoneRationale: null,
      },
      {
        sId: "def",
        text: "Ship feature",
        assigneeName: null,
        assigneeUserId: null,
        sourceMessageRank: 2,
        status: "done",
        detectedDoneAt: "2024-01-01T00:00:00.000Z",
        detectedDoneRationale: null,
      },
    ];
    const prompt = buildPromptActionItems(items);
    expect(prompt).toContain("Known action items:");
    expect(prompt).toContain("sId: abc");
    expect(prompt).toContain("[open] Refactor auth");
    expect(prompt).toContain("assigned: Bob");
    expect(prompt).toContain("sId: def");
    expect(prompt).toContain("[done] Ship feature");
    // The second item has no assignee — its line must not include an "(assigned: ...)" suffix.
    expect(prompt).not.toContain("Ship feature (assigned:");
  });
});
