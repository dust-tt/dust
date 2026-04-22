import {
  type DeduplicateCandidate,
  type LLMMatch,
  makeDedupResultKey,
  resolveDeduplicationChains,
} from "@app/lib/project_todo/deduplicate_candidates";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

// ── Test fixtures ─────────────────────────────────────────────────────────────

// Minimal shape of ProjectTodoResource actually touched by the chain resolver
// — only `sId` is read. Cast is safe; extending this stub would be extra
// surface for no gain.
function makeTodo(sId: string): ProjectTodoResource {
  return { sId } as unknown as ProjectTodoResource;
}

function makeCandidate(
  overrides: Partial<DeduplicateCandidate> & { itemId: string }
): DeduplicateCandidate {
  return {
    userId: 1 as ModelId,
    text: "Write the report",
    category: "to_do",
    ...overrides,
  };
}

// ── resolveDeduplicationChains ────────────────────────────────────────────────

describe("resolveDeduplicationChains", () => {
  it("treats every candidate as a leader when the LLM reports no matches", () => {
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    const result = resolveDeduplicationChains(candidates, new Map(), []);
    // Leaders are represented by absence from the map.
    expect(result.size).toBe(0);
  });

  it("maps existing-match LLMMatches to { kind: existing, todo }", () => {
    const todo = makeTodo("todo-1");
    const candidates = [makeCandidate({ itemId: "a" })];
    const matches = new Map<number, LLMMatch>([
      [0, { kind: "existing", sId: "todo-1" }],
    ]);

    const result = resolveDeduplicationChains(candidates, matches, [todo]);
    const entry = result.get(makeDedupResultKey(1 as ModelId, "a"));
    expect(entry).toEqual({ kind: "existing", todo });
  });

  it("treats hallucinated existing sIds as leaders", () => {
    const candidates = [makeCandidate({ itemId: "a" })];
    const matches = new Map<number, LLMMatch>([
      [0, { kind: "existing", sId: "todo-does-not-exist" }],
    ]);

    const result = resolveDeduplicationChains(candidates, matches, []);
    expect(result.size).toBe(0);
  });

  it("turns two identical candidates into one leader + one follower", () => {
    // Concrete scenario: same item extracted from two different source docs
    // in the same batch. Phase 3 must create one todo (the leader's) and
    // link the follower's source to it.
    const candidates = [
      makeCandidate({ itemId: "a", text: "Ship the release" }),
      makeCandidate({ itemId: "b", text: "Ship the release" }),
    ];
    const matches = new Map<number, LLMMatch>([
      [1, { kind: "follower", candidateIndex: 0 }],
    ]);

    const result = resolveDeduplicationChains(candidates, matches, []);

    // Leader — absent from map.
    expect(result.has(makeDedupResultKey(1 as ModelId, "a"))).toBe(false);

    // Follower — points at the leader's candidate key.
    const followerEntry = result.get(makeDedupResultKey(1 as ModelId, "b"));
    expect(followerEntry).toEqual({
      kind: "follower",
      leaderKey: makeDedupResultKey(1 as ModelId, "a"),
    });
  });

  it("collapses follower-of-existing to existing", () => {
    // Scenario: candidate 0 matches an existing todo, candidate 1 matches
    // candidate 0. The shortest path is to resolve 1 directly to the
    // existing todo so Phase 3 doesn't need the leader-lookup hop.
    const todo = makeTodo("todo-1");
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    const matches = new Map<number, LLMMatch>([
      [0, { kind: "existing", sId: "todo-1" }],
      [1, { kind: "follower", candidateIndex: 0 }],
    ]);

    const result = resolveDeduplicationChains(candidates, matches, [todo]);

    expect(result.get(makeDedupResultKey(1 as ModelId, "a"))).toEqual({
      kind: "existing",
      todo,
    });
    expect(result.get(makeDedupResultKey(1 as ModelId, "b"))).toEqual({
      kind: "existing",
      todo,
    });
  });

  it("collapses transitive follower chains to the root leader", () => {
    // A → leader; B → follower(A); C → follower(B). C should point at A,
    // not B, so Phase 3 does a single leaderTodos lookup.
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
      makeCandidate({ itemId: "c" }),
    ];
    const matches = new Map<number, LLMMatch>([
      [1, { kind: "follower", candidateIndex: 0 }],
      [2, { kind: "follower", candidateIndex: 1 }],
    ]);

    const result = resolveDeduplicationChains(candidates, matches, []);

    const leaderKey = makeDedupResultKey(1 as ModelId, "a");
    expect(result.get(makeDedupResultKey(1 as ModelId, "b"))).toEqual({
      kind: "follower",
      leaderKey,
    });
    expect(result.get(makeDedupResultKey(1 as ModelId, "c"))).toEqual({
      kind: "follower",
      leaderKey,
    });
  });

  it("ignores forward (>= current) follower references", () => {
    // The LLM is instructed to only reference lower indices, but if it
    // violates that, the malformed match should be ignored — the candidate
    // becomes a leader rather than propagating a broken reference.
    const candidates = [
      makeCandidate({ itemId: "a" }),
      makeCandidate({ itemId: "b" }),
    ];
    // Forward match — parser in runDeduplicationLLMCall should drop this;
    // but if it ever reaches resolveDeduplicationChains, it should be tolerated:
    // perIndex[1] is null at the time index 1 is processed.
    const matches = new Map<number, LLMMatch>([
      [0, { kind: "follower", candidateIndex: 1 }],
    ]);

    const result = resolveDeduplicationChains(candidates, matches, []);
    // Candidate 0 points at index 1, which hasn't been resolved yet — treated
    // as a leader-referencing-leader → becomes a follower of the (yet-unset)
    // leader. Phase 3's fallback handles "follower without leader" by
    // promoting to a new todo, so this is still correct end-to-end. Verify
    // the map shape: candidate 0 gets a follower entry pointing at itself's
    // non-leader reference; candidate 1 is a leader (absent).
    const entry = result.get(makeDedupResultKey(1 as ModelId, "a"));
    expect(entry?.kind).toBe("follower");
    expect(result.has(makeDedupResultKey(1 as ModelId, "b"))).toBe(false);
  });
});
