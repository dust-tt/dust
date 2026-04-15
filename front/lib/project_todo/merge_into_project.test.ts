import {
  actionItemBlob,
  keyDecisionBlob,
  notableFactBlob,
} from "@app/lib/project_todo/merge_into_project";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";
import { describe, expect, it } from "vitest";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActionItem(
  overrides: Partial<TodoVersionedActionItem> = {}
): TodoVersionedActionItem {
  return {
    sId: "action-1",
    text: "Write the report",
    assigneeUserId: null,
    assigneeName: null,
    sourceMessageRank: 1,
    status: "open",
    detectedDoneAt: null,
    detectedDoneRationale: null,
    ...overrides,
  };
}

function makeKeyDecision(
  overrides: Partial<TodoVersionedKeyDecision> = {}
): TodoVersionedKeyDecision {
  return {
    sId: "decision-1",
    text: "Use PostgreSQL",
    relevantUserIds: [],
    sourceMessageRank: 2,
    status: "decided",
    ...overrides,
  };
}

function makeNotableFact(
  overrides: Partial<TodoVersionedNotableFact> = {}
): TodoVersionedNotableFact {
  return {
    sId: "fact-1",
    text: "Budget capped at €50k",
    relevantUserIds: [],
    sourceMessageRank: 3,
    ...overrides,
  };
}

// ── actionItemBlob ────────────────────────────────────────────────────────────

describe("actionItemBlob", () => {
  it("maps to to_do category", () => {
    const blob = actionItemBlob(makeActionItem());
    expect(blob.category).toBe("to_do");
  });

  it("maps open status to todo", () => {
    const blob = actionItemBlob(makeActionItem({ status: "open" }));
    expect(blob.status).toBe("todo");
    expect(blob.doneAt).toBeNull();
  });

  it("maps done status to done and parses detectedDoneAt", () => {
    const doneAt = "2024-06-15T10:00:00.000Z";
    const blob = actionItemBlob(
      makeActionItem({ status: "done", detectedDoneAt: doneAt })
    );
    expect(blob.status).toBe("done");
    expect(blob.doneAt).toEqual(new Date(doneAt));
  });

  it("sets doneAt to null when done but detectedDoneAt is absent", () => {
    const blob = actionItemBlob(
      makeActionItem({ status: "done", detectedDoneAt: null })
    );
    expect(blob.status).toBe("done");
    expect(blob.doneAt).toBeNull();
  });

  it("preserves text", () => {
    const blob = actionItemBlob(makeActionItem({ text: "Deploy to prod" }));
    expect(blob.text).toBe("Deploy to prod");
  });
});

// ── keyDecisionBlob ───────────────────────────────────────────────────────────

describe("keyDecisionBlob", () => {
  it("maps to to_know category", () => {
    const blob = keyDecisionBlob(makeKeyDecision());
    expect(blob.category).toBe("to_know");
  });

  it("maps decided status to done", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ status: "decided" }));
    expect(blob.status).toBe("done");
  });

  it("maps open status to todo", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ status: "open" }));
    expect(blob.status).toBe("todo");
  });

  it("always sets doneAt to null", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ status: "decided" }));
    expect(blob.doneAt).toBeNull();
  });

  it("preserves text", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ text: "Go monorepo" }));
    expect(blob.text).toBe("Go monorepo");
  });
});

// ── notableFactBlob ───────────────────────────────────────────────────────────

describe("notableFactBlob", () => {
  it("maps to to_know category", () => {
    const blob = notableFactBlob(makeNotableFact());
    expect(blob.category).toBe("to_know");
  });

  it("always sets status to todo", () => {
    const blob = notableFactBlob(makeNotableFact());
    expect(blob.status).toBe("todo");
  });

  it("always sets doneAt to null", () => {
    const blob = notableFactBlob(makeNotableFact());
    expect(blob.doneAt).toBeNull();
  });

  it("preserves text", () => {
    const blob = notableFactBlob(
      makeNotableFact({ text: "Team is 12 people" })
    );
    expect(blob.text).toBe("Team is 12 people");
  });
});
