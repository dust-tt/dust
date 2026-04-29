import {
  buildActionItems,
  buildPromptActionItems,
} from "@app/lib/project_todo/analyze_document/action_items";
import logger from "@app/logger/logger";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

function makePrev(
  overrides: Partial<TodoVersionedActionItem> = {}
): TodoVersionedActionItem {
  return {
    sId: "prev-1",
    shortDescription: "Existing task",
    assigneeUserId: null,
    assigneeName: null,
    status: "open",
    detectedDoneAt: null,
    detectedDoneRationale: null,
    detectedCreationRationale: null,
    ...overrides,
  };
}

describe("buildActionItems — new items", () => {
  it("appends a new item with a fresh sId when assignee is a known member", () => {
    const result = buildActionItems(
      {
        newItems: [
          {
            short_description: "Review PR",
            assignee_name: "Alice",
            assignee_user_id: "user-abc",
            detected_creation_rationale: "Alice committed to reviewing the PR",
          },
        ],
        updatedItems: [],
      },
      [],
      new Set(["user-abc"]),
      logger
    );

    expect(result).toHaveLength(1);
    expect(result[0].sId).not.toBe("");
    expect(result[0].shortDescription).toBe("Review PR");
    expect(result[0].assigneeName).toBe("Alice");
    expect(result[0].assigneeUserId).toBe("user-abc");
    expect(result[0].status).toBe("open");
    expect(result[0].detectedDoneAt).toBeNull();
    expect(result[0].detectedDoneRationale).toBeNull();
    expect(result[0].detectedCreationRationale).toBe(
      "Alice committed to reviewing the PR"
    );
  });

  it("drops new items whose assignee is not a project member", () => {
    const result = buildActionItems(
      {
        newItems: [
          {
            short_description: "Call client",
            assignee_name: "Stranger",
            assignee_user_id: "unknown-id",
            detected_creation_rationale: "Stranger said they would call",
          },
        ],
        updatedItems: [],
      },
      [],
      new Set(["user-abc"]),
      logger
    );

    expect(result).toEqual([]);
  });
});

describe("buildActionItems — updated items", () => {
  it("preserves a previous item untouched when no update is emitted", () => {
    const prev = makePrev({
      sId: "prev-1",
      shortDescription: "Refactor auth",
      assigneeName: "Bob",
      assigneeUserId: "user-bob",
    });
    const result = buildActionItems(
      { newItems: [], updatedItems: [] },
      [prev],
      new Set(["user-bob"]),
      logger
    );

    expect(result).toEqual([prev]);
  });

  it("updates the description when short_description is provided", () => {
    const prev = makePrev({ shortDescription: "Old description" });
    const result = buildActionItems(
      {
        newItems: [],
        updatedItems: [{ sId: prev.sId, short_description: "New description" }],
      },
      [prev],
      new Set(),
      logger
    );

    expect(result[0].shortDescription).toBe("New description");
  });

  it("applies the assignee tuple when user_id is a known member", () => {
    const prev = makePrev({
      assigneeName: "Bob",
      assigneeUserId: "user-bob",
    });
    const result = buildActionItems(
      {
        newItems: [],
        updatedItems: [
          {
            sId: prev.sId,
            assignee: { user_id: "user-alice", name: "Alice" },
          },
        ],
      },
      [prev],
      new Set(["user-alice"]),
      logger
    );

    expect(result[0].assigneeUserId).toBe("user-alice");
    expect(result[0].assigneeName).toBe("Alice");
  });

  it("ignores the assignee tuple when user_id is not a known member", () => {
    const prev = makePrev({
      assigneeName: "Bob",
      assigneeUserId: "user-bob",
    });
    const result = buildActionItems(
      {
        newItems: [],
        updatedItems: [
          {
            sId: prev.sId,
            assignee: { user_id: "unknown-id", name: "Stranger" },
          },
        ],
      },
      [prev],
      new Set(["user-bob"]),
      logger
    );

    expect(result[0].assigneeUserId).toBe("user-bob");
    expect(result[0].assigneeName).toBe("Bob");
  });

  it("transitions an open item to done and sets detectedDoneAt to now", () => {
    const before = new Date().toISOString();
    const prev = makePrev({ status: "open" });
    const result = buildActionItems(
      {
        newItems: [],
        updatedItems: [
          {
            sId: prev.sId,
            done: { detected_done_rationale: "User confirmed it shipped" },
          },
        ],
      },
      [prev],
      new Set(),
      logger
    );
    const after = new Date().toISOString();

    expect(result[0].status).toBe("done");
    expect(result[0].detectedDoneAt).not.toBeNull();
    expect(result[0].detectedDoneAt! >= before).toBe(true);
    expect(result[0].detectedDoneAt! <= after).toBe(true);
    expect(result[0].detectedDoneRationale).toBe("User confirmed it shipped");
  });

  it("does not overwrite detectedDoneAt when an item is already done", () => {
    const prev = makePrev({
      status: "done",
      detectedDoneAt: "2024-01-01T00:00:00.000Z",
      detectedDoneRationale: "Original rationale",
    });
    const result = buildActionItems(
      {
        newItems: [],
        updatedItems: [
          {
            sId: prev.sId,
            done: { detected_done_rationale: "Mentioned again" },
          },
        ],
      },
      [prev],
      new Set(),
      logger
    );

    expect(result[0].status).toBe("done");
    expect(result[0].detectedDoneAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result[0].detectedDoneRationale).toBe("Mentioned again");
  });

  it("drops updates referencing an unknown sId", () => {
    const prev = makePrev({ sId: "prev-1" });
    const result = buildActionItems(
      {
        newItems: [],
        updatedItems: [
          {
            sId: "unknown-sid",
            short_description: "Should be ignored",
          },
        ],
      },
      [prev],
      new Set(),
      logger
    );

    expect(result).toEqual([prev]);
  });
});

describe("buildPromptActionItems", () => {
  it("returns a prompt with guidelines only when no previous items", () => {
    const prompt = buildPromptActionItems([]);
    expect(prompt).toContain("action items");
    expect(prompt).not.toContain("Previously tracked action items");
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
        detectedCreationRationale: null,
      },
      {
        sId: "def",
        shortDescription: "Ship feature",
        assigneeName: null,
        assigneeUserId: null,
        status: "done",
        detectedDoneAt: "2024-01-01T00:00:00.000Z",
        detectedDoneRationale: null,
        detectedCreationRationale: null,
      },
    ];
    const prompt = buildPromptActionItems(items);
    expect(prompt).toContain("Previously tracked action items");
    expect(prompt).toContain(
      `<action_item sId="abc" status="open"><short_description>Refactor auth</short_description><assignee name="Bob" /></action_item>`
    );
    expect(prompt).toContain(
      `<action_item sId="def" status="done"><short_description>Ship feature</short_description></action_item>`
    );
  });
});
