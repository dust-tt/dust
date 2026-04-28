import {
  type DeduplicateCandidate,
  resolveDeduplicationGroups,
} from "@app/lib/project_todo/deduplicate_candidates";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

// ── Test fixtures ─────────────────────────────────────────────────────────────

// The resolver passes the todo reference through without reading any of its
// fields, so tests work against a minimal structural stub — no cast to
// ProjectTodoResource is needed thanks to the resolver's generic parameter.
type TodoStub = { sId: string };

function makeTodo(sId: string): TodoStub {
  return { sId };
}

function makeCandidate(
  overrides: Partial<DeduplicateCandidate> & { itemId: string }
): DeduplicateCandidate {
  return {
    userId: 1 as ModelId,
    text: "Write the report",
    ...overrides,
  };
}

// ── resolveDeduplicationGroups ────────────────────────────────────────────────

describe("resolveDeduplicationGroups", () => {
  it("emits one singleton 'new' group per candidate when the LLM returns no groups", () => {
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    const result = resolveDeduplicationGroups(candidates, [], []);

    // Every candidate still gets its own group — sources are never dropped.
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: "new", candidates: [candidates[0]] });
    expect(result[1]).toEqual({ kind: "new", candidates: [candidates[1]] });
  });

  it("turns singleton LLM clusters into singleton 'new' groups", () => {
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    const result = resolveDeduplicationGroups(candidates, [], [[0], [1]]);

    expect(result).toEqual([
      { kind: "new", candidates: [candidates[0]] },
      { kind: "new", candidates: [candidates[1]] },
    ]);
  });

  it("maps a cluster with a single existing todo into an 'existing' group", () => {
    // Cluster = [existing#0, candidate#0] → one "existing" group.
    const existing = [makeTodo("todo-1")];
    const candidates = [makeCandidate({ itemId: "a" })];
    const result = resolveDeduplicationGroups(candidates, existing, [[0, 1]]);

    expect(result).toEqual([
      { kind: "existing", todo: existing[0], candidates: [candidates[0]] },
    ]);
  });

  it("picks the first existing when a cluster contains multiple existing todos", () => {
    // Two existing + one candidate. First existing wins; second existing is
    // ignored (we don't merge existing todos here).
    const existing = [makeTodo("todo-1"), makeTodo("todo-2")];
    const candidates = [makeCandidate({ itemId: "a" })];
    // Indexes: 0,1 are existing; 2 is the candidate.
    const result = resolveDeduplicationGroups(candidates, existing, [
      [0, 1, 2],
    ]);

    expect(result).toEqual([
      { kind: "existing", todo: existing[0], candidates: [candidates[0]] },
    ]);
  });

  it("links every candidate in a cluster to the first existing when one exists", () => {
    const existing = [makeTodo("todo-1")];
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    // 0 = existing; 1,2 = candidates.
    const result = resolveDeduplicationGroups(candidates, existing, [
      [0, 1, 2],
    ]);

    expect(result).toEqual([
      {
        kind: "existing",
        todo: existing[0],
        candidates: [candidates[0], candidates[1]],
      },
    ]);
  });

  it("turns a candidate cluster (no existing) into one 'new' group", () => {
    // No existing todos — every candidate shares one newly-created todo.
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
      makeCandidate({ itemId: "c" }),
    ];
    const result = resolveDeduplicationGroups(candidates, [], [[0, 1, 2]]);

    expect(result).toEqual([{ kind: "new", candidates }]);
  });

  it("ignores out-of-range indexes in clusters", () => {
    const candidates = [makeCandidate({ itemId: "a" })];
    // Index 5 is out of range; the cluster effectively contains only the one
    // valid candidate index.
    const result = resolveDeduplicationGroups(candidates, [], [[5, 0, -1]]);

    expect(result).toEqual([{ kind: "new", candidates: [candidates[0]] }]);
  });

  it("honors an index only in the first cluster it appears in", () => {
    // If the LLM lists the same candidate in two clusters, the second
    // occurrence is dropped so a candidate can't be silently reassigned.
    const existing = [makeTodo("todo-1")];
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    // Cluster 1: existing + candidate a. Cluster 2: candidate a (duplicate) +
    // candidate b. Candidate a stays in cluster 1; cluster 2 becomes just b.
    const result = resolveDeduplicationGroups(candidates, existing, [
      [0, 1],
      [1, 2],
    ]);

    expect(result).toEqual([
      { kind: "existing", todo: existing[0], candidates: [candidates[0]] },
      { kind: "new", candidates: [candidates[1]] },
    ]);
  });

  it("ignores clusters that contain no candidate", () => {
    // A cluster of two existing todos and no candidate → dropped. The lone
    // candidate in its own cluster survives as a "new" group.
    const existing = [makeTodo("todo-1"), makeTodo("todo-2")];
    const candidates = [makeCandidate({ itemId: "a" })];
    const result = resolveDeduplicationGroups(candidates, existing, [
      [0, 1],
      [2],
    ]);

    expect(result).toEqual([{ kind: "new", candidates: [candidates[0]] }]);
  });

  it("emits a singleton 'new' group for candidates the LLM forgot", () => {
    // The LLM grouped candidate a with the existing todo but forgot about
    // candidate b — b must still end up in its own group so its source is
    // not dropped.
    const existing = [makeTodo("todo-1")];
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    const result = resolveDeduplicationGroups(candidates, existing, [[0, 1]]);

    expect(result).toEqual([
      { kind: "existing", todo: existing[0], candidates: [candidates[0]] },
      { kind: "new", candidates: [candidates[1]] },
    ]);
  });
});
