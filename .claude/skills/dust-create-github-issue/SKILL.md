---
name: dust-create-github-issue
description: Create a well-formed GitHub issue on any repository. Use when the user asks to file, open, or log an issue. Covers duplicate checking, problem-first writing, and clean formatting — no filler, no noise.
---

# Create GitHub Issue

## Before creating

1. Confirm the target repository (`owner/repo`). If not provided, ask.
2. Search for existing open issues with relevant keywords to avoid duplicates. If a match is found, offer to comment on it instead of opening a new one.

## Title

Concise and descriptive. Assume the reader has context on the codebase. No filler words. Every word must carry information not derivable from another element of the issue.

## Body

Write problem-first: describe what the user is experiencing or requesting, not a proposed solution (unless one is explicitly provided).

- Every word must carry information not derivable from another element.
- If a root cause is included, clearly separate it from the problem description.
- Omit raw internal identifiers, stack traces, and retry state enums — include the error message and any relevant URL instead.
- If the issue originates from a thread, log, or ticket, include the source URL on its own line.
- Before writing each line, ask: does this help an engineer act faster, or is it just restating what a linked URL already shows?

## After creating

Always output the URL of the created issue.
