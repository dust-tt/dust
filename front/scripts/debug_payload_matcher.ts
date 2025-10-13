import {
  matchPayload,
  parseMatcherExpression,
} from "@app/lib/webhooks/payload_matcher";

// Example usage and test cases.
if (require.main === module) {
  // Test payload.
  const payload = {
    action: "opened",
    pr: {
      id: 1,
      author: "adrien@dust.tt",
      head: {
        ref: "feature/new-grammar",
      },
      changed_files: 25,
      reviewer: {
        email: "fabien@dust.tt",
      },
    },
    issue: {
      number: 42,
      state: "open",
      locked: false,
      milestone: { title: "v2.0" },
      metadata: {
        tags: [
          { name: "bug", id: 1 },
          { name: "feature", id: 2 },
          { name: "critical", id: 3 },
        ],
      },
    },
  };

  console.log("Payload:", JSON.stringify(payload, null, 2)); // eslint-disable-line no-console

  // Test cases for new grammar.
  const testCases = [
    {
      name: "Simple equality",
      filter: '(eq "action" "opened")',
      expected: true,
    },
    {
      name: "Numeric comparison",
      filter: '(gt "pr.changed_files" 20)',
      expected: true,
    },
    {
      name: "String starts-with",
      filter: '(starts-with "pr.head.ref" "feature/")',
      expected: true,
    },
    {
      name: "Field exists",
      filter: '(exists "issue.milestone")',
      expected: true,
    },
    {
      name: "Array has single value",
      filter: '(has "issue.metadata.tags.*.name" "bug")',
      expected: true,
    },
    {
      name: "Array has-all",
      filter: '(has-all "issue.metadata.tags.*.name" ("bug" "feature"))',
      expected: true,
    },
    {
      name: "Array has-any",
      filter: '(has-any "issue.metadata.tags.*.name" ("bug" "enhancement"))',
      expected: true,
    },
    {
      name: "Complex AND",
      filter: `(and
        (eq "action" "opened")
        (eq "issue.state" "open")
        (gt "pr.changed_files" 10))`,
      expected: true,
    },
    {
      name: "Complex OR with negation",
      filter: `(or
        (and
          (eq "action" "opened")
          (starts-with "pr.head.ref" "feature/"))
        (not (eq "issue.state" "closed")))`,
      expected: true,
    },
    {
      name: "Array of objects wildcard",
      filter: '(has-all "issue.metadata.tags.*.id" (1 2))',
      expected: true,
    },
    {
      name: "Boolean equality",
      filter: '(eq "issue.locked" false)',
      expected: true,
    },
    {
      name: "Should fail - wrong value",
      filter: '(eq "action" "closed")',
      expected: false,
    },
  ];

  console.log("\n--- Test Results ---\n"); // eslint-disable-line no-console

  let passed = 0;
  let failed = 0;

  testCases.forEach(({ name, filter, expected }) => {
    try {
      const matcher = parseMatcherExpression(filter);
      const result = matchPayload(payload, matcher);
      const status = result === expected ? "✓ PASS" : "✗ FAIL";

      if (result === expected) {
        passed++;
      } else {
        failed++;
      }

      console.log(`${status} ${name}`); // eslint-disable-line no-console
      if (result !== expected) {
        console.log(`  Expected: ${expected}, Got: ${result}`); // eslint-disable-line no-console
        console.log(`  Filter: ${filter}`); // eslint-disable-line no-console
      }
    } catch (err) {
      failed++;
      console.log(`✗ ERROR ${name}`); // eslint-disable-line no-console
      console.log(`  ${err instanceof Error ? err.message : "Unknown error"}`); // eslint-disable-line no-console
    }
  });

  console.log(`\n--- Summary ---`); // eslint-disable-line no-console
  console.log(`Passed: ${passed}/${testCases.length}`); // eslint-disable-line no-console
  console.log(`Failed: ${failed}/${testCases.length}`); // eslint-disable-line no-console
}
