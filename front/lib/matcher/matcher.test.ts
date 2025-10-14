import { describe, expect, it } from "vitest";

import { matchPayload } from "./matcher";
import { parseMatcherExpression } from "./parser";

describe("matchPayload", () => {
  const samplePayload = {
    user: {
      name: "Alice",
      email: "alice@example.com",
      age: 30,
      active: true,
    },
    tags: ["urgent", "bug", "frontend"],
    priority: 1,
    count: 42,
    metadata: {
      created_at: "2024-01-01",
      source: "webhook",
    },
  };

  describe("equality operator", () => {
    it("should match string equality", () => {
      const matcher = parseMatcherExpression('(eq "user.name" "Alice")');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match incorrect string", () => {
      const matcher = parseMatcherExpression('(eq "user.name" "Bob")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match number equality", () => {
      const matcher = parseMatcherExpression('(eq "count" 42)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should match boolean equality", () => {
      const matcher = parseMatcherExpression('(eq "user.active" true)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match wrong boolean", () => {
      const matcher = parseMatcherExpression('(eq "user.active" false)');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should not match non-existent field", () => {
      const matcher = parseMatcherExpression('(eq "nonexistent" "value")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });
  });

  describe("string operators", () => {
    it("should match starts-with", () => {
      const matcher = parseMatcherExpression(
        '(starts-with "user.email" "alice@")'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match incorrect prefix", () => {
      const matcher = parseMatcherExpression(
        '(starts-with "user.email" "bob@")'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should not match starts-with on non-string", () => {
      const matcher = parseMatcherExpression('(starts-with "count" "42")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });
  });

  describe("array operators", () => {
    it("should match has single value", () => {
      const matcher = parseMatcherExpression('(has "tags" "urgent")');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match absent value", () => {
      const matcher = parseMatcherExpression('(has "tags" "backend")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match has-all when all values present", () => {
      const matcher = parseMatcherExpression(
        '(has-all "tags" ("urgent" "bug"))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match has-all when one value missing", () => {
      const matcher = parseMatcherExpression(
        '(has-all "tags" ("urgent" "missing"))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match has-any when at least one value present", () => {
      const matcher = parseMatcherExpression(
        '(has-any "tags" ("missing" "urgent"))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match has-any when no values present", () => {
      const matcher = parseMatcherExpression(
        '(has-any "tags" ("missing1" "missing2"))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should not match array operators on non-array", () => {
      const matcher = parseMatcherExpression('(has "user.name" "Alice")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });
  });

  describe("numeric operators", () => {
    it("should match gt", () => {
      const matcher = parseMatcherExpression('(gt "user.age" 25)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match gt when equal", () => {
      const matcher = parseMatcherExpression('(gt "user.age" 30)');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match gte when equal", () => {
      const matcher = parseMatcherExpression('(gte "user.age" 30)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should match gte when greater", () => {
      const matcher = parseMatcherExpression('(gte "user.age" 25)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should match lt", () => {
      const matcher = parseMatcherExpression('(lt "user.age" 35)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match lt when equal", () => {
      const matcher = parseMatcherExpression('(lt "user.age" 30)');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match lte when equal", () => {
      const matcher = parseMatcherExpression('(lte "user.age" 30)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should match lte when less", () => {
      const matcher = parseMatcherExpression('(lte "user.age" 35)');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match numeric operators on non-numbers", () => {
      const matcher = parseMatcherExpression('(gt "user.name" 10)');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });
  });

  describe("existence operator", () => {
    it("should match exists for present field", () => {
      const matcher = parseMatcherExpression('(exists "user.name")');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should match exists for nested field", () => {
      const matcher = parseMatcherExpression('(exists "metadata.source")');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match exists for absent field", () => {
      const matcher = parseMatcherExpression('(exists "nonexistent")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should not match exists for nested absent field", () => {
      const matcher = parseMatcherExpression('(exists "user.missing.field")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });
  });

  describe("logical operators", () => {
    it("should match AND when all conditions true", () => {
      const matcher = parseMatcherExpression(
        '(and (eq "user.name" "Alice") (eq "user.age" 30))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match AND when one condition false", () => {
      const matcher = parseMatcherExpression(
        '(and (eq "user.name" "Alice") (eq "user.age" 25))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match OR when at least one condition true", () => {
      const matcher = parseMatcherExpression(
        '(or (eq "user.name" "Bob") (eq "user.age" 30))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match OR when all conditions false", () => {
      const matcher = parseMatcherExpression(
        '(or (eq "user.name" "Bob") (eq "user.age" 25))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should match NOT when condition false", () => {
      const matcher = parseMatcherExpression('(not (eq "user.name" "Bob"))');
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });

    it("should not match NOT when condition true", () => {
      const matcher = parseMatcherExpression('(not (eq "user.name" "Alice"))');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should handle nested logical operators", () => {
      const matcher = parseMatcherExpression(
        '(and (or (eq "priority" 1) (eq "priority" 2)) (has "tags" "urgent"))'
      );
      expect(matchPayload(samplePayload, matcher)).toBe(true);
    });
  });

  describe("wildcard array access", () => {
    const payloadWithArrayOfObjects = {
      items: [
        { id: 1, name: "Item 1", status: "active" },
        { id: 2, name: "Item 2", status: "inactive" },
        { id: 3, name: "Item 3", status: "active" },
      ],
      tags: [
        { label: "urgent", color: "red" },
        { label: "bug", color: "orange" },
      ],
    };

    it("should match wildcard path with has", () => {
      const matcher = parseMatcherExpression('(has "items.*.name" "Item 2")');
      expect(matchPayload(payloadWithArrayOfObjects, matcher)).toBe(true);
    });

    it("should not match wildcard path when value absent", () => {
      const matcher = parseMatcherExpression('(has "items.*.name" "Item 999")');
      expect(matchPayload(payloadWithArrayOfObjects, matcher)).toBe(false);
    });

    it("should match wildcard with has-all", () => {
      const matcher = parseMatcherExpression(
        '(has-all "items.*.status" ("active" "inactive"))'
      );
      expect(matchPayload(payloadWithArrayOfObjects, matcher)).toBe(true);
    });

    it("should match wildcard with has-any", () => {
      const matcher = parseMatcherExpression(
        '(has-any "tags.*.label" ("urgent" "missing"))'
      );
      expect(matchPayload(payloadWithArrayOfObjects, matcher)).toBe(true);
    });

    it("should not match wildcard on non-array", () => {
      const matcher = parseMatcherExpression('(has "user.*.name" "value")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });

    it("should handle wildcard with nested fields", () => {
      const matcher = parseMatcherExpression('(eq "tags.*.color" "red")');
      expect(matchPayload(payloadWithArrayOfObjects, matcher)).toBe(false);
      // eq doesn't work on arrays, but has would
      const matcher2 = parseMatcherExpression('(has "tags.*.color" "red")');
      expect(matchPayload(payloadWithArrayOfObjects, matcher2)).toBe(true);
    });

    it("should return undefined for missing array in wildcard path", () => {
      const matcher = parseMatcherExpression('(has "missing.*.field" "value")');
      expect(matchPayload(samplePayload, matcher)).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    const githubPRPayload = {
      action: "opened",
      pull_request: {
        number: 123,
        title: "[Feature] Add new webhook support",
        state: "open",
        user: {
          login: "alice",
          type: "User",
        },
        labels: [
          { name: "feature", color: "blue" },
          { name: "high-priority", color: "red" },
        ],
        requested_reviewers: [{ login: "bob" }, { login: "charlie" }],
        base: {
          ref: "main",
        },
      },
      repository: {
        name: "dust",
        owner: {
          login: "dust-tt",
        },
      },
    };

    it("should match GitHub PR opened to main", () => {
      const matcher = parseMatcherExpression(
        '(and (eq "action" "opened") (eq "pull_request.base.ref" "main"))'
      );
      expect(matchPayload(githubPRPayload, matcher)).toBe(true);
    });

    it("should match PR with specific label", () => {
      const matcher = parseMatcherExpression(
        '(has "pull_request.labels.*.name" "feature")'
      );
      expect(matchPayload(githubPRPayload, matcher)).toBe(true);
    });

    it("should match PR with multiple required labels", () => {
      const matcher = parseMatcherExpression(
        '(has-all "pull_request.labels.*.name" ("feature" "high-priority"))'
      );
      expect(matchPayload(githubPRPayload, matcher)).toBe(true);
    });

    it("should match complex PR filter", () => {
      const matcher = parseMatcherExpression(
        '(and (eq "action" "opened") (eq "pull_request.base.ref" "main") (has "pull_request.labels.*.name" "high-priority"))'
      );
      expect(matchPayload(githubPRPayload, matcher)).toBe(true);
    });

    it("should match PR author and title pattern", () => {
      const matcher = parseMatcherExpression(
        '(and (eq "pull_request.user.login" "alice") (starts-with "pull_request.title" "[Feature]"))'
      );
      expect(matchPayload(githubPRPayload, matcher)).toBe(true);
    });

    it("should not match when conditions fail", () => {
      const matcher = parseMatcherExpression(
        '(and (eq "action" "opened") (has "pull_request.labels.*.name" "bug"))'
      );
      expect(matchPayload(githubPRPayload, matcher)).toBe(false);
    });
  });
});
