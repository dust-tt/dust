import {
  buildActionItems,
  buildPromptActionItems,
} from "@app/lib/project_todo/analyze_document/action_items";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

describe("buildActionItems", () => {
  it("reuses sId when it matches a previous sId", () => {
    const knownId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const raw = [
      {
        sId: knownId,
        short_description: "Review PR",
        status: "open" as const,
      },
    ];
    const result = buildActionItems(raw, [{ sId: knownId }], new Set());
    expect(result[0].sId).toBe(knownId);
  });

  it("maps open status correctly", () => {
    const raw = [
      {
        short_description: "Fix bug",
        status: "open" as const,
      },
    ];
    const result = buildActionItems(raw, [], new Set());
    expect(result[0].status).toBe("open");
    expect(result[0].detectedDoneAt).toBeNull();
    expect(result[0].detectedDoneRationale).toBeNull();
  });

  it("maps done status and sets detectedDoneAt to now", () => {
    const before = new Date().toISOString();
    const raw = [
      {
        short_description: "Send report",
        status: "done" as const,
        detected_done_rationale: "User confirmed it was sent",
      },
    ];
    const result = buildActionItems(raw, [], new Set());
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
        short_description: "Call client",
        status: "open" as const,
        assignee_name: "Alice",
      },
      {
        short_description: "Write docs",
        status: "open" as const,
      },
    ];
    const result = buildActionItems(raw, [], new Set());
    expect(result[0].assigneeName).toBe("Alice");
    expect(result[1].assigneeName).toBeNull();
  });

  it("sets assigneeUserId to null when no participants match", () => {
    const raw = [{ short_description: "Task", status: "open" as const }];
    const result = buildActionItems(raw, [], new Set());
    expect(result[0].assigneeUserId).toBeNull();
  });

  it("resolves assigneeUserId when assignee_user_id matches a participant", () => {
    const raw = [
      {
        short_description: "Review PR",
        status: "open" as const,
        assignee_name: "Alice",
        assignee_user_id: "user-abc",
      },
    ];
    const participants = new Set(["user-abc", "user-def"]);
    const result = buildActionItems(raw, [], participants);
    expect(result[0].assigneeUserId).toBe("user-abc");
    expect(result[0].assigneeName).toBe("Alice");
  });

  it("discards assigneeUserId when it does not match any participant", () => {
    const raw = [
      {
        short_description: "Review PR",
        status: "open" as const,
        assignee_name: "Alice",
        assignee_user_id: "unknown-id",
      },
    ];
    const participants = new Set(["user-abc"]);
    const result = buildActionItems(raw, [], participants);
    expect(result[0].assigneeUserId).toBeNull();
    expect(result[0].assigneeName).toBe("Alice");
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
        shortDescription: "Refactor auth",
        assigneeName: "Bob",
        assigneeUserId: null,
        status: "open",
        detectedDoneAt: null,
        detectedDoneRationale: null,
      },
      {
        sId: "def",
        shortDescription: "Ship feature",
        assigneeName: null,
        assigneeUserId: null,
        status: "done",
        detectedDoneAt: "2024-01-01T00:00:00.000Z",
        detectedDoneRationale: null,
      },
    ];
    const prompt = buildPromptActionItems(items);
    expect(prompt).toContain("Known action items:");
    expect(prompt).toContain(
      `<action_item sId="abc" status="open"><short_description>Refactor auth</short_description><assignee name="Bob" /></action_item>`
    );
    expect(prompt).toContain(
      `<action_item sId="def" status="done"><short_description>Ship feature</short_description></action_item>`
    );
    // The second item has no assignee, so no assignee tag should be present for it.
    expect(prompt).not.toContain(
      `<action_item sId="def" status="done"><short_description>Ship feature</short_description><assignee`
    );
  });
});
